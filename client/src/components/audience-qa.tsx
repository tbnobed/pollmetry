import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Send, Check, Loader2, User } from "lucide-react";
import { getSocket } from "@/lib/socket";

interface AudienceQAProps {
  sessionId: string;
  voterTokenHash: string;
  isConnected: boolean;
  qaTopics?: string[] | null;
  onSegmentChange?: (segment: "room" | "remote") => void;
}

export function AudienceQA({ sessionId, voterTokenHash, isConnected, qaTopics, onSegmentChange }: AudienceQAProps) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<"room" | "remote">("remote");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSegmentChange = (seg: "room" | "remote") => {
    setSelectedSegment(seg);
    onSegmentChange?.(seg);
  };

  const handleSubmit = () => {
    if (!message.trim() || !name.trim() || isSending || !isConnected) return;
    if (qaTopics && qaTopics.length > 0 && !topic) return;

    setIsSending(true);
    const socket = getSocket();

    const parts: string[] = [];
    if (name.trim()) parts.push(`[Name: ${name.trim()}]`);
    if (selectedSegment) parts.push(`[${selectedSegment === "room" ? "In Person" : "Virtual"}]`);
    if (topic) parts.push(`[Topic: ${topic}]`);
    parts.push(message.trim());
    const fullMessage = parts.join(" ");

    socket.emit("audience:message", {
      sessionId,
      message: fullMessage,
      voterToken: voterTokenHash,
    });

    const onConfirm = () => {
      setIsSending(false);
      setSent(true);
      setMessage("");
      setTimeout(() => setSent(false), 4000);
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
      <div className="mt-6">
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-3"
          data-testid="button-open-qa"
        >
          <MessageSquare className="w-4 h-4" />
          Have a question or comment? <span className="text-xs opacity-60">(optional)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2 text-sm">
              <MessageSquare className="w-4 h-4" />
              Ask Rabbi a question!
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

          <p className="text-xs text-muted-foreground leading-relaxed">
            Please use this form to submit a question related to the themes of the show.
            Not all questions will be used, but every submission will be reviewed by our production team.
          </p>

          {sent ? (
            <div className="flex items-center gap-2 text-sm text-chart-2 py-4 justify-center">
              <Check className="w-4 h-4" />
              Sent! The host will see your question.
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="qa-widget-name" className="text-xs">Your Name</Label>
                <Input
                  id="qa-widget-name"
                  data-testid="input-qa-widget-name"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 100))}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Are you attending...</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={selectedSegment === "room" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    data-testid="button-widget-segment-room"
                    onClick={() => handleSegmentChange("room")}
                  >
                    <User className="w-3 h-3 mr-1" />
                    In Person
                  </Button>
                  <Button
                    type="button"
                    variant={selectedSegment === "remote" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    data-testid="button-widget-segment-remote"
                    onClick={() => handleSegmentChange("remote")}
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Virtual
                  </Button>
                </div>
              </div>

              {qaTopics && qaTopics.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Topic</Label>
                  <Select value={topic} onValueChange={setTopic}>
                    <SelectTrigger className="h-8 text-sm" data-testid="select-qa-widget-topic">
                      <SelectValue placeholder="Choose a topic..." />
                    </SelectTrigger>
                    <SelectContent>
                      {qaTopics.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="qa-widget-message" className="text-xs">Your Question</Label>
                <p className="text-[10px] text-muted-foreground">
                  Keep it clear and focused (1-3 sentences). May be edited for clarity.
                </p>
                <Textarea
                  id="qa-widget-message"
                  placeholder="Type your question..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                  className="min-h-[70px] text-sm resize-none"
                  data-testid="input-audience-message"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{message.length}/500</span>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!message.trim() || !name.trim() || (qaTopics && qaTopics.length > 0 && !topic) || isSending || !isConnected}
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
