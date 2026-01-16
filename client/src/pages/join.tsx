import { useEffect, useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Radio, Users, Globe, Home, Loader2 } from "lucide-react";
import { VotingInterface } from "@/components/voting-interface";
import type { Session, QuestionWithTally, Segment } from "@shared/schema";
import { getSocket, connectSocket, setSegment } from "@/lib/socket";
import { getVoterToken, hashToken } from "@/lib/voter-token";

export default function Join() {
  const params = useParams<{ code: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const code = params.code?.toUpperCase() || "";
  
  const searchParams = new URLSearchParams(search);
  const segmentParam = searchParams.get("segment");
  const segment: Segment = segmentParam === "room" ? "room" : "remote";

  const [currentQuestion, setCurrentQuestion] = useState<QuestionWithTally | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const { data: session, isLoading, error } = useQuery<Session>({
    queryKey: ["/api/sessions/code", code],
    enabled: !!code,
  });

  useEffect(() => {
    if (!session) return;

    const socket = connectSocket(segment);
    const voterToken = getVoterToken();
    const tokenHash = hashToken(voterToken);

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("audience:join", { 
        code, 
        segment, 
        voterToken: tokenHash 
      });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("session:current_question", (question: QuestionWithTally | null) => {
      setCurrentQuestion(question);
      setHasVoted(false);
    });

    socket.on("session:question_state", (data: { questionId: string; state: string; isRevealed: boolean; isFrozen: boolean }) => {
      setCurrentQuestion(prev => {
        if (prev && prev.id === data.questionId) {
          return { ...prev, state: data.state as any, isRevealed: data.isRevealed, isFrozen: data.isFrozen };
        }
        return prev;
      });
    });

    socket.on("session:results", (data: { questionId: string; tally: any }) => {
      setCurrentQuestion(prev => {
        if (prev && prev.id === data.questionId) {
          return { ...prev, tally: data.tally };
        }
        return prev;
      });
    });

    socket.on("vote:confirmed", () => {
      setHasVoted(true);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("session:current_question");
      socket.off("session:question_state");
      socket.off("session:results");
      socket.off("vote:confirmed");
      socket.disconnect();
    };
  }, [session, code, segment]);

  const handleVote = (payload: any) => {
    const socket = getSocket();
    const voterToken = getVoterToken();
    const tokenHash = hashToken(voterToken);
    
    socket.emit("audience:vote", {
      questionId: currentQuestion?.id,
      payload,
      voterToken: tokenHash,
    });
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
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Radio className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold">LivePoll</span>
            </button>
            <ThemeToggle />
          </div>
        </header>
        <main className="container mx-auto px-4 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-destructive">Session Not Found</CardTitle>
              <CardDescription>
                The session code "{code}" doesn't exist or has expired.
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border shrink-0">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Radio className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <span className="font-semibold">{session.name}</span>
              <span className="text-muted-foreground text-sm ml-2 font-mono">#{code}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1">
              {segment === "room" ? (
                <>
                  <Home className="w-3 h-3" />
                  In-Room
                </>
              ) : (
                <>
                  <Globe className="w-3 h-3" />
                  Remote
                </>
              )}
            </Badge>
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-status-online" : "bg-status-offline"}`} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {!currentQuestion || currentQuestion.state !== "LIVE" ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <Card className="max-w-md w-full">
              <CardContent className="pt-8 pb-8 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Waiting for Poll</h2>
                <p className="text-muted-foreground">
                  The pollster will start a question soon. Stay tuned!
                </p>
                <div className="mt-4 flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <VotingInterface
            question={currentQuestion}
            hasVoted={hasVoted}
            onVote={handleVote}
            segment={segment}
          />
        )}
      </main>
    </div>
  );
}
