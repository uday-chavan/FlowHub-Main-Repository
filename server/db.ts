import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "../shared/schema";

// Configure Neon for serverless deployment
neonConfig.webSocketConstructor = ws;
neonConfig.pipelineConnect = false;

export function createDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  
  // Optimize connection for Railway/Neon deployment
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : true,
    max: 10, // Limit connections for free tier
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  
  return drizzle({ client: pool, schema });
}

// Singleton database connection
let db: ReturnType<typeof createDatabase> | null = null;

export function getDb() {
  if (!db && process.env.DATABASE_URL) {
    db = createDatabase();
  }
  return db;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (db) {
    console.log('Closing database connections...');
    // Connections will be closed automatically by the pool
  }
});