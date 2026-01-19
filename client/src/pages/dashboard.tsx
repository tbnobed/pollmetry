import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ThemeToggle } from "@/components/theme-toggle";
import { 
  ArrowLeft, Users, TrendingUp, AlertTriangle, 
  Loader2, Home, Globe, BarChart3, Activity, ClipboardList
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { connectSocket } from "@/lib/socket";
import type { Session, QuestionWithTally, VoteTally } from "@shared/schema";

interface MomentumPoint {
  time: string;
  votes: number;
  aligned?: number;
}

export default function Dashboard() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const sessionId = params.id;

  const [currentQuestion, setCurrentQuestion] = useState<QuestionWithTally | null>(null);
  const [segmentView, setSegmentView] = useState<"overall" | "room" | "remote">("overall");
  const [momentumData, setMomentumData] = useState<MomentumPoint[]>([]);
  const [votesPerSecond, setVotesPerSecond] = useState(0);
  const [integrityWarning, setIntegrityWarning] = useState(false);

  const { data: session, isLoading } = useQuery<Session>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
  });

  const { data: questions } = useQuery<QuestionWithTally[]>({
    queryKey: ["/api/sessions", sessionId, "questions"],
    enabled: !!sessionId,
    refetchInterval: 2000,
  });

  const { data: surveyStats } = useQuery<{ total: number; completed: number; inProgress: number }>({
    queryKey: ["/api/sessions", sessionId, "survey", "stats"],
    enabled: !!sessionId && session?.mode === "survey",
    refetchInterval: 5000,
  });

  const { data: surveyResults } = useQuery<{ results: Array<{ question: QuestionWithTally; tally: VoteTally }>; stats: any }>({
    queryKey: ["/api/sessions", sessionId, "survey", "results"],
    enabled: !!sessionId && session?.mode === "survey",
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!session) return;

    const socket = connectSocket();

    socket.on("connect", () => {
      socket.emit("pollster:join", { sessionId });
    });

    socket.on("session:current_question", (question: QuestionWithTally | null) => {
      setCurrentQuestion(question);
      setMomentumData([]);
    });

    socket.on("session:results", (data: { questionId: string; tally: VoteTally }) => {
      setCurrentQuestion((prev) => {
        if (prev && prev.id === data.questionId) {
          return { ...prev, tally: data.tally };
        }
        return prev;
      });

      setVotesPerSecond(data.tally.votesPerSecond || 0);
      setIntegrityWarning((data.tally.votesPerSecond || 0) > 50);

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      
      setMomentumData((prev) => {
        const newPoint: MomentumPoint = {
          time: timeStr,
          votes: data.tally.total,
        };
        
        if (session.broadcastDelaySeconds > 0) {
          const delayedTime = new Date(now.getTime() - session.broadcastDelaySeconds * 1000);
          const alignedTotal = prev.find(p => {
            const pTime = new Date(`1970-01-01T${p.time}`);
            return Math.abs(pTime.getTime() - delayedTime.getTime()) < 2000;
          })?.votes || 0;
          newPoint.aligned = alignedTotal;
        }

        const updated = [...prev, newPoint];
        if (updated.length > 150) {
          return updated.slice(-150);
        }
        return updated;
      });
    });

    socket.on("session:question_state", (data: { questionId: string; state: string; isRevealed: boolean; isFrozen: boolean }) => {
      setCurrentQuestion((prev) => {
        if (prev && prev.id === data.questionId) {
          return { ...prev, state: data.state as any, isRevealed: data.isRevealed, isFrozen: data.isFrozen };
        }
        return prev;
      });
    });

    socket.on("survey:completed", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "survey", "stats"] });
    });

    return () => {
      socket.off("connect");
      socket.off("session:current_question");
      socket.off("session:results");
      socket.off("session:question_state");
      socket.off("survey:completed");
      socket.disconnect();
    };
  }, [session, sessionId]);

  useEffect(() => {
    if (questions) {
      const liveQuestion = questions.find((q) => q.state === "LIVE");
      if (liveQuestion && (!currentQuestion || currentQuestion.id !== liveQuestion.id)) {
        fetch(`/api/questions/${liveQuestion.id}/tally`)
          .then(res => res.json())
          .then(tally => {
            setCurrentQuestion({ ...liveQuestion, tally });
            if (tally.total > 0) {
              const now = new Date();
              const timeStr = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
              setMomentumData([{ time: timeStr, votes: tally.total }]);
              setVotesPerSecond(tally.votesPerSecond || 0);
            } else {
              setMomentumData([]);
            }
          })
          .catch(() => {
            setCurrentQuestion(liveQuestion);
            setMomentumData([]);
          });
      } else if (!liveQuestion && currentQuestion) {
        setCurrentQuestion(null);
      }
    }
  }, [questions]);

  if (isLoading) {
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

  const tally = currentQuestion?.tally;
  const totalVotes = tally?.total || 0;
  const roomVotes = tally?.bySegment?.room || 0;
  const remoteVotes = tally?.bySegment?.remote || 0;

  const getOptionData = () => {
    if (!currentQuestion || !tally) return [];

    if (currentQuestion.type === "multiple_choice" && currentQuestion.optionsJson) {
      const options = currentQuestion.optionsJson as string[];
      return options.map((label, index) => {
        const optionKey = index.toString();
        let votes = 0;
        
        if (segmentView === "overall") {
          votes = tally.byOption?.[optionKey] || 0;
        } else if (segmentView === "room") {
          votes = tally.bySegmentAndOption?.room?.[optionKey] || 0;
        } else {
          votes = tally.bySegmentAndOption?.remote?.[optionKey] || 0;
        }

        const segmentTotal = segmentView === "overall" ? totalVotes : 
                            segmentView === "room" ? roomVotes : remoteVotes;
        const percentage = segmentTotal > 0 ? (votes / segmentTotal) * 100 : 0;

        return { label, votes, percentage };
      });
    }

    if (currentQuestion.type === "emoji") {
      const emojis = ["👍", "❤️", "😂", "😮", "😢", "👎"];
      return emojis.map((emoji) => {
        let votes = 0;
        if (segmentView === "overall") {
          votes = tally.byOption?.[emoji] || 0;
        } else if (segmentView === "room") {
          votes = tally.bySegmentAndOption?.room?.[emoji] || 0;
        } else {
          votes = tally.bySegmentAndOption?.remote?.[emoji] || 0;
        }
        const segmentTotal = segmentView === "overall" ? totalVotes : 
                            segmentView === "room" ? roomVotes : remoteVotes;
        const percentage = segmentTotal > 0 ? (votes / segmentTotal) * 100 : 0;
        return { label: emoji, votes, percentage };
      });
    }

    return [];
  };

  const optionData = getOptionData();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation(`/console/${sessionId}`)}
              data-testid="button-back-session"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src="/logo.png" alt="PollMetry.io" className="w-10 h-10 rounded-lg" />
            <div>
              <span className="font-semibold">{session.name}</span>
              <Badge variant="secondary" className="ml-2">Dashboard</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {session.mode === "survey" ? (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {surveyResults?.results && surveyResults.results.length > 0 ? (
                surveyResults.results.map(({ question, tally }, idx) => {
                  const totalVotes = tally?.total || 0;
                  return (
                    <Card key={question.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <Badge variant="secondary" className="mb-2">Q{idx + 1}</Badge>
                            <CardTitle className="text-lg">{question.prompt}</CardTitle>
                          </div>
                          <Badge variant="outline">{totalVotes} responses</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {question.type === "multiple_choice" && question.optionsJson && (
                          <div className="space-y-3">
                            {(question.optionsJson as string[]).map((label, optIdx) => {
                              const votes = tally?.byOption?.[optIdx.toString()] || 0;
                              const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                              return (
                                <div key={optIdx}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium text-sm">{label}</span>
                                    <span className="text-sm font-mono">
                                      {Math.round(percentage)}% ({votes})
                                    </span>
                                  </div>
                                  <div className="h-6 rounded bg-muted overflow-hidden">
                                    <div
                                      className="h-full bg-primary transition-all duration-300"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {question.type === "emoji" && (
                          <div className="flex flex-wrap gap-4 justify-center">
                            {["👍", "❤️", "😂", "😮", "😢", "👎"].map((emoji) => {
                              const votes = tally?.byOption?.[emoji] || 0;
                              const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                              return (
                                <div key={emoji} className="text-center">
                                  <div className="text-3xl mb-1">{emoji}</div>
                                  <div className="text-sm font-mono">{Math.round(percentage)}%</div>
                                  <div className="text-xs text-muted-foreground">({votes})</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {question.type === "slider" && tally && (
                          <div className="text-center py-4">
                            <div className="text-4xl font-bold font-mono mb-2">
                              {Math.round((tally as any).average || 0)}
                            </div>
                            <p className="text-muted-foreground text-sm">Average Value</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Card>
                  <CardContent className="pt-8 pb-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <ClipboardList className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">No Questions Yet</h2>
                    <p className="text-muted-foreground">
                      Add questions to your survey to see results here.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ClipboardList className="w-5 h-5" />
                    Survey Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="text-5xl font-bold font-mono">
                      {surveyStats?.completed || 0}
                    </div>
                    <p className="text-muted-foreground text-sm">Completed Surveys</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <div className="text-sm text-muted-foreground mb-1">In Progress</div>
                      <div className="text-xl font-bold font-mono">{surveyStats?.inProgress || 0}</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <div className="text-sm text-muted-foreground mb-1">Questions</div>
                      <div className="text-xl font-bold font-mono">{surveyResults?.results?.length || 0}</div>
                    </div>
                  </div>
                  <div className="pt-2">
                    <Badge 
                      variant={session.isActive ? "default" : "outline"} 
                      className={`w-full justify-center py-2 ${session.isActive ? "bg-green-600" : ""}`}
                    >
                      {session.isActive ? "Survey Open" : "Survey Closed"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : !currentQuestion || currentQuestion.state !== "LIVE" ? (
          <Card className="max-w-2xl mx-auto">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No Active Poll</h2>
              <p className="text-muted-foreground">
                Start a question from the session manager to see live results here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <Badge className="mb-2 bg-green-600 text-white">LIVE</Badge>
                      <CardTitle className="text-xl">{currentQuestion.prompt}</CardTitle>
                    </div>
                    <Tabs value={segmentView} onValueChange={(v) => setSegmentView(v as any)}>
                      <TabsList>
                        <TabsTrigger value="overall" data-testid="tab-overall">
                          <Users className="w-4 h-4 mr-2" />
                          Overall
                        </TabsTrigger>
                        <TabsTrigger value="room" data-testid="tab-room">
                          <Home className="w-4 h-4 mr-2" />
                          Room
                        </TabsTrigger>
                        <TabsTrigger value="remote" data-testid="tab-remote">
                          <Globe className="w-4 h-4 mr-2" />
                          Remote
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent>
                  {(currentQuestion.type === "multiple_choice" || currentQuestion.type === "emoji") && (
                    <div className="space-y-4">
                      {optionData.map((item, index) => (
                        <div key={index}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={currentQuestion.type === "emoji" ? "text-3xl" : "font-medium"}>
                              {item.label}
                            </span>
                            <div className="text-right">
                              <span className="text-2xl font-bold font-mono">
                                {Math.round(item.percentage)}%
                              </span>
                              <span className="text-muted-foreground text-sm ml-2">
                                ({item.votes})
                              </span>
                            </div>
                          </div>
                          <div className="h-12 rounded-lg bg-muted overflow-hidden relative">
                            <div
                              className="absolute inset-y-0 left-0 bg-primary transition-all duration-300"
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {currentQuestion.type === "slider" && tally && (
                    <div className="text-center py-8">
                      <div className="text-6xl font-bold font-mono mb-4">
                        {Math.round((tally as any).average || 0)}
                      </div>
                      <p className="text-muted-foreground">Average Value</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Momentum Chart
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    {momentumData.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={momentumData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis 
                            dataKey="time" 
                            tick={{ fontSize: 10 }}
                            className="fill-muted-foreground"
                          />
                          <YAxis 
                            tick={{ fontSize: 10 }}
                            className="fill-muted-foreground"
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "6px"
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="votes"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={false}
                            name="Total Votes"
                          />
                          {session.broadcastDelaySeconds > 0 && (
                            <Line
                              type="monotone"
                              dataKey="aligned"
                              stroke="hsl(var(--chart-2))"
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              dot={false}
                              name="Time-Aligned"
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        Waiting for votes...
                      </div>
                    )}
                  </div>
                  {session.broadcastDelaySeconds > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Dashed line shows votes time-shifted by {session.broadcastDelaySeconds}s broadcast delay
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Vote Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="text-5xl font-bold font-mono">{totalVotes}</div>
                    <p className="text-muted-foreground text-sm">Total Votes</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Home className="w-4 h-4" />
                        <span className="text-sm">Room</span>
                      </div>
                      <div className="text-2xl font-bold font-mono">{roomVotes}</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Globe className="w-4 h-4" />
                        <span className="text-sm">Remote</span>
                      </div>
                      <div className="text-2xl font-bold font-mono">{remoteVotes}</div>
                    </div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-sm">Votes/sec</span>
                    </div>
                    <div className="text-2xl font-bold font-mono">{votesPerSecond.toFixed(1)}</div>
                  </div>
                </CardContent>
              </Card>

              <Card className={integrityWarning ? "border-destructive border-2" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className={`w-5 h-5 ${integrityWarning ? "text-destructive" : ""}`} />
                    Integrity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {integrityWarning ? (
                    <div className="text-destructive text-sm">
                      High vote velocity detected ({votesPerSecond.toFixed(1)}/sec)
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      No anomalies detected
                    </div>
                  )}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Room votes</span>
                      <span className="font-mono">
                        {totalVotes > 0 ? ((roomVotes / totalVotes) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Remote votes</span>
                      <span className="font-mono">
                        {totalVotes > 0 ? ((remoteVotes / totalVotes) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
