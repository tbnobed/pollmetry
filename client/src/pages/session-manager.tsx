import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { 
  Plus, ArrowLeft, Play, Square, Eye, EyeOff, Lock, RotateCcw, 
  Loader2, Copy, BarChart3, Trash2, GripVertical, CheckCircle, Clock, QrCode, Pencil,
  Users, TrendingUp, Activity
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { connectSocket, getSocket } from "@/lib/socket";
import { QRCodeSVG } from "qrcode.react";
import type { Session, Question, QuestionType, QuestionState, VoteTally } from "@shared/schema";
import { Progress } from "@/components/ui/progress";
import { EMOJIS } from "@shared/schema";

export default function SessionManager() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const sessionId = params.id;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrSegment, setQrSegment] = useState<"room" | "remote">("room");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType>("multiple_choice");
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [tallies, setTallies] = useState<Record<string, VoteTally>>({});

  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
  });

  const { data: questions, isLoading: questionsLoading, refetch: refetchQuestions } = useQuery<Question[]>({
    queryKey: ["/api/sessions", sessionId, "questions"],
    enabled: !!sessionId,
  });

  const { data: surveyStats, refetch: refetchSurveyStats } = useQuery<{ total: number; completed: number; inProgress: number }>({
    queryKey: ["/api/sessions", sessionId, "survey", "stats"],
    enabled: !!sessionId && session?.mode === "survey",
    refetchInterval: 5000,
  });

  // Fetch initial tallies for all questions
  useEffect(() => {
    if (!questions || questions.length === 0) return;

    const fetchTallies = async () => {
      const newTallies: Record<string, VoteTally> = {};
      for (const q of questions) {
        try {
          const response = await fetch(`/api/sessions/${sessionId}/questions/${q.id}/tally`);
          if (response.ok) {
            newTallies[q.id] = await response.json();
          }
        } catch (e) {
          // Ignore errors
        }
      }
      setTallies(newTallies);
    };

    fetchTallies();
  }, [questions, sessionId]);

  useEffect(() => {
    if (!session) return;

    const socket = connectSocket();

    socket.on("connect", () => {
      socket.emit("pollster:join", { sessionId });
    });

    socket.on("session:question_state", () => {
      refetchQuestions();
    });

    // Listen for vote updates to update tallies in real-time
    socket.on("vote_update", (data: { questionId: string; tally: VoteTally }) => {
      setTallies(prev => ({ ...prev, [data.questionId]: data.tally }));
    });

    // Listen for survey progress updates (participant counts)
    socket.on("survey_progress", () => {
      refetchSurveyStats();
    });

    return () => {
      socket.off("session:question_state");
      socket.off("vote_update");
      socket.off("survey_progress");
      socket.disconnect();
    };
  }, [session, sessionId, refetchQuestions, refetchSurveyStats]);

  const createQuestionMutation = useMutation({
    mutationFn: async (data: { type: QuestionType; prompt: string; optionsJson?: string[]; durationSeconds?: number }) => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/questions`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "questions"] });
      setCreateDialogOpen(false);
      resetForm();
      toast({ title: "Question created" });
    },
    onError: () => {
      toast({ title: "Failed to create question", variant: "destructive" });
    },
  });

  const controlQuestionMutation = useMutation({
    mutationFn: async ({ questionId, action }: { questionId: string; action: string }) => {
      const socket = getSocket();
      socket.emit("pollster:control", { action, questionId });
      return new Promise<string>((resolve) => setTimeout(() => resolve(action), 300));
    },
    onSuccess: (action) => {
      refetchQuestions();
      const actionMessages: Record<string, string> = {
        reveal: "Results revealed",
        hide: "Results hidden",
        freeze: "Voting frozen",
        unfreeze: "Voting unfrozen",
        go_live: "Question is now live",
        close: "Question closed",
        reset: "Votes reset",
      };
      if (actionMessages[action]) {
        toast({ title: actionMessages[action] });
      }
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      await apiRequest("DELETE", `/api/sessions/${sessionId}/questions/${questionId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "questions"] });
      toast({ title: "Question deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete question", variant: "destructive" });
    },
  });

  const resetSurveyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/sessions/${sessionId}/survey/reset`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "survey", "stats"] });
      setTallies({});
      toast({ title: "Survey reset - all votes and progress cleared" });
    },
    onError: () => {
      toast({ title: "Failed to reset survey", variant: "destructive" });
    },
  });

  const editQuestionMutation = useMutation({
    mutationFn: async (data: { questionId: string; type: QuestionType; prompt: string; optionsJson?: string[]; durationSeconds?: number }) => {
      const { questionId, ...updates } = data;
      const response = await apiRequest("PUT", `/api/sessions/${sessionId}/questions/${questionId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "questions"] });
      setEditDialogOpen(false);
      setEditingQuestion(null);
      resetForm();
      toast({ title: "Question updated" });
    },
    onError: () => {
      toast({ title: "Failed to update question", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setQuestionType("multiple_choice");
    setQuestionPrompt("");
    setOptions(["", ""]);
    setDuration(undefined);
  };

  const handleCreateQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = {
      type: questionType,
      prompt: questionPrompt,
      durationSeconds: duration,
    };
    if (questionType === "multiple_choice") {
      data.optionsJson = options.filter(o => o.trim());
    }
    createQuestionMutation.mutate(data);
  };

  const openEditDialog = (question: Question) => {
    setEditingQuestion(question);
    setQuestionType(question.type);
    setQuestionPrompt(question.prompt);
    setOptions(question.optionsJson as string[] || ["", ""]);
    setDuration(question.durationSeconds || undefined);
    setEditDialogOpen(true);
  };

  const handleEditQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    const data: any = {
      questionId: editingQuestion.id,
      type: questionType,
      prompt: questionPrompt,
      durationSeconds: duration,
    };
    if (questionType === "multiple_choice") {
      data.optionsJson = options.filter(o => o.trim());
    }
    editQuestionMutation.mutate(data);
  };

  const addOption = () => {
    if (options.length < 6) {
      setOptions([...options, ""]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const copyCode = () => {
    if (session) {
      navigator.clipboard.writeText(session.code);
      toast({ title: "Code copied to clipboard" });
    }
  };


  const getStateBadge = (state: QuestionState, isSurveyMode: boolean = false) => {
    switch (state) {
      case "DRAFT":
        if (isSurveyMode) {
          return <Badge className="bg-chart-2 text-white">Active</Badge>;
        }
        return <Badge variant="secondary">Draft</Badge>;
      case "LIVE":
        return <Badge className="bg-chart-2 text-white">Live</Badge>;
      case "CLOSED":
        return <Badge variant="outline">Closed</Badge>;
    }
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Session not found</p>
            <Button onClick={() => setLocation("/console")} className="mt-4">
              Back to Console
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/console")}
              data-testid="button-back-console"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src="/logo.png" alt="PollMetry.io" className="w-10 h-10 rounded-lg" />
            <div>
              <span className="font-semibold">{session.name}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-muted-foreground text-sm font-mono">#{session.code}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyCode}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-show-qr">
                  <QrCode className="w-4 h-4 mr-2" />
                  QR Code
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Join QR Code</DialogTitle>
                  <DialogDescription>
                    Generate QR codes for room or remote audiences
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                  {/* Segment Selector */}
                  <div className="flex items-center gap-2 w-full justify-center">
                    <Button
                      variant={qrSegment === "room" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setQrSegment("room")}
                      data-testid="button-qr-room"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Room (In-Person)
                    </Button>
                    <Button
                      variant={qrSegment === "remote" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setQrSegment("remote")}
                      data-testid="button-qr-remote"
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Remote (Virtual)
                    </Button>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg">
                    <QRCodeSVG 
                      value={`${window.location.origin}/join/${session.code}?segment=${qrSegment}`}
                      size={256}
                      level="H"
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-mono font-bold tracking-widest">{session.code}</p>
                    <p className="text-muted-foreground text-sm mt-1">
                      {window.location.origin}/join/{session.code}?segment={qrSegment}
                    </p>
                    <Badge variant={qrSegment === "room" ? "default" : "secondary"} className="mt-2">
                      {qrSegment === "room" ? "In-Person Audience" : "Virtual Audience"}
                    </Badge>
                  </div>
                  <Button 
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/join/${session.code}?segment=${qrSegment}`);
                      toast({ title: `Copied ${qrSegment} join URL` });
                    }} 
                    variant="outline" 
                    className="w-full"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy {qrSegment === "room" ? "Room" : "Remote"} URL
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <div className="flex items-center">
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-r-none border-r-0"
                onClick={() => {
                  if (session) {
                    navigator.clipboard.writeText(`${window.location.origin}/join/${session.code}?segment=room`);
                    toast({ title: "Room join URL copied" });
                  }
                }}
                data-testid="button-copy-room-url"
              >
                <Users className="w-3 h-3 mr-1" />
                Room
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-l-none"
                onClick={() => {
                  if (session) {
                    navigator.clipboard.writeText(`${window.location.origin}/join/${session.code}?segment=remote`);
                    toast({ title: "Remote join URL copied" });
                  }
                }}
                data-testid="button-copy-remote-url"
              >
                <TrendingUp className="w-3 h-3 mr-1" />
                Remote
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/dashboard/${sessionId}`, "_blank")}
              data-testid="button-go-dashboard"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            {session?.mode === "survey" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (window.confirm("Are you sure you want to reset this survey? This will delete all votes and participant progress.")) {
                    resetSurveyMutation.mutate();
                  }
                }}
                disabled={resetSurveyMutation.isPending}
                data-testid="button-reset-survey"
              >
                {resetSurveyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Reset Survey
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex gap-6">
          {/* Left side - Questions */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Run of Show</h2>
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-question">
                <Plus className="w-4 h-4 mr-2" />
                Add Question
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Question</DialogTitle>
                <DialogDescription>Create a new poll question</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateQuestion} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Question Type</Label>
                  <Select value={questionType} onValueChange={(v) => setQuestionType(v as QuestionType)}>
                    <SelectTrigger data-testid="select-question-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                      <SelectItem value="slider">Slider (0-100)</SelectItem>
                      <SelectItem value="emoji">Emoji Reactions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Question Prompt</Label>
                  <Textarea
                    placeholder="Enter your question..."
                    value={questionPrompt}
                    onChange={(e) => setQuestionPrompt(e.target.value)}
                    required
                    className="min-h-[80px]"
                    data-testid="input-question-prompt"
                  />
                </div>

                {questionType === "multiple_choice" && (
                  <div className="space-y-2">
                    <Label>Options (2-6)</Label>
                    <div className="space-y-2">
                      {options.map((option, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            placeholder={`Option ${index + 1}`}
                            value={option}
                            onChange={(e) => updateOption(index, e.target.value)}
                            data-testid={`input-option-${index}`}
                          />
                          {options.length > 2 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeOption(index)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    {options.length < 6 && (
                      <Button type="button" variant="outline" size="sm" onClick={addOption}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Option
                      </Button>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Duration (optional, seconds)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={300}
                    placeholder="No timer"
                    value={duration || ""}
                    onChange={(e) => setDuration(e.target.value ? parseInt(e.target.value) : undefined)}
                    data-testid="input-duration"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createQuestionMutation.isPending}
                  data-testid="button-submit-question"
                >
                  {createQuestionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Add Question
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {questionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : questions && questions.length > 0 ? (
          <div className="space-y-4">
            {questions.map((question, index) => (
              <Card key={question.id} className={question.state === "LIVE" ? "border-chart-2 border-2" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground font-mono text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{question.prompt}</CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          {getStateBadge(question.state, session?.mode === "survey")}
                          <Badge variant="outline" className="capitalize">{question.type.replace("_", " ")}</Badge>
                          {question.isRevealed && <Badge variant="secondary"><Eye className="w-3 h-3 mr-1" />Revealed</Badge>}
                          {question.isFrozen && <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" />Frozen</Badge>}
                          {question.durationSeconds && (
                            <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{question.durationSeconds}s</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {question.type === "multiple_choice" && question.optionsJson && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(question.optionsJson as string[]).map((opt, i) => (
                        <Badge key={i} variant="outline">{opt}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {question.state === "DRAFT" && session?.mode === "survey" && (
                      <>
                        {!question.isRevealed ? (
                          <Button
                            size="sm"
                            onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "reveal" })}
                            data-testid={`button-reveal-${question.id}`}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Reveal
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "hide" })}
                            data-testid={`button-hide-${question.id}`}
                          >
                            <EyeOff className="w-4 h-4 mr-2" />
                            Hide
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(question)}
                          data-testid={`button-edit-${question.id}`}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteQuestionMutation.mutate(question.id)}
                          data-testid={`button-delete-${question.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </>
                    )}
                    {question.state === "DRAFT" && session?.mode !== "survey" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "go_live" })}
                          data-testid={`button-go-live-${question.id}`}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Go Live
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(question)}
                          data-testid={`button-edit-${question.id}`}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteQuestionMutation.mutate(question.id)}
                          data-testid={`button-delete-${question.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </>
                    )}
                    {question.state === "LIVE" && (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "close" })}
                          data-testid={`button-close-${question.id}`}
                        >
                          <Square className="w-4 h-4 mr-2" />
                          Close
                        </Button>
                        {!question.isRevealed ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "reveal" })}
                            data-testid={`button-reveal-${question.id}`}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Reveal
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "hide" })}
                            data-testid={`button-hide-${question.id}`}
                          >
                            <EyeOff className="w-4 h-4 mr-2" />
                            Hide
                          </Button>
                        )}
                        {!question.isFrozen ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "freeze" })}
                            data-testid={`button-freeze-${question.id}`}
                          >
                            <Lock className="w-4 h-4 mr-2" />
                            Freeze
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "unfreeze" })}
                            data-testid={`button-unfreeze-${question.id}`}
                          >
                            <Lock className="w-4 h-4 mr-2" />
                            Unfreeze
                          </Button>
                        )}
                      </>
                    )}
                    {question.state === "CLOSED" && (
                      <>
                        {!question.isRevealed ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "reveal" })}
                            data-testid={`button-reveal-closed-${question.id}`}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Reveal
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "hide" })}
                            data-testid={`button-hide-closed-${question.id}`}
                          >
                            <EyeOff className="w-4 h-4 mr-2" />
                            Hide
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => controlQuestionMutation.mutate({ questionId: question.id, action: "reset" })}
                          data-testid={`button-reset-${question.id}`}
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Reset
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No Questions Yet</h2>
              <p className="text-muted-foreground mb-4">
                Add questions to your run of show
              </p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-add-first-question">
                <Plus className="w-4 h-4 mr-2" />
                Add Question
              </Button>
            </CardContent>
          </Card>
        )}
        </div>

          {/* Right side - Live Stats Panel */}
          <div className="w-[420px] shrink-0 hidden lg:block">
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="w-5 h-5" />
                  Live Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
                {/* Survey Stats (for survey mode) */}
                {session?.mode === "survey" && surveyStats && (
                  <div className="space-y-2 pb-2 border-b">
                    <h4 className="text-sm font-medium text-muted-foreground">Participants</h4>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" /> Active
                      </span>
                      <span className="font-semibold text-chart-2">
                        {surveyStats.inProgress}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Completed
                      </span>
                      <span className="font-semibold text-chart-1">
                        {surveyStats.completed}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total Started</span>
                      <span className="font-medium">
                        {surveyStats.total}
                      </span>
                    </div>
                  </div>
                )}

                {/* Session Overview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Votes</span>
                    <span className="font-semibold">
                      {Object.values(tallies).reduce((sum, t) => sum + (t?.total || 0), 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" /> Room
                    </span>
                    <span className="font-medium">
                      {Object.values(tallies).reduce((sum, t) => sum + (t?.bySegment?.room || 0), 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Remote
                    </span>
                    <span className="font-medium">
                      {Object.values(tallies).reduce((sum, t) => sum + (t?.bySegment?.remote || 0), 0)}
                    </span>
                  </div>
                </div>

                {/* Per-Question Stats */}
                {questions && questions.length > 0 && (
                  <div className="pt-2 border-t">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">By Question</h4>
                    <div className="grid grid-cols-2 gap-2">
                    {questions.map((q, index) => {
                      const tally = tallies[q.id];
                      const total = tally?.total || 0;
                      const options = q.optionsJson || [];
                      
                      return (
                        <div 
                          key={q.id} 
                          className={`p-3 rounded-lg border ${q.state === "LIVE" ? "border-chart-2 bg-chart-2/5" : "bg-muted/30"}`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-mono">
                              {index + 1}
                            </span>
                            <span className="text-sm font-medium truncate flex-1" title={q.prompt}>
                              {q.prompt.length > 25 ? q.prompt.slice(0, 25) + "..." : q.prompt}
                            </span>
                            {q.state === "LIVE" && (
                              <Badge variant="default" className="text-xs">LIVE</Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-muted-foreground">{total} votes</span>
                            {tally?.votesPerSecond !== undefined && tally.votesPerSecond > 0 && (
                              <span className="text-chart-2">{tally.votesPerSecond.toFixed(1)}/sec</span>
                            )}
                          </div>

                          {/* Results visualization based on question type */}
                          {q.type === "multiple_choice" && options.length > 0 && total > 0 && (
                            <div className="space-y-1">
                              {options.map((opt: string, i: number) => {
                                const count = tally?.byOption?.[i.toString()] || 0;
                                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                return (
                                  <div key={i} className="flex items-center gap-2">
                                    <div className="flex-1">
                                      <div className="flex justify-between text-xs mb-0.5">
                                        <span className="truncate max-w-[100px]" title={opt}>{opt}</span>
                                        <span className="font-medium">{pct}%</span>
                                      </div>
                                      <Progress value={pct} className="h-1.5" />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {q.type === "slider" && total > 0 && (
                            <div className="text-center">
                              <div className="text-2xl font-bold">
                                {(tally as any)?.average?.toFixed(1) || "0"}
                              </div>
                              <div className="text-xs text-muted-foreground">Average (0-100)</div>
                            </div>
                          )}

                          {q.type === "emoji" && total > 0 && tally?.byOption && (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(tally.byOption).map(([emoji, count]) => (
                                <Badge key={emoji} variant="secondary" className="text-sm">
                                  {emoji} {count}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {total === 0 && (
                            <div className="text-xs text-muted-foreground text-center py-2">
                              No votes yet
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                )}

                {(!questions || questions.length === 0) && (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    Add questions to see live stats
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setEditingQuestion(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
            <DialogDescription>Update this poll question</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditQuestion} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Question Type</Label>
              <Select value={questionType} onValueChange={(v) => setQuestionType(v as QuestionType)}>
                <SelectTrigger data-testid="select-edit-question-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                  <SelectItem value="slider">Slider (0-100)</SelectItem>
                  <SelectItem value="emoji">Emoji Reactions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Question Prompt</Label>
              <Textarea
                placeholder="Enter your question..."
                value={questionPrompt}
                onChange={(e) => setQuestionPrompt(e.target.value)}
                required
                className="min-h-[80px]"
                data-testid="input-edit-question-prompt"
              />
            </div>

            {questionType === "multiple_choice" && (
              <div className="space-y-2">
                <Label>Options (2-6)</Label>
                <div className="space-y-2">
                  {options.map((option, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder={`Option ${index + 1}`}
                        value={option}
                        onChange={(e) => updateOption(index, e.target.value)}
                        data-testid={`input-edit-option-${index}`}
                      />
                      {options.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOption(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {options.length < 6 && (
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Option
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Duration (optional, seconds)</Label>
              <Input
                type="number"
                min={5}
                max={300}
                placeholder="No timer"
                value={duration || ""}
                onChange={(e) => setDuration(e.target.value ? parseInt(e.target.value) : undefined)}
                data-testid="input-edit-duration"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={editQuestionMutation.isPending}
              data-testid="button-submit-edit-question"
            >
              {editQuestionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
