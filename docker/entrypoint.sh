#!/bin/sh
set -e

echo "Checking database state..."

# Check if tables exist using Node.js (no need for postgresql-client)
TABLES_EXIST=$(node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => client.query(\"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'questions')\"))
  .then(res => { console.log(res.rows[0].exists ? 't' : 'f'); client.end(); })
  .catch(() => { console.log('f'); client.end(); });
" 2>/dev/null || echo "f")

echo "Tables exist: $TABLES_EXIST"

if [ "$TABLES_EXIST" = "t" ]; then
    echo "Existing database detected - syncing any missing columns..."
    
    # Add missing columns if they don't exist (handles schema drift)
    node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

const migrations = [
  'ALTER TABLE sessions ADD COLUMN IF NOT EXISTS question_time_limit_seconds integer',
  'ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mode text DEFAULT \\'live\\' NOT NULL',
  'ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false NOT NULL',
  'ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_by_id varchar',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false NOT NULL',
  \`CREATE TABLE IF NOT EXISTS survey_completions (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id varchar NOT NULL REFERENCES sessions(id),
    participant_token text NOT NULL,
    started_at timestamp DEFAULT now() NOT NULL,
    completed_at timestamp,
    questions_answered integer DEFAULT 0 NOT NULL,
    total_questions integer NOT NULL
  )\`,
  'CREATE INDEX IF NOT EXISTS survey_completions_session_id_idx ON survey_completions(session_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS vote_events_question_voter_idx ON vote_events(question_id, voter_token_hash)',
  \`CREATE TABLE IF NOT EXISTS audience_messages (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id varchar NOT NULL REFERENCES sessions(id),
    voter_token_hash text NOT NULL,
    segment text NOT NULL,
    message text NOT NULL,
    is_starred boolean DEFAULT false NOT NULL,
    is_dismissed boolean DEFAULT false NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL
  )\`,
  'CREATE INDEX IF NOT EXISTS audience_messages_session_id_idx ON audience_messages(session_id)',
  'CREATE INDEX IF NOT EXISTS audience_messages_created_at_idx ON audience_messages(created_at)',
  'ALTER TABLE sessions ADD COLUMN IF NOT EXISTS opening_message text',
  'ALTER TABLE sessions ADD COLUMN IF NOT EXISTS closing_message text'
];

async function run() {
  await client.connect();
  for (const sql of migrations) {
    try {
      await client.query(sql);
      console.log('OK:', sql.substring(0, 60) + '...');
    } catch (e) {
      console.log('Skip:', e.message);
    }
  }
  await client.end();
}
run();
" 2>&1
    
    echo "Schema sync complete"
else
    echo "Fresh database - running migrations..."
    npx drizzle-kit migrate
fi

echo "Starting application..."
exec node dist/index.cjs
