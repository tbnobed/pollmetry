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
  Radio, Plus, ArrowLeft, Play, Square, Eye, EyeOff, Lock, RotateCcw, 
  Loader2, Copy, BarChart3, Trash2, GripVertical, CheckCircle, Clock, QrCode, Pencil
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { connectSocket, getSocket } from "@/lib/socket";
import { QRCodeSVG } from "qrcode.react";
import type { Session, Question, QuestionType, QuestionState } from "@shared/schema";

export default function SessionManager() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const sessionId = params.id;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType>("multiple_choice");
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [duration, setDuration] = useState<number | undefined>(undefined);

  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
  });

  const { data: questions, isLoading: questionsLoading, refetch: refetchQuestions } = useQuery<Question[]>({
    queryKey: ["/api/sessions", sessionId, "questions"],
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (!session) return;

    const socket = connectSocket();

    socket.on("connect", () => {
      socket.emit("pollster:join", { sessionId });
    });

    socket.on("session:question_state", () => {
      refetchQuestions();
    });

    return () => {
      socket.off("session:question_state");
      socket.disconnect();
    };
  }, [session, sessionId, refetchQuestions]);

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
      return new Promise((resolve) => setTimeout(resolve, 100));
    },
    onSuccess: () => {
      refetchQuestions();
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

  const copyJoinUrl = () => {
    if (session) {
      const url = `${window.location.origin}/join/${session.code}`;
      navigator.clipboard.writeText(url);
      toast({ title: "Join URL copied to clipboard" });
    }
  };

  const getStateBadge = (state: QuestionState) => {
    switch (state) {
      case "DRAFT":
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
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Radio className="w-5 h-5 text-primary-foreground" />
            </div>
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
                    Scan this code to join the session
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="bg-white p-4 rounded-lg">
                    <QRCodeSVG 
                      value={`${window.location.origin}/join/${session.code}`}
                      size={256}
                      level="H"
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-mono font-bold tracking-widest">{session.code}</p>
                    <p className="text-muted-foreground text-sm mt-1">
                      {window.location.origin}/join/{session.code}
                    </p>
                  </div>
                  <Button onClick={copyJoinUrl} variant="outline" className="w-full">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Join URL
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={copyJoinUrl} data-testid="button-copy-join-url">
              Copy Join URL
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation(`/dashboard/${sessionId}`)}
              data-testid="button-go-dashboard"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
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
                          {getStateBadge(question.state)}
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
                    {question.state === "DRAFT" && (
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
