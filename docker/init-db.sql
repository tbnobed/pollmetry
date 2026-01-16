-- PollMetry.io Database Initialization
-- This script runs automatically when the PostgreSQL container starts for the first time

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE pollmetry TO pollmetry;

-- The application will handle schema creation via Drizzle ORM
-- This file is for any additional database setup if needed
