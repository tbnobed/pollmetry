import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function parseConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: parseInt(url.port || "5432", 10),
    database: url.pathname.slice(1),
    user: url.username,
    password: decodeURIComponent(url.password),
    ssl: url.searchParams.get("sslmode") === "require" ? { rejectUnauthorized: false } : false,
  };
}

const connectionConfig = process.env.NODE_ENV === "production"
  ? parseConnectionString(process.env.DATABASE_URL)
  : { connectionString: process.env.DATABASE_URL };

export const pool = new Pool(connectionConfig);
export const db = drizzle(pool, { schema });
