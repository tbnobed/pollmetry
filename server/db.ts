import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function parseConnectionString(connectionString: string): pg.PoolConfig {
  // Handle passwords with special characters by parsing manually
  // Format: postgresql://user:password@host:port/database
  const match = connectionString.match(
    /^postgresql:\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+?)(\?.*)?$/
  );
  
  if (match) {
    const [, user, password, host, port, database, queryString] = match;
    const config: pg.PoolConfig = {
      host,
      port: parseInt(port, 10),
      database,
      user,
      password, // Raw password, not URL encoded
    };
    
    // Check for SSL in query string
    if (queryString?.includes("sslmode=require")) {
      config.ssl = { rejectUnauthorized: false };
    }
    
    return config;
  }
  
  // Fallback to connectionString if regex doesn't match
  return { connectionString };
}

const connectionConfig = process.env.NODE_ENV === "production"
  ? parseConnectionString(process.env.DATABASE_URL)
  : { connectionString: process.env.DATABASE_URL };

export const pool = new Pool(connectionConfig);
export const db = drizzle(pool, { schema });
