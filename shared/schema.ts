import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 6 }).notNull().unique(),
  name: text("name").notNull(),
  broadcastDelaySeconds: integer("broadcast_delay_seconds").default(0).notNull(),
  createdById: varchar("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [sessions.createdById],
    references: [users.id],
  }),
  questions: many(questions),
  voteEvents: many(voteEvents),
}));

export const questionStateEnum = z.enum(["DRAFT", "LIVE", "CLOSED"]);
export type QuestionState = z.infer<typeof questionStateEnum>;

export const questionTypeEnum = z.enum(["multiple_choice", "slider", "emoji"]);
export type QuestionType = z.infer<typeof questionTypeEnum>;

export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  order: integer("order").notNull(),
  type: text("type").notNull().$type<QuestionType>(),
  prompt: text("prompt").notNull(),
  optionsJson: jsonb("options_json").$type<string[]>(),
  state: text("state").notNull().$type<QuestionState>().default("DRAFT"),
  isRevealed: boolean("is_revealed").default(false).notNull(),
  isFrozen: boolean("is_frozen").default(false).notNull(),
  durationSeconds: integer("duration_seconds"),
  openedAt: timestamp("opened_at"),
  closedAt: timestamp("closed_at"),
}, (table) => [
  index("questions_session_id_idx").on(table.sessionId),
]);

export const questionsRelations = relations(questions, ({ one, many }) => ({
  session: one(sessions, {
    fields: [questions.sessionId],
    references: [sessions.id],
  }),
  voteEvents: many(voteEvents),
}));

export const segmentEnum = z.enum(["room", "remote"]);
export type Segment = z.infer<typeof segmentEnum>;

export const voteEvents = pgTable("vote_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  questionId: varchar("question_id").references(() => questions.id).notNull(),
  voterTokenHash: text("voter_token_hash").notNull(),
  segment: text("segment").notNull().$type<Segment>(),
  payloadJson: jsonb("payload_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("vote_events_session_id_idx").on(table.sessionId),
  index("vote_events_question_id_idx").on(table.questionId),
  index("vote_events_created_at_idx").on(table.createdAt),
]);

export const voteEventsRelations = relations(voteEvents, ({ one }) => ({
  session: one(sessions, {
    fields: [voteEvents.sessionId],
    references: [sessions.id],
  }),
  question: one(questions, {
    fields: [voteEvents.questionId],
    references: [questions.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertSessionSchema = createInsertSchema(sessions).pick({
  name: true,
  broadcastDelaySeconds: true,
});

export const insertQuestionSchema = createInsertSchema(questions).pick({
  sessionId: true,
  order: true,
  type: true,
  prompt: true,
  optionsJson: true,
  durationSeconds: true,
});

export const insertVoteEventSchema = createInsertSchema(voteEvents).pick({
  sessionId: true,
  questionId: true,
  voterTokenHash: true,
  segment: true,
  payloadJson: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questions.$inferSelect;

export type InsertVoteEvent = z.infer<typeof insertVoteEventSchema>;
export type VoteEvent = typeof voteEvents.$inferSelect;

export interface VotePayloadMultipleChoice {
  optionId: number;
}

export interface VotePayloadSlider {
  value: number;
}

export interface VotePayloadEmoji {
  emoji: string;
}

export type VotePayload = VotePayloadMultipleChoice | VotePayloadSlider | VotePayloadEmoji;

export interface VoteTally {
  total: number;
  bySegment: {
    room: number;
    remote: number;
  };
  byOption?: Record<string, number>;
  bySegmentAndOption?: {
    room: Record<string, number>;
    remote: Record<string, number>;
  };
  votesPerSecond?: number;
}

export interface QuestionWithTally extends Question {
  tally?: VoteTally;
}

export const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👎"] as const;
export type EmojiType = typeof EMOJIS[number];
