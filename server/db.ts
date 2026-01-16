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
      };
      
      if (queryString?.includes("sslmode=require")) {
        config.ssl = { rejectUnauthorized: false };
      }
      
      return new Pool(config);
    }
  }
  
  // Development or fallback: use connection string directly
  return new Pool({ connectionString });
}

export const pool = createPool();
export const db = drizzle(pool, { schema });
