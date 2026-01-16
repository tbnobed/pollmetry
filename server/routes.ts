import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { storage } from "./storage";
import { insertUserSchema, insertSessionSchema, insertQuestionSchema, type QuestionState } from "@shared/schema";
import { createHash } from "crypto";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgSession = connectPgSimple(session);
  
  app.set("trust proxy", 1);
  
  app.use(
    session({
      store: new PgSession({
        pool: pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "livepoll-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: true,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

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

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ error: "Session error" });
        }
        res.json({ id: user.id, username: user.username });
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
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

      const session = await storage.createSession(parsed.data, req.session.userId!);
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sessions", requireAuth, async (req, res) => {
    try {
      const sessions = await storage.getSessionsByUser(req.session.userId!);
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
      if (!session || session.createdById !== req.session.userId) {
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

  app.delete("/api/sessions/:sessionId/questions/:questionId", requireAuth, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.createdById !== req.session.userId) {
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
