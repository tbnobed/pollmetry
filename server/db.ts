import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL!;
  
  // Connection pool settings optimized for 300+ concurrent users
  const poolSettings = {
    max: 20,                    // Maximum connections in pool
    min: 5,                     // Minimum connections to keep open
    idleTimeoutMillis: 30000,   // Close idle connections after 30s
    connectionTimeoutMillis: 10000, // Timeout for acquiring connection
    allowExitOnIdle: false,     // Keep pool alive
  };
  
  if (process.env.NODE_ENV === "production") {
    // Production: parse connection string manually to handle special characters
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
        password,
        ...poolSettings,
      };
      
      if (queryString?.includes("sslmode=require")) {
        config.ssl = { rejectUnauthorized: false };
      }
      
      return new Pool(config);
    }
  }
  
  // Development or fallback: use connection string directly
  return new Pool({ connectionString, ...poolSettings });
}

export const pool = createPool();
export const db = drizzle(pool, { schema });
