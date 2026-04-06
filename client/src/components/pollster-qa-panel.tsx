import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageSquare, Star, StarOff, X, Trash2, Users, Globe, 
  ChevronDown, ChevronUp, Filter
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getSocket } from "@/lib/socket";
import type { AudienceMessage } from "@shared/schema";

interface PollsterQAPanelProps {
  sessionId: string;
}

export function PollsterQAPanel({ sessionId }: PollsterQAPanelProps) {
  const [messages, setMessages] = useState<AudienceMessage[]>([]);
  const [filter, setFilter] = useState<"all" | "starred" | "active">("active");
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: initialMessages } = useQuery<AudienceMessage[]>({
    queryKey: ["/api/sessions", sessionId, "messages"],
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  useEffect(() => {
    const socket = getSocket();

    const handleNewMessage = (msg: AudienceMessage) => {
      setMessages(prev => [msg, ...prev]);
      if (collapsed) {
        setUnreadCount(prev => prev + 1);
      }
    };

    socket.on("audience:new_message", handleNewMessage);

    return () => {
      socket.off("audience:new_message", handleNewMessage);
    };
  }, [collapsed]);

  const starMutation = useMutation({
    mutationFn: async ({ messageId, isStarred }: { messageId: string; isStarred: boolean }) => {
      const res = await apiRequest("PATCH", `/api/sessions/${sessionId}/messages/${messageId}/star`, { isStarred });
      return res.json();
    },
    onSuccess: (updated: AudienceMessage) => {
      setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ messageId, isDismissed }: { messageId: string; isDismissed: boolean }) => {
      const res = await apiRequest("PATCH", `/api/sessions/${sessionId}/messages/${messageId}/dismiss`, { isDismissed });
      return res.json();
    },
    onSuccess: (updated: AudienceMessage) => {
      setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("DELETE", `/api/sessions/${sessionId}/messages/${messageId}`, {});
    },
    onSuccess: (_, messageId) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/sessions/${sessionId}/messages`, {});
    },
    onSuccess: () => {
      setMessages([]);
    },
  });

  const filteredMessages = messages.filter(m => {
    if (filter === "starred") return m.isStarred;
    if (filter === "active") return !m.isDismissed;
    return true;
  });

  const activeCount = messages.filter(m => !m.isDismissed).length;

  const formatTime = (dateStr: string | Date) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (collapsed) {
    return (
      <Card 
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => { setCollapsed(false); setUnreadCount(0); }}
        data-testid="card-qa-collapsed"
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span className="font-medium text-sm">Audience Q&A</span>
              {(unreadCount > 0 || activeCount > 0) && (
                <Badge variant="default" className="text-xs">
                  {unreadCount > 0 ? `${unreadCount} new` : activeCount}
                </Badge>
              )}
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-qa-panel">
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquare className="w-4 h-4" />
            Audience Q&A
            {activeCount > 0 && (
              <Badge variant="secondary" className="text-xs">{activeCount}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => {
                  if (window.confirm("Clear all audience messages?")) {
                    clearAllMutation.mutate();
                  }
                }}
                data-testid="button-clear-messages"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setCollapsed(true)}
              data-testid="button-collapse-qa"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-1 mt-1">
          <Button
            variant={filter === "active" ? "default" : "ghost"}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setFilter("active")}
            data-testid="button-filter-active"
          >
            Active
          </Button>
          <Button
            variant={filter === "starred" ? "default" : "ghost"}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setFilter("starred")}
            data-testid="button-filter-starred"
          >
            <Star className="w-3 h-3 mr-1" />
            Starred
          </Button>
          <Button
            variant={filter === "all" ? "default" : "ghost"}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setFilter("all")}
            data-testid="button-filter-all"
          >
            All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-2">
        <div ref={scrollRef} className="space-y-2 max-h-[300px] overflow-y-auto">
          {filteredMessages.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-6">
              {messages.length === 0 
                ? "No messages yet. Audience questions will appear here in real time."
                : "No messages match this filter."
              }
            </div>
          ) : (
            filteredMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-2.5 rounded-lg border text-sm group transition-colors ${
                  msg.isDismissed ? "opacity-50 bg-muted/30" : msg.isStarred ? "border-yellow-500/50 bg-yellow-500/5" : "bg-card"
                }`}
                data-testid={`message-${msg.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 text-sm leading-relaxed">{msg.message}</p>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => starMutation.mutate({ messageId: msg.id, isStarred: !msg.isStarred })}
                      data-testid={`button-star-${msg.id}`}
                    >
                      {msg.isStarred 
                        ? <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                        : <StarOff className="w-3.5 h-3.5 text-muted-foreground" />
                      }
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => dismissMutation.mutate({ messageId: msg.id, isDismissed: !msg.isDismissed })}
                      data-testid={`button-dismiss-${msg.id}`}
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs h-4 px-1.5 gap-0.5">
                    {msg.segment === "room" 
                      ? <><Users className="w-2.5 h-2.5" /> Room</>
                      : <><Globe className="w-2.5 h-2.5" /> Remote</>
                    }
                  </Badge>
                  <span>{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
