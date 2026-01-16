import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { insertUserSchema, insertSessionSchema, insertQuestionSchema, type QuestionState } from "@shared/schema";
import { createHash, randomBytes } from "crypto";

const authTokens = new Map<string, { userId: string; expiresAt: number }>();

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const token = authHeader.substring(7);
  const session = authTokens.get(token);
  
  if (!session || session.expiresAt < Date.now()) {
    authTokens.delete(token);
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  (req as any).userId = session.userId;
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const existingAdmin = await storage.getUserByUsername("admin");
  if (!existingAdmin) {
    await storage.createUser({
      username: "admin",
      password: hashPassword("admin123"),
    });
    console.log("Admin account created: admin / admin123");
  }

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
      }

      const user = await storage.getUserByUsername(parsed.data.username);
      if (!user || user.password !== hashPassword(parsed.data.password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = generateToken();
      authTokens.set(token, {
        userId: user.id,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });

      res.json({ id: user.id, username: user.username, token });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      authTokens.delete(token);
    }
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const token = authHeader.substring(7);
    const session = authTokens.get(token);
    
    if (!session || session.expiresAt < Date.now()) {
      authTokens.delete(token);
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const user = await storage.getUser(session.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    res.json({ id: user.id, username: user.username });
  });

  app.post("/api/sessions", requireAuth, async (req, res) => {
    try {
      const parsed = insertSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
      }

      const session = await storage.createSession(parsed.data, (req as any).userId);
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sessions", requireAuth, async (req, res) => {
    try {
      const sessions = await storage.getSessionsByUser((req as any).userId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sessions/code/:code", async (req, res) => {
    try {
      const session = await storage.getSessionByCode(req.params.code);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/sessions/:sessionId/questions", requireAuth, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.createdById !== (req as any).userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      const question = await storage.createQuestion({
        sessionId: req.params.sessionId,
        type: req.body.type,
        prompt: req.body.prompt,
        optionsJson: req.body.optionsJson,
        durationSeconds: req.body.durationSeconds,
        order: 0,
      });
      res.json(question);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sessions/:sessionId/questions", async (req, res) => {
    try {
      const questions = await storage.getQuestionsBySession(req.params.sessionId);
      res.json(questions);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/sessions/:sessionId/questions/:questionId", requireAuth, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.createdById !== (req as any).userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      const question = await storage.getQuestion(req.params.questionId);
      if (!question || question.sessionId !== req.params.sessionId) {
        return res.status(404).json({ error: "Question not found" });
      }

      const updates: any = {};
      if (req.body.prompt !== undefined) updates.prompt = req.body.prompt;
      if (req.body.optionsJson !== undefined) updates.optionsJson = req.body.optionsJson;
      if (req.body.type !== undefined) updates.type = req.body.type;
      if (req.body.durationSeconds !== undefined) updates.durationSeconds = req.body.durationSeconds;

      const updated = await storage.updateQuestion(req.params.questionId, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/sessions/:sessionId/questions/:questionId", requireAuth, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.createdById !== (req as any).userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      await storage.deleteQuestion(req.params.questionId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/questions/:questionId/tally", async (req, res) => {
    try {
      const tally = await storage.getVoteTally(req.params.questionId);
      res.json(tally);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sessions/:sessionId/results", async (req, res) => {
    try {
      const questions = await storage.getQuestionsBySession(req.params.sessionId);
      const liveQuestion = questions.find((q) => q.state === "LIVE");
      
      if (!liveQuestion) {
        return res.json({ question: null, tally: null });
      }
      
      const tally = await storage.getVoteTally(liveQuestion.id);
      res.json({ question: liveQuestion, tally });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sessions/:code/overlay", async (req, res) => {
    try {
      const session = await storage.getSessionByCode(req.params.code);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const questions = await storage.getQuestionsBySession(session.id);
      const liveQuestion = questions.find((q) => q.state === "LIVE");

      let resultsOverall = null;
      let resultsBySegment = null;

      if (liveQuestion) {
        const tally = await storage.getVoteTally(liveQuestion.id);
        resultsOverall = {
          total: tally.total,
          byOption: tally.byOption,
        };
        resultsBySegment = tally.bySegmentAndOption;
      }

      res.json({
        session: { id: session.id, name: session.name, code: session.code },
        question: liveQuestion || null,
        state: liveQuestion?.state || null,
        resultsOverall,
        resultsBySegment,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const sessionRooms = new Map<string, Set<string>>();
  const pollsterRooms = new Map<string, Set<string>>();

  io.on("connection", (socket) => {
    let currentRoom: string | null = null;
    let currentSessionId: string | null = null;
    let isPollster = false;

    socket.on("audience:join", async (data: { code: string; segment: string; voterToken: string }) => {
      const session = await storage.getSessionByCode(data.code);
      if (!session) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      currentRoom = `session:${session.id}`;
      currentSessionId = session.id;
      socket.join(currentRoom);

      if (!sessionRooms.has(session.id)) {
        sessionRooms.set(session.id, new Set());
      }
      sessionRooms.get(session.id)!.add(socket.id);

      const questions = await storage.getQuestionsBySession(session.id);
      const liveQuestion = questions.find((q) => q.state === "LIVE");
      
      if (liveQuestion) {
        const tally = await storage.getVoteTally(liveQuestion.id);
        socket.emit("session:current_question", { ...liveQuestion, tally });
      } else {
        socket.emit("session:current_question", null);
      }
    });

    socket.on("pollster:join", async (data: { sessionId: string }) => {
      currentRoom = `session:${data.sessionId}`;
      currentSessionId = data.sessionId;
      isPollster = true;
      socket.join(currentRoom);
      socket.join(`pollster:${data.sessionId}`);

      if (!pollsterRooms.has(data.sessionId)) {
        pollsterRooms.set(data.sessionId, new Set());
      }
      pollsterRooms.get(data.sessionId)!.add(socket.id);

      const questions = await storage.getQuestionsBySession(data.sessionId);
      const liveQuestion = questions.find((q) => q.state === "LIVE");
      
      if (liveQuestion) {
        const tally = await storage.getVoteTally(liveQuestion.id);
        socket.emit("session:current_question", { ...liveQuestion, tally });
        socket.emit("session:results", { questionId: liveQuestion.id, tally });
      } else {
        socket.emit("session:current_question", null);
      }
    });

    socket.on("overlay:join", async (data: { code: string }) => {
      const session = await storage.getSessionByCode(data.code);
      if (!session) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      currentRoom = `session:${session.id}`;
      currentSessionId = session.id;
      socket.join(currentRoom);

      const questions = await storage.getQuestionsBySession(session.id);
      const liveQuestion = questions.find((q) => q.state === "LIVE");
      
      if (liveQuestion) {
        const tally = await storage.getVoteTally(liveQuestion.id);
        socket.emit("session:current_question", { ...liveQuestion, tally });
      } else {
        socket.emit("session:current_question", null);
      }
    });

    socket.on("audience:vote", async (data: { questionId: string; payload: any; voterToken: string }) => {
      const question = await storage.getQuestion(data.questionId);
      if (!question || question.state !== "LIVE" || question.isFrozen) {
        socket.emit("error", { message: "Cannot vote on this question" });
        return;
      }

      if (question.type !== "emoji") {
        const hasVoted = await storage.hasVoted(data.questionId, data.voterToken);
        if (hasVoted) {
          socket.emit("error", { message: "Already voted" });
          return;
        }
      }

      const segment = (socket.handshake.query.segment as string) || "remote";

      await storage.createVoteEvent({
        sessionId: question.sessionId,
        questionId: data.questionId,
        voterTokenHash: data.voterToken,
        segment: segment as any,
        payloadJson: data.payload,
      });

      socket.emit("vote:confirmed");

      const tally = await storage.getVoteTally(data.questionId);
      io.to(`session:${question.sessionId}`).emit("session:results", {
        questionId: data.questionId,
        tally,
      });
    });

    socket.on("pollster:control", async (data: { action: string; questionId: string }) => {
      const question = await storage.getQuestion(data.questionId);
      if (!question) return;

      let updatedQuestion = question;

      switch (data.action) {
        case "go_live":
          const questions = await storage.getQuestionsBySession(question.sessionId);
          for (const q of questions) {
            if (q.state === "LIVE" && q.id !== question.id) {
              await storage.updateQuestionState(q.id, "CLOSED");
            }
          }
          updatedQuestion = (await storage.updateQuestionState(data.questionId, "LIVE"))!;
          
          const tally = await storage.getVoteTally(data.questionId);
          io.to(`session:${question.sessionId}`).emit("session:current_question", { ...updatedQuestion, tally });
          break;

        case "close":
          updatedQuestion = (await storage.updateQuestionState(data.questionId, "CLOSED"))!;
          io.to(`session:${question.sessionId}`).emit("session:current_question", null);
          break;

        case "reveal":
          updatedQuestion = (await storage.updateQuestionRevealed(data.questionId, true))!;
          break;

        case "hide":
          updatedQuestion = (await storage.updateQuestionRevealed(data.questionId, false))!;
          break;

        case "freeze":
          updatedQuestion = (await storage.updateQuestionFrozen(data.questionId, true))!;
          break;

        case "unfreeze":
          updatedQuestion = (await storage.updateQuestionFrozen(data.questionId, false))!;
          break;

        case "reset":
          await storage.resetQuestionVotes(data.questionId);
          updatedQuestion = (await storage.getQuestion(data.questionId))!;
          break;
      }

      io.to(`session:${question.sessionId}`).emit("session:question_state", {
        questionId: data.questionId,
        state: updatedQuestion.state,
        isRevealed: updatedQuestion.isRevealed,
        isFrozen: updatedQuestion.isFrozen,
      });

      if (updatedQuestion.state === "LIVE") {
        const tally = await storage.getVoteTally(data.questionId);
        io.to(`session:${question.sessionId}`).emit("session:results", {
          questionId: data.questionId,
          tally,
        });
      }
    });

    socket.on("disconnect", () => {
      if (currentSessionId) {
        sessionRooms.get(currentSessionId)?.delete(socket.id);
        if (isPollster) {
          pollsterRooms.get(currentSessionId)?.delete(socket.id);
        }
      }
    });
  });

  return httpServer;
}
