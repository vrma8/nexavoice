/**
 * Shared Prisma client (PostgreSQL) — Prisma ORM 7.
 *
 * Prisma 7 removed the bundled Rust query engine, so the client is constructed
 * with a driver adapter (`@prisma/adapter-pg`, backed by `node-postgres`).
 * `PrismaClient` is imported from the generated output (see `prisma generate`);
 * the generated folder is produced by the `postinstall` script and ignored by
 * git.
 *
 * A single client is kept on `globalThis` so Next.js dev hot reloads do not
 * exhaust database connections, and so every API route on one server process
 * shares the same pool. When `DATABASE_URL` is not set the client still
 * constructs (no connection is opened until a query runs), so routes can
 * degrade to a clear error instead of crashing at import time.
 */
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    // Without this a firewalled/unreachable server hangs every query until the
    // caller gives up (the Agora engine waits only 15s on a tool call). Failing
    // fast turns "agent stalls and improvises" into an honest error.
    connectionTimeoutMillis: 10_000,
    // Revalidate a pooled connection instead of trusting it: a serverless
    // instance that slept between requests may hold sockets the pooler closed.
    keepAlive: true,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** True when a PostgreSQL connection string is configured. */
export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export interface DatabaseCheck {
  ok: boolean;
  /** Round-trip time of the probe query, when it succeeded. */
  latencyMs?: number;
  /** Row counts that prove the schema is pushed and the catalogue is seeded. */
  products?: number;
  clients?: number;
  error?: string;
  /** True when the failure looks like "cannot reach the server" (connectivity),
   *  false for other failures (auth, missing tables, …). */
  connectivity?: boolean;
}

const dbCheckCache: { at: number; result: DatabaseCheck } = { at: 0, result: { ok: false } };
const DB_CHECK_TTL_MS = 5000;

/**
 * Live connectivity probe used by `/api/health` and by the tool layer to tell
 * "the database is unreachable" apart from ordinary business failures. When the
 * query fails, the message is classified so callers can tell the customer (and
 * the AI agent) exactly what is wrong instead of a generic "tool failed".
 *
 * Result is cached for a few seconds: a down database makes every tool call
 * probe again, and each probe then waits for the full connect timeout.
 */
export async function checkDatabase(): Promise<DatabaseCheck> {
  if (Date.now() - dbCheckCache.at < DB_CHECK_TTL_MS) return dbCheckCache.result;
  const started = Date.now();
  try {
    const [products, clients] = await Promise.all([
      prisma.product.count(),
      prisma.client.count(),
    ]);
    const result: DatabaseCheck = {
      ok: true,
      latencyMs: Date.now() - started,
      products,
      clients,
    };
    dbCheckCache.at = Date.now();
    dbCheckCache.result = result;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[db] connectivity check failed:', message);
    const result: DatabaseCheck = {
      ok: false,
      error: message,
      connectivity: isDatabaseUnavailableError(message),
    };
    dbCheckCache.at = Date.now();
    dbCheckCache.result = result;
    return result;
  }
}

/**
 * True when the error means "could not establish/use a connection" — the
 * database server is unreachable, paused (Supabase free tier does this after
 * inactivity), the credentials are rejected, or the schema was never pushed.
 * Prisma surfaces these as `PrismaClientKnownRequestError` with the code on
 * `error.code` (not in the message), and driver-adapter errors embed the pg
 * message — so both are checked.
 */
export function isDatabaseUnavailableError(error: unknown): boolean {
  if (!error) return false;
  // PrismaClientKnownRequestError codes: P1001 can't reach database, P1002 timed
  // out, P1003 database does not exist, P1004 user/password, P1005–P1008/1010–
  // P1012 connection/pool/ssl/server issues.
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && /^P10(0[1-8]|1[0-2])$/.test(code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return (
    /can't reach database|can\\u2019t reach database|terminat|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|connection timeout|Connection terminated|fetch failed|getaddrinfo/i.test(
      message,
    ) || /P10(0[1-8]|1[0-2])/i.test(message)
  );
}
