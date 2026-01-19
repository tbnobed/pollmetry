CREATE TABLE "questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"order" integer NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"options_json" jsonb,
	"state" text DEFAULT 'DRAFT' NOT NULL,
	"is_revealed" boolean DEFAULT false NOT NULL,
	"is_frozen" boolean DEFAULT false NOT NULL,
	"duration_seconds" integer,
	"opened_at" timestamp,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(6) NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"broadcast_delay_seconds" integer DEFAULT 0 NOT NULL,
	"question_time_limit_seconds" integer,
	"created_by_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "survey_completions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"participant_token" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"questions_answered" integer DEFAULT 0 NOT NULL,
	"total_questions" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vote_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"question_id" varchar NOT NULL,
	"voter_token_hash" text NOT NULL,
	"segment" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_completions" ADD CONSTRAINT "survey_completions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_events" ADD CONSTRAINT "vote_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_events" ADD CONSTRAINT "vote_events_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_session_id_idx" ON "questions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "survey_completions_session_id_idx" ON "survey_completions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "vote_events_session_id_idx" ON "vote_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "vote_events_question_id_idx" ON "vote_events" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "vote_events_created_at_idx" ON "vote_events" USING btree ("created_at");