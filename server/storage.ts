import { 
  users, sessions, questions, voteEvents,
  type User, type InsertUser, 
  type Session, type InsertSession,
  type Question, type InsertQuestion,
  type VoteEvent, type InsertVoteEvent,
  type VoteTally, type QuestionState, type Segment
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
      ...insertSession,
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

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const existingQuestions = await this.getQuestionsBySession(insertQuestion.sessionId);
    const order = existingQuestions.length + 1;

    const [question] = await db.insert(questions).values({
      ...insertQuestion,
      order,
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
    const [vote] = await db.insert(voteEvents).values(insertVote).returning();
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
}

export const storage = new DatabaseStorage();
