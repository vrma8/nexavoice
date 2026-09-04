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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
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
