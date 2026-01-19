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
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false NOT NULL'
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
