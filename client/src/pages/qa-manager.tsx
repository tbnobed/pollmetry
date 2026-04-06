import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ArrowLeft, MessageSquare, Star, StarOff, X, Trash2, Users, Globe,
  Copy, QrCode, Loader2, Search, Radio, CheckCircle, Filter, RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { connectSocket, getSocket } from "@/lib/socket";
import { QRCodeSVG } from "qrcode.react";
import type { Session, AudienceMessage } from "@shared/schema";

export default function QAManager() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const sessionId = params.id || "";
  const { toast } = useToast();

  const [messages, setMessages] = useState<AudienceMessage[]>([]);
  const [filter, setFilter] = useState<"all" | "starred" | "active">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);

  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
  });

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
    if (!sessionId) return;

    const socket = connectSocket("room");
    
    socket.on("connect", () => {
      socket.emit("pollster:join", { sessionId });
    });

    socket.on("audience:new_message", (msg: AudienceMessage) => {
      setMessages(prev => [msg, ...prev]);
    });

    socket.on("session:viewer_count", (count: number) => {
      setConnectedCount(count);
    });

    return () => {
      socket.off("audience:new_message");
      socket.off("session:viewer_count");
    };
  }, [sessionId]);

  const toggleActiveMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const res = await apiRequest("PATCH", `/api/sessions/${sessionId}/activate`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
    },
  });

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
      toast({ title: "All messages cleared" });
    },
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Code copied!" });
  };

  const copyJoinLink = () => {
    const link = `${window.location.origin}/join/${session?.code}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Join link copied!" });
  };

  const filteredMessages = messages.filter(m => {
    if (filter === "starred") return m.isStarred;
    if (filter === "active") return !m.isDismissed;
    return true;
  }).filter(m => {
    if (!searchQuery.trim()) return true;
    return m.message.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const activeCount = messages.filter(m => !m.isDismissed).length;
  const starredCount = messages.filter(m => m.isStarred).length;
  const roomCount = messages.filter(m => m.segment === "room" && !m.isDismissed).length;
  const remoteCount = messages.filter(m => m.segment === "remote" && !m.isDismissed).length;

  const formatTime = (dateStr: string | Date) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Session not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/console")} data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                {session.name}
              </h1>
              <p className="text-xs text-muted-foreground">Q&A Session</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span data-testid="text-connected-count">{connectedCount} connected</span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Session Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-mono font-bold tracking-widest" data-testid="text-session-code">
                    {session.code}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => copyCode(session.code)} data-testid="button-copy-code">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setShowQR(!showQR)} data-testid="button-toggle-qr">
                      <QrCode className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {showQR && (
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <QRCodeSVG value={`${window.location.origin}/join/${session.code}`} size={180} />
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={copyJoinLink}
                  data-testid="button-copy-link"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy Join Link
                </Button>

                <Button
                  variant={session.isActive ? "destructive" : "default"}
                  className={`w-full ${session.isActive ? "" : "bg-green-600 hover:bg-green-700"}`}
                  onClick={() => toggleActiveMutation.mutate(!session.isActive)}
                  disabled={toggleActiveMutation.isPending}
                  data-testid="button-toggle-qa-active"
                >
                  {toggleActiveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Radio className="w-4 h-4 mr-2" />
                  )}
                  {session.isActive ? "Stop Accepting Questions" : "Start Accepting Questions"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold" data-testid="text-total-messages">{messages.length}</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold" data-testid="text-active-messages">{activeCount}</div>
                    <div className="text-xs text-muted-foreground">Active</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold" data-testid="text-starred-messages">{starredCount}</div>
                    <div className="text-xs text-muted-foreground">Starred</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold text-yellow-500" data-testid="text-connected-viewers">{connectedCount}</div>
                    <div className="text-xs text-muted-foreground">Viewers</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>Room: {roomCount}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    <span>Remote: {remoteCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {messages.length > 0 && (
              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={() => {
                  if (window.confirm("Clear all audience messages? This cannot be undone.")) {
                    clearAllMutation.mutate();
                  }
                }}
                disabled={clearAllMutation.isPending}
                data-testid="button-clear-all-messages"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All Messages
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1">
                <Button
                  variant={filter === "active" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("active")}
                  data-testid="button-filter-active"
                >
                  Active
                  {activeCount > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{activeCount}</Badge>}
                </Button>
                <Button
                  variant={filter === "starred" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("starred")}
                  data-testid="button-filter-starred"
                >
                  <Star className="w-3.5 h-3.5 mr-1" />
                  Starred
                  {starredCount > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{starredCount}</Badge>}
                </Button>
                <Button
                  variant={filter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("all")}
                  data-testid="button-filter-all"
                >
                  All
                </Button>
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                    data-testid="input-search-messages"
                  />
                </div>
              </div>
            </div>

            {!session.isActive && (
              <Card className="border-yellow-500/50 bg-yellow-500/5">
                <CardContent className="py-3 px-4">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
                    <Radio className="w-4 h-4" />
                    Q&A is currently closed. Open it to allow audience submissions.
                  </p>
                </CardContent>
              </Card>
            )}

            {filteredMessages.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="font-medium text-lg mb-1">
                    {messages.length === 0 ? "No messages yet" : "No messages match this filter"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {messages.length === 0
                      ? "Share the join code with your audience. Their questions will appear here in real time."
                      : "Try adjusting your filter or search query."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredMessages.map((msg) => (
                  <Card
                    key={msg.id}
                    className={`group transition-colors ${
                      msg.isDismissed ? "opacity-50" : msg.isStarred ? "border-yellow-500/50 bg-yellow-500/5" : ""
                    }`}
                    data-testid={`message-card-${msg.id}`}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm leading-relaxed" data-testid={`message-text-${msg.id}`}>{msg.message}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs h-5 px-2 gap-1">
                              {msg.segment === "room"
                                ? <><Users className="w-3 h-3" /> Room</>
                                : <><Globe className="w-3 h-3" /> Remote</>
                              }
                            </Badge>
                            <span>{formatTime(msg.createdAt)}</span>
                            {msg.isStarred && (
                              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                            )}
                            {msg.isDismissed && (
                              <Badge variant="outline" className="text-xs h-5 px-2">Dismissed</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => starMutation.mutate({ messageId: msg.id, isStarred: !msg.isStarred })}
                            data-testid={`button-star-${msg.id}`}
                          >
                            {msg.isStarred
                              ? <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              : <StarOff className="w-4 h-4 text-muted-foreground" />
                            }
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => dismissMutation.mutate({ messageId: msg.id, isDismissed: !msg.isDismissed })}
                            data-testid={`button-dismiss-${msg.id}`}
                          >
                            {msg.isDismissed
                              ? <RotateCcw className="w-4 h-4 text-muted-foreground" />
                              : <X className="w-4 h-4 text-muted-foreground" />
                            }
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              if (window.confirm("Delete this message permanently?")) {
                                deleteMutation.mutate(msg.id);
                              }
                            }}
                            data-testid={`button-delete-${msg.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
