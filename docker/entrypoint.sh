#!/bin/sh
set -e

echo "Checking database state..."

# Check if our tables already exist (from previous drizzle-kit push)
TABLES_EXIST=$(psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'questions');" 2>/dev/null || echo "false")

echo "Tables exist: $TABLES_EXIST"

if [ "$TABLES_EXIST" = "t" ]; then
    echo "Existing database detected - skipping migrations (schema already in place)"
else
    echo "Fresh database - running migrations..."
    npx drizzle-kit migrate
fi

echo "Starting application..."
exec node dist/index.cjs
