import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { insertUserSchema, insertSessionSchema, insertQuestionSchema, type QuestionState, type User } from "@shared/schema";
import { createHash, randomBytes } from "crypto";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const authTokens = new Map<string, { userId: string; expiresAt: number }>();

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
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
  
  const user = await storage.getUser(session.userId);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  (req as any).userId = session.userId;
  req.user = user;
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
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
  
  const user = await storage.getUser(session.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
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
      isAdmin: true,
    });
    console.log("Admin account created: admin / admin123");
  }

  // Health check endpoint for Docker/load balancer
  app.get("/api/health", async (req, res) => {
    try {
      // Check database connection
      await storage.getUserByUsername("admin");
      res.json({ status: "healthy", timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({ status: "unhealthy", error: "Database connection failed" });
    }
  });

  // Public broadcast endpoint for Xpression/graphics servers
  // GET /api/broadcast/:sessionCode - returns live poll data as JSON
  app.get("/api/broadcast/:sessionCode", async (req, res) => {
    try {
      const { sessionCode } = req.params;
      const session = await storage.getSessionByCode(sessionCode.toUpperCase());
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const questions = await storage.getQuestionsBySession(session.id);
      const liveQuestion = questions.find(q => q.state === "LIVE");
      
      // Build response optimized for broadcast graphics
      const response: any = {
        sessionCode: session.code,
        sessionTitle: session.name,
        mode: session.mode,
        isActive: session.isActive,
        timestamp: new Date().toISOString(),
        liveQuestion: null,
        allQuestions: []
      };

      if (liveQuestion) {
        const tally = await storage.getVoteTally(liveQuestion.id);
        const questionOptions = liveQuestion.optionsJson || [];

        // Build options with segment breakdowns
        const options = questionOptions.map((opt: string, idx: number) => {
          const key = idx.toString();
          const total = tally.byOption?.[key] || 0;
          const room = tally.bySegmentAndOption?.room?.[key] || 0;
          const remote = tally.bySegmentAndOption?.remote?.[key] || 0;
          return {
            label: opt,
            votes: total,
            roomVotes: room,
            remoteVotes: remote,
            percentage: tally.total > 0 ? Math.round((total / tally.total) * 100) : 0,
            roomPercentage: tally.bySegment.room > 0 ? Math.round((room / tally.bySegment.room) * 100) : 0,
            remotePercentage: tally.bySegment.remote > 0 ? Math.round((remote / tally.bySegment.remote) * 100) : 0
          };
        });

        response.liveQuestion = {
          id: liveQuestion.id,
          text: liveQuestion.prompt,
          type: liveQuestion.type,
          state: liveQuestion.state,
          resultsVisible: liveQuestion.isRevealed,
          frozen: liveQuestion.isFrozen,
          totalVotes: tally.total,
          roomVotes: tally.bySegment.room,
          remoteVotes: tally.bySegment.remote,
          votesPerSecond: tally.votesPerSecond || 0,
          options
        };
      }

      // Include all questions with their current state and results
      for (const q of questions) {
        const tally = await storage.getVoteTally(q.id);
        const questionOptions = q.optionsJson || [];

        const options = questionOptions.map((opt: string, idx: number) => {
          const key = idx.toString();
          const total = tally.byOption?.[key] || 0;
          return {
            label: opt,
            votes: total,
            percentage: tally.total > 0 ? Math.round((total / tally.total) * 100) : 0
          };
        });

        response.allQuestions.push({
          id: q.id,
          text: q.prompt,
          type: q.type,
          state: q.state,
          order: q.order,
          resultsVisible: q.isRevealed,
          totalVotes: tally.total,
          options
        });
      }

      res.json(response);
    } catch (error) {
      console.error("Broadcast API error:", error);
      res.status(500).json({ error: "Failed to fetch broadcast data" });
    }
  });

  // Hardware voting device endpoint for external keypads (Turning, iClicker, etc.)
  // POST /api/vote/hardware - accepts votes from hardware devices
  app.post("/api/vote/hardware", async (req, res) => {
    try {
      const { sessionCode, deviceId, optionIndex, segment = "room" } = req.body;

      if (!sessionCode || !deviceId || optionIndex === undefined) {
        return res.status(400).json({ 
          error: "Missing required fields", 
          required: ["sessionCode", "deviceId", "optionIndex"],
          example: { sessionCode: "ABC123", deviceId: "KEYPAD-001", optionIndex: 0, segment: "room" }
        });
      }

      const session = await storage.getSessionByCode(sessionCode.toUpperCase());
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (!session.isActive) {
        return res.status(400).json({ error: "Session is not active" });
      }

      const questions = await storage.getQuestionsBySession(session.id);
      const liveQuestion = questions.find(q => q.state === "LIVE");

      if (!liveQuestion) {
        return res.status(400).json({ error: "No question is currently live" });
      }

      if (liveQuestion.isFrozen) {
        return res.status(400).json({ error: "Voting is frozen for this question" });
      }

      // Create a deterministic token hash from the device ID
      const voterTokenHash = createHash("sha256").update(`hardware-${deviceId}`).digest("hex");

      // Check if this device already voted on this question
      const hasVoted = await storage.hasVoted(liveQuestion.id, voterTokenHash);
      if (hasVoted) {
        return res.status(400).json({ error: "This device has already voted on this question" });
      }

      // Validate option index
      const options = liveQuestion.optionsJson || [];
      if (optionIndex < 0 || optionIndex >= options.length) {
        return res.status(400).json({ 
          error: "Invalid option index", 
          validRange: `0-${options.length - 1}`,
          options: options 
        });
      }

      // Record the vote
      await storage.createVote({
        questionId: liveQuestion.id,
        segment: segment === "remote" ? "remote" : "room",
        voterTokenHash,
        payloadJson: { optionId: optionIndex }
      });

      // Emit real-time update
      io.to(`session:${session.id}`).emit("vote_update", {
        questionId: liveQuestion.id,
        tally: await storage.getVoteTally(liveQuestion.id)
      });

      res.json({ 
        success: true, 
        message: "Vote recorded",
        deviceId,
        questionId: liveQuestion.id,
        optionIndex,
        optionLabel: options[optionIndex]
      });
    } catch (error) {
      console.error("Hardware vote error:", error);
      res.status(500).json({ error: "Failed to record vote" });
    }
  });

  // Get current live question for hardware devices (simpler than full broadcast)
  app.get("/api/vote/hardware/status/:sessionCode", async (req, res) => {
    try {
      const { sessionCode } = req.params;
      const session = await storage.getSessionByCode(sessionCode.toUpperCase());
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const questions = await storage.getQuestionsBySession(session.id);
      const liveQuestion = questions.find(q => q.state === "LIVE");

      if (!liveQuestion) {
        return res.json({ 
          sessionActive: session.isActive,
          hasLiveQuestion: false,
          question: null
        });
      }

      const options = liveQuestion.optionsJson || [];

      res.json({
        sessionActive: session.isActive,
        hasLiveQuestion: true,
        question: {
          id: liveQuestion.id,
          text: liveQuestion.prompt,
          type: liveQuestion.type,
          frozen: liveQuestion.isFrozen,
          options: options.map((opt: string, idx: number) => ({
            index: idx,
            label: opt,
            key: String.fromCharCode(65 + idx) // A, B, C, D...
          }))
        }
      });
    } catch (error) {
      console.error("Hardware status error:", error);
      res.status(500).json({ error: "Failed to get status" });
    }
  });

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

      res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin, token });
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
    res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin });
  });

  // Admin routes for managing pollsters
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin })));
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const user = await storage.createUser({
        username,
        password: hashPassword(password),
        isAdmin: false,
      });

      res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (user.isAdmin) {
        return res.status(400).json({ error: "Cannot delete admin user" });
      }
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
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
      const user = await storage.getUser((req as any).userId);
      if (user?.isAdmin) {
        const sessions = await storage.getAllSessions();
        // Add creator username for admin view
        const sessionsWithCreator = await Promise.all(
          sessions.map(async (session) => {
            const creator = session.createdById ? await storage.getUser(session.createdById) : null;
            return { ...session, creatorUsername: creator?.username || "Unknown" };
          })
        );
        res.json(sessionsWithCreator);
      } else {
        const sessions = await storage.getSessionsByUser((req as any).userId);
        res.json(sessions);
      }
    } catch (error) {
      console.error("Error fetching sessions:", error);
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

  app.delete("/api/sessions/:id", requireAuth, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const user = await storage.getUser((req as any).userId);
      const hasAccess = session.createdById === (req as any).userId || user?.isAdmin;
      if (!hasAccess) {
        return res.status(403).json({ error: "Not authorized to delete this session" });
      }

      await storage.deleteSession(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/sessions/:sessionId/questions", requireAuth, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      const user = await storage.getUser((req as any).userId);
      const hasAccess = session && (session.createdById === (req as any).userId || user?.isAdmin);
      if (!hasAccess) {
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
      const user = await storage.getUser((req as any).userId);
      const hasAccess = session && (session.createdById === (req as any).userId || user?.isAdmin);
      if (!hasAccess) {
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
      const user = await storage.getUser((req as any).userId);
      const hasAccess = session && (session.createdById === (req as any).userId || user?.isAdmin);
      if (!hasAccess) {
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

  // Survey Mode Endpoints
  app.post("/api/sessions/:sessionId/survey/start", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.mode !== "survey") {
        return res.status(404).json({ error: "Survey session not found" });
      }

      if (!session.isActive) {
        return res.status(403).json({ error: "This survey is closed" });
      }

      const questions = await storage.getQuestionsBySession(req.params.sessionId);
      const participantToken = req.body.participantToken;

      if (!participantToken) {
        return res.status(400).json({ error: "Participant token required" });
      }

      const completion = await storage.createSurveyCompletion({
        sessionId: req.params.sessionId,
        participantToken,
        totalQuestions: questions.length,
      });

      res.json({
        surveyId: completion.id,
        questions: questions.map(q => ({
          id: q.id,
          order: q.order,
          type: q.type,
          prompt: q.prompt,
          optionsJson: q.optionsJson,
        })),
        timeLimit: session.questionTimeLimitSeconds,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/sessions/:sessionId/survey/vote", async (req, res) => {
    try {
      const { surveyId, questionId, payload, voterToken, segment } = req.body;

      const session = await storage.getSession(req.params.sessionId);
      if (!session || !session.isActive) {
        return res.status(403).json({ error: "This survey is closed" });
      }

      const completion = await storage.getSurveyCompletion(surveyId);
      if (!completion || completion.completedAt) {
        return res.status(400).json({ error: "Invalid or completed survey" });
      }

      const question = await storage.getQuestion(questionId);
      if (!question || question.sessionId !== req.params.sessionId) {
        return res.status(404).json({ error: "Question not found" });
      }

      // Check if already voted on this question in this survey session
      const hasVoted = await storage.hasVoted(questionId, voterToken);
      if (hasVoted) {
        return res.status(400).json({ error: "Already voted on this question" });
      }

      await storage.createVoteEvent({
        sessionId: req.params.sessionId,
        questionId,
        voterTokenHash: voterToken,
        segment: segment || "room",
        payloadJson: payload,
      });

      // Update progress
      const newProgress = completion.questionsAnswered + 1;
      await storage.updateSurveyProgress(surveyId, newProgress);

      // Emit real-time update for live stats panel
      io.to(`session:${req.params.sessionId}`).emit("vote_update", {
        questionId,
        tally: await storage.getVoteTally(questionId)
      });

      res.json({ success: true, questionsAnswered: newProgress });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/sessions/:sessionId/survey/complete", async (req, res) => {
    try {
      const { surveyId } = req.body;

      const completion = await storage.getSurveyCompletion(surveyId);
      if (!completion) {
        return res.status(404).json({ error: "Survey not found" });
      }

      await storage.completeSurvey(surveyId);

      // Emit real-time update to pollsters
      io.to(`pollster:${req.params.sessionId}`).emit("survey:completed", {
        surveyId,
        questionsAnswered: completion.questionsAnswered,
        totalQuestions: completion.totalQuestions,
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sessions/:sessionId/survey/stats", async (req, res) => {
    try {
      const stats = await storage.getSurveyStats(req.params.sessionId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sessions/:sessionId/survey/results", async (req, res) => {
    try {
      const questions = await storage.getQuestionsBySession(req.params.sessionId);
      const results = [];
      
      for (const question of questions) {
        const tally = await storage.getVoteTally(question.id);
        results.push({
          question,
          tally,
        });
      }
      
      const stats = await storage.getSurveyStats(req.params.sessionId);
      res.json({ results, stats });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/sessions/:sessionId/survey/reset", requireAuth, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const user = req.user as User;
      if (session.createdById !== user.id && !user.isAdmin) {
        return res.status(403).json({ error: "Not authorized to reset this survey" });
      }
      
      await storage.resetSurvey(req.params.sessionId);
      
      // Broadcast to connected clients that the survey was reset
      io.to(`session:${req.params.sessionId}`).emit("session:reset");
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/sessions/:sessionId/activate", requireAuth, async (req, res) => {
    try {
      const { isActive } = req.body;
      
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ error: "isActive must be a boolean" });
      }
      
      const session = await storage.getSession(req.params.sessionId);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const user = req.user as User;
      if (session.createdById !== user.id && !user.isAdmin) {
        return res.status(403).json({ error: "Not authorized to modify this session" });
      }
      
      const updatedSession = await storage.updateSessionActive(req.params.sessionId, isActive);
      res.json({ success: true, session: updatedSession });
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

      const hasVoted = await storage.hasVoted(data.questionId, data.voterToken);
      if (hasVoted) {
        socket.emit("error", { message: "Already voted" });
        return;
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
          // Broadcast the question with tally so overlay can show results (for CLOSED or DRAFT/survey mode)
          if (updatedQuestion.state === "CLOSED" || updatedQuestion.state === "DRAFT") {
            const revealTally = await storage.getVoteTally(data.questionId);
            io.to(`session:${question.sessionId}`).emit("session:current_question", { ...updatedQuestion, tally: revealTally });
          }
          break;

        case "hide":
          updatedQuestion = (await storage.updateQuestionRevealed(data.questionId, false))!;
          // Hide from overlay (for CLOSED or DRAFT/survey mode)
          if (updatedQuestion.state === "CLOSED" || updatedQuestion.state === "DRAFT") {
            io.to(`session:${question.sessionId}`).emit("session:current_question", null);
          }
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
