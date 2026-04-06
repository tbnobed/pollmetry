import { useState, useEffect } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import { MessageSquare, Send, Check, Loader2, XCircle } from "lucide-react";
import type { Session, Segment } from "@shared/schema";
import { getSocket, connectSocket, setSegment } from "@/lib/socket";
import { getVoterToken, hashToken } from "@/lib/voter-token";

export default function QAJoin() {
  const params = useParams<{ code: string }>();
  const search = useSearch();
  const code = params.code?.toUpperCase() || "";

  const searchParams = new URLSearchParams(search);
  const segmentParam = searchParams.get("segment");
  const segment: Segment = segmentParam === "room" ? "room" : "remote";

  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);

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
        voterToken: tokenHash,
      });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("session:closed", () => {
      setSessionClosed(true);
    });

    setSegment(segment);

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("session:closed");
    };
  }, [session, code, segment]);

  const handleSubmit = () => {
    if (!message.trim() || isSending || !isConnected || !session) return;

    setIsSending(true);
    const socket = getSocket();
    const voterToken = getVoterToken();
    const tokenHash = hashToken(voterToken);

    socket.emit("audience:message", {
      sessionId: session.id,
      message: message.trim(),
      voterToken: tokenHash,
    });

    const onConfirm = () => {
      setIsSending(false);
      setSent(true);
      setMessage("");
      setSentCount(prev => prev + 1);
      setTimeout(() => setSent(false), 3000);
      socket.off("message:confirmed", onConfirm);
    };

    socket.on("message:confirmed", onConfirm);

    setTimeout(() => {
      setIsSending(false);
      socket.off("message:confirmed", onConfirm);
    }, 5000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Session Not Found</h2>
            <p className="text-muted-foreground">Check that you have the correct code and try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card py-3 px-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-semibold flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              {session.name}
            </h1>
            <p className="text-xs text-muted-foreground">Q&A Session</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {sessionClosed ? (
            <Card>
              <CardContent className="py-12 text-center">
                <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Q&A Has Ended</h2>
                <p className="text-muted-foreground">Thank you for participating!</p>
              </CardContent>
            </Card>
          ) : !session.isActive ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Q&A Not Open Yet</h2>
                <p className="text-muted-foreground">The host hasn't opened questions yet. Please wait...</p>
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto mt-4" />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="text-center mb-2">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 text-primary" />
                  <h2 className="text-xl font-semibold">Ask a Question</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Submit your question or comment to the host
                  </p>
                </div>

                {sent ? (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <Check className="w-12 h-12 text-green-500" />
                    <p className="font-medium text-lg">Question Submitted!</p>
                    <p className="text-sm text-muted-foreground">The host will see your question.</p>
                    {sentCount > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        You've submitted {sentCount} question{sentCount > 1 ? "s" : ""} this session
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <Textarea
                      placeholder="Type your question or comment..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                      className="min-h-[120px] text-base resize-none"
                      data-testid="input-qa-message"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{message.length}/500</span>
                      <Button
                        size="lg"
                        onClick={handleSubmit}
                        disabled={!message.trim() || isSending || !isConnected}
                        data-testid="button-send-qa-message"
                      >
                        {isSending ? (
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5 mr-2" />
                        )}
                        Submit Question
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
