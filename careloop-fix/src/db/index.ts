import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";

/**
 * Database access.
 *
 * Nothing here runs at import time. `DATABASE_URL` is read, and a connection
 * opened, only when getDb() is first awaited inside a request — otherwise
 * `next build` would try to connect while collecting page data and fail with
 * "DATABASE_URL is required".
 *
 * When DATABASE_URL is absent we do not throw. CareLoop falls back to an
 * embedded Postgres (PGlite) so the app still runs:
 *   - on a writable machine: a file database under .careloop/ that survives restarts
 *   - on Vercel / read-only filesystems: an in-memory database
 * Either way the schema is created and Margaret's seven days of demo data are
 * seeded on first use.
 */

export type Database = NodePgDatabase<Record<string, never>> | PgliteDatabase<Record<string, never>>;

export type DbMode = "postgres" | "pglite-file" | "pglite-memory";

type Handle = { db: Database; mode: DbMode; seeded: boolean };

const globalForDb = globalThis as typeof globalThis & {
  __careloopDb?: Promise<Handle>;
};

/** True on Vercel or anywhere the filesystem should be treated as read-only. */
function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

function fileStorePath() {
  return process.env.CARELOOP_DB_PATH || ".careloop/pglite";
}

async function connectPostgres(databaseUrl: string): Promise<Handle> {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  return { db: drizzle(pool) as Database, mode: "postgres", seeded: false };
}

async function connectPglite(): Promise<Handle> {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");

  // Prefer a file so demo data survives a restart; fall back to memory.
  if (!isServerless()) {
    try {
      const { mkdirSync } = await import("node:fs");
      const path = fileStorePath();
      mkdirSync(path, { recursive: true });
      const client = new PGlite(path);
      await client.waitReady;
      return { db: drizzle(client) as Database, mode: "pglite-file", seeded: false };
    } catch (error) {
      console.warn("CareLoop: could not open a file database, using memory instead.", error);
    }
  }

  const client = new PGlite();
  await client.waitReady;
  return { db: drizzle(client) as Database, mode: "pglite-memory", seeded: false };
}

/** DDL for the embedded fallback. Mirrors src/db/schema.ts exactly. */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS medication_logs (
  id serial PRIMARY KEY,
  medication text NOT NULL,
  dose text,
  status text NOT NULL DEFAULT 'taken',
  taken_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mood_entries (
  id serial PRIMARY KEY,
  score integer NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alerts (
  id serial PRIMARY KEY,
  kind text NOT NULL DEFAULT 'family',
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS care_plan_items (
  id serial PRIMARY KEY,
  medication text NOT NULL,
  dose text,
  time_of_day text NOT NULL DEFAULT 'morning',
  instructions text,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS checkins (
  id serial PRIMARY KEY,
  meals_eaten jsonb DEFAULT '[]'::jsonb,
  meals_skipped jsonb DEFAULT '[]'::jsonb,
  mood_score integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hydration_logs (
  id serial PRIMARY KEY,
  glasses integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS appointments (
  id serial PRIMARY KEY,
  title text NOT NULL,
  date text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  role text NOT NULL,
  content text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

/** Run the DDL one statement at a time: a prepared statement cannot hold several. */
async function applySchema(db: Database) {
  const statements = SCHEMA_SQL.split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

async function connect(): Promise<Handle> {
  // Read the environment here, at first request, never at module load.
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    try {
      const handle = await connectPostgres(databaseUrl);
      // Make sure the tables exist even on a brand new Postgres.
      await applySchema(handle.db);
      return handle;
    } catch (error) {
      console.warn("CareLoop: DATABASE_URL is set but unreachable, using an embedded database.", error);
    }
  } else {
    console.info("CareLoop: no DATABASE_URL set, using an embedded database with demo data.");
  }

  const handle = await connectPglite();
  await applySchema(handle.db);
  return handle;
}

/**
 * The database, created on first use and reused afterwards.
 * Safe to call from any request handler; never called at build time.
 */
export async function getDb(): Promise<Database> {
  const handle = await getHandle();
  return handle.db;
}

export async function getHandle(): Promise<Handle> {
  if (!globalForDb.__careloopDb) {
    globalForDb.__careloopDb = connect().catch((error) => {
      // Let the next request try again rather than caching a failure.
      globalForDb.__careloopDb = undefined;
      throw error;
    });
  }
  return globalForDb.__careloopDb;
}

/** Which backend is in use — shown by /health. */
export async function getDbMode(): Promise<DbMode> {
  return (await getHandle()).mode;
}
