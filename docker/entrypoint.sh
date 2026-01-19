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
    echo "Existing database detected - skipping migrations (schema already in place)"
else
    echo "Fresh database - running migrations..."
    npx drizzle-kit migrate
fi

echo "Starting application..."
exec node dist/index.cjs
