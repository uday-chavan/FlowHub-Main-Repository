import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "../shared/schema";

neonConfig.webSocketConstructor = ws;
neonConfig.pipelineConnect = false;

export function createDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'development' ? { rejectUnauthorized: false } : true
  });
  return drizzle({ client: pool, schema });
}

// Only create database connection if DATABASE_URL is available
let db: ReturnType<typeof createDatabase> | null = null;

export function getDb() {
  if (!db && process.env.DATABASE_URL) {
    db = createDatabase();
  }
  return db;
}