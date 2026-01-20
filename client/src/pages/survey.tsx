import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ThemeToggle } from "@/components/theme-toggle";
import { CheckCircle2, Clock, Loader2, ClipboardList, ArrowRight, RefreshCw, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Session, Segment, QuestionType } from "@shared/schema";
import { v4 as uuidv4 } from "uuid";
import { connectSocket } from "@/lib/socket";

interface SurveyQuestion {
  id: string;
  order: number;
  type: QuestionType;
  prompt: string;
  optionsJson: string[] | null;
}

interface SurveyData {
  surveyId: string;
  questions: SurveyQuestion[];
  timeLimit: number | null;
}

type SurveyState = "start" | "in_progress" | "completed" | "thankyou";

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "👎"];

export default function Survey() {
  const params = useParams<{ code: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const code = params.code?.toUpperCase() || "";
  
  const searchParams = new URLSearchParams(search);
  const segmentParam = searchParams.get("segment");
  const segment: Segment = segmentParam === "room" ? "room" : "remote";

  const [surveyState, setSurveyState] = useState<SurveyState>("start");
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [sliderValue, setSliderValue] = useState(50);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [voterToken, setVoterToken] = useState<string>("");
  const [sessionClosed, setSessionClosed] = useState(false);
  const { toast } = useToast();

  const { data: session, isLoading, error } = useQuery<Session>({
    queryKey: ["/api/sessions/code", code],
    enabled: !!code,
  });

  const startSurveyMutation = useMutation({
    mutationFn: async (participantToken: string) => {
      const response = await apiRequest("POST", `/api/sessions/${session?.id}/survey/start`, {
        participantToken,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSurveyData(data);
      setSurveyState("in_progress");
      setCurrentQuestionIndex(0);
      if (data.timeLimit) {
        setTimeRemaining(data.timeLimit);
      }
    },
  });

  const submitVoteMutation = useMutation({
    mutationFn: async (data: { questionId: string; payload: any }) => {
      const response = await apiRequest("POST", `/api/sessions/${session?.id}/survey/vote`, {
        surveyId: surveyData?.surveyId,
        questionId: data.questionId,
        payload: data.payload,
        voterToken,
        segment,
      });
      return response.json();
    },
  });

  const completeSurveyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/sessions/${session?.id}/survey/complete`, {
        surveyId: surveyData?.surveyId,
      });
      return response.json();
    },
    onSuccess: () => {
      setSurveyState("thankyou");
    },
  });

  // Connect to socket for real-time session closed notifications
  useEffect(() => {
    if (!session) return;

    const socket = connectSocket(segment);
    
    socket.on("connect", () => {
      socket.emit("audience:join", { 
        code, 
        segment, 
        voterToken: voterToken || "survey-participant" 
      });
    });

    socket.on("session_closed", () => {
      setSessionClosed(true);
      toast({
        title: "Survey Closed",
        description: "This survey has been closed by the host.",
        variant: "destructive",
      });
    });

    return () => {
      socket.off("session_closed");
      socket.disconnect();
    };
  }, [session, code, segment, voterToken, toast]);

  const handleNextQuestionRef = useRef<() => Promise<void>>();

  const handleNextQuestion = useCallback(async () => {
    if (!surveyData) return;

    const currentQuestion = surveyData.questions[currentQuestionIndex];
    
    if (selectedOption !== null || currentQuestion.type === "slider") {
      let payload;
      if (currentQuestion.type === "slider") {
        payload = { value: sliderValue };
      } else if (currentQuestion.type === "emoji") {
        payload = { emoji: EMOJI_OPTIONS[selectedOption!] };
      } else {
        payload = { optionId: selectedOption };
      }
      
      await submitVoteMutation.mutateAsync({
        questionId: currentQuestion.id,
        payload,
      });
    }

    setSelectedOption(null);
    setSliderValue(50);

    if (currentQuestionIndex < surveyData.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      if (surveyData.timeLimit) {
        setTimeRemaining(surveyData.timeLimit);
      }
    } else {
      await completeSurveyMutation.mutateAsync();
    }
  }, [surveyData, currentQuestionIndex, selectedOption, sliderValue]);

  useEffect(() => {
    handleNextQuestionRef.current = handleNextQuestion;
  }, [handleNextQuestion]);

  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 1) {
          handleNextQuestionRef.current?.();
          return surveyData?.timeLimit || null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, surveyData?.timeLimit]);

  const handleStartSurvey = () => {
    const token = uuidv4();
    setVoterToken(token);
    startSurveyMutation.mutate(token);
  };

  const handleRestart = () => {
    setSurveyState("start");
    setSurveyData(null);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setSliderValue(50);
    setTimeRemaining(null);
    setVoterToken("");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <button 
              onClick={() => setLocation("/")}
              className="flex items-center gap-3"
              data-testid="button-back-home"
            >
              <img src="/logo.png" alt="PollMetry.io" className="w-10 h-10 rounded-lg" />
              <span className="text-xl font-semibold">PollMetry.io</span>
            </button>
            <ThemeToggle />
          </div>
        </header>
        <main className="container mx-auto px-4 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-destructive">Survey Not Found</CardTitle>
              <CardDescription>
                The survey code "{code}" doesn't exist or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <button
                onClick={() => setLocation("/")}
                className="text-primary hover:underline"
                data-testid="link-go-home"
              >
                Go back to home
              </button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!session.isActive) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <button 
              onClick={() => setLocation("/")}
              className="flex items-center gap-3"
              data-testid="button-back-home"
            >
              <img src="/logo.png" alt="PollMetry.io" className="w-10 h-10 rounded-lg" />
              <span className="text-xl font-semibold">PollMetry.io</span>
            </button>
            <ThemeToggle />
          </div>
        </header>
        <main className="container mx-auto px-4 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <ClipboardList className="w-8 h-8 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl">This survey is now closed</CardTitle>
              <CardDescription>
                Thank you for your interest. This survey is no longer accepting responses.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <button
                onClick={() => setLocation("/")}
                className="text-primary hover:underline"
                data-testid="link-go-home"
              >
                Go back to home
              </button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const currentQuestion = surveyData?.questions[currentQuestionIndex];
  const progress = surveyData 
    ? ((currentQuestionIndex + 1) / surveyData.questions.length) * 100 
    : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border shrink-0">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="PollMetry.io" className="w-8 h-8 rounded-lg" />
            <div>
              <span className="font-semibold">{session.name}</span>
              <Badge variant="default" className="ml-2 gap-1">
                <ClipboardList className="w-3 h-3" />
                Survey
              </Badge>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {/* Session Closed State */}
        {sessionClosed && (
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Survey Closed</CardTitle>
              <CardDescription>
                This survey has been closed by the host. Thank you for your interest.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                variant="outline"
                onClick={() => setLocation("/")}
                data-testid="button-return-home"
              >
                Return Home
              </Button>
            </CardContent>
          </Card>
        )}

        {surveyState === "start" && !sessionClosed && (
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <ClipboardList className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">{session.name}</CardTitle>
              <CardDescription>
                Take this quick survey to share your feedback
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              {session.questionTimeLimitSeconds && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>{session.questionTimeLimitSeconds}s per question</span>
                </div>
              )}
              <Button 
                size="lg" 
                onClick={handleStartSurvey}
                disabled={startSurveyMutation.isPending || sessionClosed}
                className="w-full"
                data-testid="button-start-survey"
              >
                {startSurveyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4 mr-2" />
                )}
                Start Survey
              </Button>
            </CardContent>
          </Card>
        )}

        {surveyState === "in_progress" && currentQuestion && surveyData && (
          <div className="max-w-lg w-full space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Question {currentQuestionIndex + 1} of {surveyData.questions.length}</span>
                {timeRemaining !== null && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {timeRemaining}s
                  </span>
                )}
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{currentQuestion.prompt}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentQuestion.type === "multiple_choice" && currentQuestion.optionsJson && (
                  <div className="space-y-2">
                    {currentQuestion.optionsJson.map((option, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedOption(index)}
                        className={`w-full p-4 rounded-lg border text-left transition-all ${
                          selectedOption === index
                            ? "border-primary bg-primary/10"
                            : "border-border hover-elevate"
                        }`}
                        data-testid={`option-${index}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selectedOption === index ? "border-primary bg-primary" : "border-muted-foreground"
                          }`}>
                            {selectedOption === index && (
                              <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                            )}
                          </div>
                          <span>{option}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {currentQuestion.type === "slider" && (
                  <div className="space-y-4 py-4">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sliderValue}
                      onChange={(e) => setSliderValue(parseInt(e.target.value))}
                      className="w-full"
                      data-testid="slider-input"
                    />
                    <div className="text-center text-2xl font-bold">{sliderValue}</div>
                  </div>
                )}

                {currentQuestion.type === "emoji" && (
                  <div className="flex flex-wrap justify-center gap-3">
                    {EMOJI_OPTIONS.map((emoji, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedOption(index)}
                        className={`text-5xl p-4 rounded-lg transition-all ${
                          selectedOption === index
                            ? "bg-primary/20 scale-125 ring-2 ring-primary"
                            : "hover:bg-muted hover:scale-110"
                        }`}
                        data-testid={`emoji-${index}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Button 
              size="lg" 
              onClick={handleNextQuestion}
              disabled={
                submitVoteMutation.isPending || 
                (currentQuestion.type !== "slider" && selectedOption === null)
              }
              className="w-full"
              data-testid="button-next-question"
            >
              {submitVoteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : currentQuestionIndex === surveyData.questions.length - 1 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Submit Survey
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Next Question
                </>
              )}
            </Button>
          </div>
        )}

        {surveyState === "thankyou" && (
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Thank You!</CardTitle>
              <CardDescription>
                Your responses have been recorded. Pass the device to the next participant.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                size="lg" 
                onClick={handleRestart}
                className="w-full"
                data-testid="button-restart-survey"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Start New Survey
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
