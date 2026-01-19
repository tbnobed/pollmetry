import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { Plus, BarChart3, Settings, Loader2, Copy, ExternalLink, LogOut, Users, Trash2, ClipboardList, Radio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, clearAuthToken } from "@/lib/queryClient";
import type { Session, SessionMode } from "@shared/schema";

type SessionWithCreator = Session & { creatorUsername?: string };

export default function Console() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [sessionMode, setSessionMode] = useState<SessionMode>("live");
  const [broadcastDelay, setBroadcastDelay] = useState(0);
  const [questionTimeLimit, setQuestionTimeLimit] = useState<number | undefined>(undefined);

  const { data: user, isLoading: userLoading } = useQuery<{ id: string; username: string; isAdmin: boolean }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery<SessionWithCreator[]>({
    queryKey: ["/api/sessions"],
    enabled: !!user,
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      mode: SessionMode;
      broadcastDelaySeconds: number;
      questionTimeLimitSeconds?: number;
    }) => {
      const response = await apiRequest("POST", "/api/sessions", data);
      return response.json();
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setCreateDialogOpen(false);
      setSessionName("");
      setSessionMode("live");
      setBroadcastDelay(0);
      setQuestionTimeLimit(undefined);
      toast({ title: "Session created", description: `Code: ${session.code}` });
      setLocation(`/console/${session.id}`);
    },
    onError: () => {
      toast({ title: "Failed to create session", variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout", {});
    },
    onSuccess: () => {
      clearAuthToken();
      queryClient.clear();
      setLocation("/");
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiRequest("DELETE", `/api/sessions/${sessionId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({ title: "Session deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete session", variant: "destructive" });
    },
  });

  const toggleSessionActiveMutation = useMutation({
    mutationFn: async ({ sessionId, isActive }: { sessionId: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/sessions/${sessionId}/activate`, { isActive });
      return response.json();
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({ 
        title: isActive ? "Survey is now open" : "Survey is now closed",
        description: isActive ? "Participants can now submit responses" : "No more responses can be submitted"
      });
    },
    onError: () => {
      toast({ title: "Failed to update session", variant: "destructive" });
    },
  });

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    createSessionMutation.mutate({ 
      name: sessionName, 
      mode: sessionMode,
      broadcastDelaySeconds: broadcastDelay,
      questionTimeLimitSeconds: sessionMode === "survey" ? questionTimeLimit : undefined,
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Code copied to clipboard" });
  };

  useEffect(() => {
    if (!userLoading && !user) {
      setLocation("/login");
    }
  }, [userLoading, user, setLocation]);

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="PollMetry.io" className="w-10 h-10 rounded-lg" />
            <div>
              <span className="text-xl font-semibold">PollMetry.io</span>
              <Badge variant="secondary" className="ml-2">Console</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm hidden md:block">
              Welcome, {user.username}
            </span>
            {user.isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/admin")}
                data-testid="button-admin"
              >
                <Users className="w-4 h-4 mr-2" />
                Manage Pollsters
              </Button>
            )}
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              data-testid="button-logout"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Your Sessions</h1>
            <p className="text-muted-foreground mt-1">Manage your polling sessions</p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-session">
                <Plus className="w-4 h-4 mr-2" />
                Create Session
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Session</DialogTitle>
                <DialogDescription>
                  Set up a new polling session for your audience
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateSession} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="sessionName">Session Name</Label>
                  <Input
                    id="sessionName"
                    placeholder="e.g., Town Hall Q1 2024"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    required
                    data-testid="input-session-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Session Type</Label>
                  <Select
                    value={sessionMode}
                    onValueChange={(value: SessionMode) => setSessionMode(value)}
                  >
                    <SelectTrigger data-testid="select-session-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">
                        <div className="flex items-center gap-2">
                          <Radio className="w-4 h-4" />
                          <span>Live Polling</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="survey">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="w-4 h-4" />
                          <span>Survey Mode</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {sessionMode === "live" 
                      ? "Real-time polling where you control when questions go live" 
                      : "Self-paced survey where participants answer all questions sequentially"}
                  </p>
                </div>
                {sessionMode === "live" && (
                  <div className="space-y-2">
                    <Label htmlFor="broadcastDelay">Broadcast Delay (seconds)</Label>
                    <Input
                      id="broadcastDelay"
                      type="number"
                      min={0}
                      max={300}
                      placeholder="0"
                      value={broadcastDelay}
                      onChange={(e) => setBroadcastDelay(parseInt(e.target.value) || 0)}
                      data-testid="input-broadcast-delay"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used for time-aligned analytics on the dashboard
                    </p>
                  </div>
                )}
                {sessionMode === "survey" && (
                  <div className="space-y-2">
                    <Label htmlFor="questionTimeLimit">Time Limit per Question (seconds)</Label>
                    <Input
                      id="questionTimeLimit"
                      type="number"
                      min={0}
                      max={600}
                      placeholder="No limit"
                      value={questionTimeLimit ?? ""}
                      onChange={(e) => setQuestionTimeLimit(e.target.value ? parseInt(e.target.value) : undefined)}
                      data-testid="input-question-time-limit"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty for no time limit. Participants will auto-advance when time expires.
                    </p>
                  </div>
                )}
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={createSessionMutation.isPending}
                  data-testid="button-submit-session"
                >
                  {createSessionMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Create Session
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {sessionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : sessions && sessions.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((session) => (
              <Card key={session.id} className="hover-elevate">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{session.name}</CardTitle>
                        <Badge variant={session.mode === "survey" ? "default" : "secondary"}>
                          {session.mode === "survey" ? (
                            <><ClipboardList className="w-3 h-3 mr-1" />Survey</>
                          ) : (
                            <><Radio className="w-3 h-3 mr-1" />Live</>
                          )}
                        </Badge>
                        {session.mode === "survey" && (
                          <Badge variant={session.isActive ? "default" : "outline"} className={session.isActive ? "bg-green-600" : ""}>
                            {session.isActive ? "Open" : "Closed"}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">
                        Created {new Date(session.createdAt).toLocaleDateString()}
                        {user?.isAdmin && session.creatorUsername && (
                          <span className="block text-xs">by {session.creatorUsername}</span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-mono font-bold tracking-widest">
                        {session.code}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyCode(session.code)}
                        data-testid={`button-copy-code-${session.id}`}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {session.mode === "survey" && (
                    <Button
                      variant={session.isActive ? "outline" : "default"}
                      className={`w-full ${session.isActive ? "" : "bg-green-600 hover:bg-green-700"}`}
                      onClick={() => toggleSessionActiveMutation.mutate({ 
                        sessionId: session.id, 
                        isActive: !session.isActive 
                      })}
                      disabled={toggleSessionActiveMutation.isPending}
                      data-testid={`button-toggle-active-${session.id}`}
                    >
                      {toggleSessionActiveMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : session.isActive ? (
                        <Radio className="w-4 h-4 mr-2" />
                      ) : (
                        <Radio className="w-4 h-4 mr-2" />
                      )}
                      {session.isActive ? "Close Survey" : "Open Survey"}
                    </Button>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      className="flex-1"
                      onClick={() => setLocation(`/console/${session.id}`)}
                      data-testid={`button-manage-${session.id}`}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Manage
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => window.open(`/dashboard/${session.id}`, "_blank")}
                      data-testid={`button-dashboard-${session.id}`}
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Dashboard
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      className="flex-1"
                      onClick={() => window.open(`/overlay/${session.code}`, "_blank")}
                      data-testid={`button-overlay-${session.id}`}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Overlay
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this session? This will also delete all questions and votes.")) {
                          deleteSessionMutation.mutate(session.id);
                        }
                      }}
                      data-testid={`button-delete-session-${session.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No Sessions Yet</h2>
              <p className="text-muted-foreground mb-4">
                Create your first polling session to get started
              </p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-session">
                <Plus className="w-4 h-4 mr-2" />
                Create Session
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
