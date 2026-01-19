#!/bin/sh
set -e

echo "Checking database migration state..."

# Check if drizzle migrations table exists
MIGRATIONS_TABLE_EXISTS=$(psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '__drizzle_migrations');" 2>/dev/null || echo "false")

# Check if our tables already exist (from previous drizzle-kit push)
TABLES_EXIST=$(psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'questions');" 2>/dev/null || echo "false")

echo "Tables exist: $TABLES_EXIST, Migrations table exists: $MIGRATIONS_TABLE_EXISTS"

if [ "$TABLES_EXIST" = "t" ] && [ "$MIGRATIONS_TABLE_EXISTS" != "t" ]; then
    echo "Existing database detected - marking initial migration as applied..."
    # Create migrations table and mark initial migration as done
    psql "$DATABASE_URL" <<EOF
CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
);
INSERT INTO "__drizzle_migrations" (hash, created_at) 
VALUES ('0000_initial_schema', $(date +%s)000)
ON CONFLICT DO NOTHING;
EOF
    echo "Migration state initialized for existing database"
fi

echo "Running database migrations..."
npx drizzle-kit migrate

echo "Starting application..."
exec node dist/index.cjs
