CREATE TABLE "audience_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"voter_token_hash" text NOT NULL,
	"segment" text NOT NULL,
	"message" text NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"is_dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audience_messages" ADD CONSTRAINT "audience_messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audience_messages_session_id_idx" ON "audience_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "audience_messages_created_at_idx" ON "audience_messages" USING btree ("created_at");