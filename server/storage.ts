import { 
  users, sessions, questions, voteEvents, surveyCompletions,
  type User, type InsertUser, 
  type Session, type InsertSession,
  type Question, type InsertQuestion,
  type VoteEvent, type InsertVoteEvent,
  type SurveyCompletion, type InsertSurveyCompletion,
  type VoteTally, type QuestionState, type Segment, type SessionMode
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, count, avg } from "drizzle-orm";
import { randomUUID } from "crypto";

function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser & { isAdmin?: boolean }): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  
  createSession(session: InsertSession, createdById: string): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  getSessionByCode(code: string): Promise<Session | undefined>;
  getSessionsByUser(userId: string): Promise<Session[]>;
  getAllSessions(): Promise<Session[]>;
  deleteSession(id: string): Promise<void>;
  updateSessionActive(id: string, isActive: boolean): Promise<Session | undefined>;
  
  createQuestion(question: InsertQuestion): Promise<Question>;
  getQuestion(id: string): Promise<Question | undefined>;
  getQuestionsBySession(sessionId: string): Promise<Question[]>;
  updateQuestion(id: string, updates: Partial<Pick<Question, 'prompt' | 'optionsJson' | 'type' | 'durationSeconds'>>): Promise<Question | undefined>;
  updateQuestionState(id: string, state: QuestionState): Promise<Question | undefined>;
  updateQuestionRevealed(id: string, isRevealed: boolean): Promise<Question | undefined>;
  updateQuestionFrozen(id: string, isFrozen: boolean): Promise<Question | undefined>;
  deleteQuestion(id: string): Promise<void>;
  resetQuestionVotes(id: string): Promise<void>;
  
  createVoteEvent(vote: InsertVoteEvent): Promise<VoteEvent>;
  hasVoted(questionId: string, voterTokenHash: string): Promise<boolean>;
  getVoteTally(questionId: string): Promise<VoteTally>;
  getVotesPerSecond(questionId: string, windowSeconds: number): Promise<number>;
  
  createSurveyCompletion(completion: InsertSurveyCompletion): Promise<SurveyCompletion>;
  getSurveyCompletion(id: string): Promise<SurveyCompletion | undefined>;
  getSurveyCompletionsBySession(sessionId: string): Promise<SurveyCompletion[]>;
  updateSurveyProgress(id: string, questionsAnswered: number): Promise<SurveyCompletion | undefined>;
  completeSurvey(id: string): Promise<SurveyCompletion | undefined>;
  getSurveyStats(sessionId: string): Promise<{ total: number; completed: number; inProgress: number }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser & { isAdmin?: boolean }): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async deleteUser(id: string): Promise<void> {
    // First, set sessions created by this user to have no creator
    await db.update(sessions).set({ createdById: null }).where(eq(sessions.createdById, id));
    // Then delete the user
    await db.delete(users).where(eq(users.id, id));
  }

  async createSession(insertSession: InsertSession, createdById: string): Promise<Session> {
    let code = generateSessionCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await this.getSessionByCode(code);
      if (!existing) break;
      code = generateSessionCode();
      attempts++;
    }

    const [session] = await db.insert(sessions).values({
      name: insertSession.name,
      mode: (insertSession.mode || "live") as SessionMode,
      broadcastDelaySeconds: insertSession.broadcastDelaySeconds || 0,
      questionTimeLimitSeconds: insertSession.questionTimeLimitSeconds,
      code,
      createdById,
    }).returning();
    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async getSessionByCode(code: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.code, code.toUpperCase()));
    return session || undefined;
  }

  async getSessionsByUser(userId: string): Promise<Session[]> {
    return db.select().from(sessions).where(eq(sessions.createdById, userId)).orderBy(desc(sessions.createdAt));
  }

  async getAllSessions(): Promise<Session[]> {
    return db.select().from(sessions).orderBy(desc(sessions.createdAt));
  }

  async deleteSession(id: string): Promise<void> {
    // Delete all survey completions for this session
    await db.delete(surveyCompletions).where(eq(surveyCompletions.sessionId, id));
    // Delete all vote events for this session
    await db.delete(voteEvents).where(eq(voteEvents.sessionId, id));
    // Delete all questions for this session
    await db.delete(questions).where(eq(questions.sessionId, id));
    // Delete the session
    await db.delete(sessions).where(eq(sessions.id, id));
  }

  async updateSessionActive(id: string, isActive: boolean): Promise<Session | undefined> {
    const [session] = await db.update(sessions)
      .set({ isActive })
      .where(eq(sessions.id, id))
      .returning();
    return session || undefined;
  }

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const existingQuestions = await this.getQuestionsBySession(insertQuestion.sessionId);
    const order = existingQuestions.length + 1;

    const [question] = await db.insert(questions).values({
      sessionId: insertQuestion.sessionId,
      order,
      type: insertQuestion.type as "multiple_choice" | "slider" | "emoji",
      prompt: insertQuestion.prompt,
      optionsJson: insertQuestion.optionsJson as string[] | undefined,
      durationSeconds: insertQuestion.durationSeconds,
    }).returning();
    return question;
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    const [question] = await db.select().from(questions).where(eq(questions.id, id));
    return question || undefined;
  }

  async getQuestionsBySession(sessionId: string): Promise<Question[]> {
    return db.select().from(questions).where(eq(questions.sessionId, sessionId)).orderBy(questions.order);
  }

  async updateQuestion(id: string, updates: Partial<Pick<Question, 'prompt' | 'optionsJson' | 'type' | 'durationSeconds'>>): Promise<Question | undefined> {
    const [question] = await db.update(questions).set(updates).where(eq(questions.id, id)).returning();
    return question || undefined;
  }

  async updateQuestionState(id: string, state: QuestionState): Promise<Question | undefined> {
    const updates: any = { state };
    if (state === "LIVE") {
      updates.openedAt = new Date();
      updates.closedAt = null;
    } else if (state === "CLOSED") {
      updates.closedAt = new Date();
    } else if (state === "DRAFT") {
      updates.openedAt = null;
      updates.closedAt = null;
    }

    const [question] = await db.update(questions).set(updates).where(eq(questions.id, id)).returning();
    return question || undefined;
  }

  async updateQuestionRevealed(id: string, isRevealed: boolean): Promise<Question | undefined> {
    const [question] = await db.update(questions).set({ isRevealed }).where(eq(questions.id, id)).returning();
    return question || undefined;
  }

  async updateQuestionFrozen(id: string, isFrozen: boolean): Promise<Question | undefined> {
    const [question] = await db.update(questions).set({ isFrozen }).where(eq(questions.id, id)).returning();
    return question || undefined;
  }

  async deleteQuestion(id: string): Promise<void> {
    await db.delete(voteEvents).where(eq(voteEvents.questionId, id));
    await db.delete(questions).where(eq(questions.id, id));
  }

  async resetQuestionVotes(id: string): Promise<void> {
    await db.delete(voteEvents).where(eq(voteEvents.questionId, id));
    await db.update(questions).set({ 
      state: "DRAFT", 
      isRevealed: false, 
      isFrozen: false,
      openedAt: null,
      closedAt: null
    }).where(eq(questions.id, id));
  }

  async createVoteEvent(insertVote: InsertVoteEvent): Promise<VoteEvent> {
    const [vote] = await db.insert(voteEvents).values({
      sessionId: insertVote.sessionId,
      questionId: insertVote.questionId,
      voterTokenHash: insertVote.voterTokenHash,
      segment: insertVote.segment as "room" | "remote",
      payloadJson: insertVote.payloadJson,
    }).returning();
    return vote;
  }

  async hasVoted(questionId: string, voterTokenHash: string): Promise<boolean> {
    const [result] = await db
      .select({ count: count() })
      .from(voteEvents)
      .where(and(eq(voteEvents.questionId, questionId), eq(voteEvents.voterTokenHash, voterTokenHash)));
    return (result?.count || 0) > 0;
  }

  async getVoteTally(questionId: string): Promise<VoteTally> {
    const question = await this.getQuestion(questionId);
    if (!question) {
      return { total: 0, bySegment: { room: 0, remote: 0 } };
    }

    const votes = await db.select().from(voteEvents).where(eq(voteEvents.questionId, questionId));

    const tally: VoteTally = {
      total: votes.length,
      bySegment: { room: 0, remote: 0 },
      byOption: {},
      bySegmentAndOption: { room: {}, remote: {} },
    };

    for (const vote of votes) {
      const segment = vote.segment as Segment;
      tally.bySegment[segment]++;

      const payload = vote.payloadJson as any;
      
      if (question.type === "multiple_choice" && payload.optionId !== undefined) {
        const key = payload.optionId.toString();
        tally.byOption![key] = (tally.byOption![key] || 0) + 1;
        tally.bySegmentAndOption![segment][key] = (tally.bySegmentAndOption![segment][key] || 0) + 1;
      } else if (question.type === "slider" && payload.value !== undefined) {
        const total = (tally as any).sliderTotal || 0;
        (tally as any).sliderTotal = total + payload.value;
        (tally as any).average = (tally as any).sliderTotal / tally.total;
      } else if (question.type === "emoji" && payload.emoji) {
        const key = payload.emoji;
        tally.byOption![key] = (tally.byOption![key] || 0) + 1;
        tally.bySegmentAndOption![segment][key] = (tally.bySegmentAndOption![segment][key] || 0) + 1;
      }
    }

    tally.votesPerSecond = await this.getVotesPerSecond(questionId, 10);

    return tally;
  }

  async getVotesPerSecond(questionId: string, windowSeconds: number): Promise<number> {
    const cutoff = new Date(Date.now() - windowSeconds * 1000);
    const [result] = await db
      .select({ count: count() })
      .from(voteEvents)
      .where(and(
        eq(voteEvents.questionId, questionId),
        sql`${voteEvents.createdAt} > ${cutoff}`
      ));
    return ((result?.count || 0) / windowSeconds);
  }

  async createSurveyCompletion(completion: InsertSurveyCompletion): Promise<SurveyCompletion> {
    const [result] = await db.insert(surveyCompletions).values(completion).returning();
    return result;
  }

  async getSurveyCompletion(id: string): Promise<SurveyCompletion | undefined> {
    const [result] = await db.select().from(surveyCompletions).where(eq(surveyCompletions.id, id));
    return result || undefined;
  }

  async getSurveyCompletionsBySession(sessionId: string): Promise<SurveyCompletion[]> {
    return db.select().from(surveyCompletions).where(eq(surveyCompletions.sessionId, sessionId)).orderBy(desc(surveyCompletions.startedAt));
  }

  async updateSurveyProgress(id: string, questionsAnswered: number): Promise<SurveyCompletion | undefined> {
    const [result] = await db.update(surveyCompletions)
      .set({ questionsAnswered })
      .where(eq(surveyCompletions.id, id))
      .returning();
    return result || undefined;
  }

  async completeSurvey(id: string): Promise<SurveyCompletion | undefined> {
    const [result] = await db.update(surveyCompletions)
      .set({ completedAt: new Date() })
      .where(eq(surveyCompletions.id, id))
      .returning();
    return result || undefined;
  }

  async getSurveyStats(sessionId: string): Promise<{ total: number; completed: number; inProgress: number }> {
    const completions = await this.getSurveyCompletionsBySession(sessionId);
    const completed = completions.filter(c => c.completedAt !== null).length;
    return {
      total: completions.length,
      completed,
      inProgress: completions.length - completed
    };
  }
}

export const storage = new DatabaseStorage();
