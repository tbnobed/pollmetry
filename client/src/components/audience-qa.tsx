import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Send, Check, Loader2 } from "lucide-react";
import { getSocket } from "@/lib/socket";

interface AudienceQAProps {
  sessionId: string;
  voterTokenHash: string;
  isConnected: boolean;
}

export function AudienceQA({ sessionId, voterTokenHash, isConnected }: AudienceQAProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = () => {
    if (!message.trim() || isSending || !isConnected) return;

    setIsSending(true);
    const socket = getSocket();

    socket.emit("audience:message", {
      sessionId,
      message: message.trim(),
      voterToken: voterTokenHash,
    });

    const onConfirm = () => {
      setIsSending(false);
      setSent(true);
      setMessage("");
      setTimeout(() => setSent(false), 3000);
      socket.off("message:confirmed", onConfirm);
    };

    socket.on("message:confirmed", onConfirm);

    setTimeout(() => {
      setIsSending(false);
      socket.off("message:confirmed", onConfirm);
    }, 5000);
  };

  if (!expanded) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <Button
          onClick={() => setExpanded(true)}
          size="lg"
          className="rounded-full shadow-lg h-14 w-14 p-0"
          data-testid="button-open-qa"
        >
          <MessageSquare className="w-6 h-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80">
      <Card className="shadow-xl">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2 text-sm">
              <MessageSquare className="w-4 h-4" />
              Ask a Question
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground"
              onClick={() => setExpanded(false)}
              data-testid="button-close-qa"
            >
              ×
            </Button>
          </div>

          {sent ? (
            <div className="flex items-center gap-2 text-sm text-chart-2 py-4 justify-center">
              <Check className="w-4 h-4" />
              Sent! The host will see your question.
            </div>
          ) : (
            <>
              <Textarea
                placeholder="Type your question or comment..."
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                className="min-h-[80px] text-sm resize-none mb-2"
                data-testid="input-audience-message"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{message.length}/500</span>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!message.trim() || isSending || !isConnected}
                  data-testid="button-send-message"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-1" />
                  )}
                  Send
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
