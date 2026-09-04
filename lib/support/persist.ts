/**
 * Durable backing for the support store — now PostgreSQL via Prisma.
 *
 * The store itself (`store.ts`) is synchronous and lives on `globalThis`. That is
 * fine for one long-lived Node process, but on a serverless platform every API
 * route is an invocation that may land on a different (or cold) instance, so a
 * conversation created by one request must be visible to the next.
 *
 * This module mirrors the store as a single JSONB document in a Postgres table
 * (`StoreState`) that every instance shares:
 *
 *  - `postgres`  auto-selected when `DATABASE_URL` exists. The document is read
 *                and written with Prisma; `NEXAVOICE_STATE_KEY` picks the row id
 *                (default `nexavoice`) so tests can isolate themselves.
 *  - `none`      in-memory only: local dev without a database, and the contract
 *                tests. Behaviour is exactly what it was before a database
 *                existed.
 *
 * `NEXAVOICE_STORE=memory|postgres` overrides the auto-detection.
 *
 * Writes are last-writer-wins per conversation document (see `mergeRemote` in
 * `snapshot.ts`). That is correct for one customer + one human agent. The old
 * Vercel Blob and `.data/` file backends lived here and have been removed —
 * Postgres is the single shared backend now.
 */
import { prisma } from '../db';
import type { Prisma } from '@/generated/prisma/client';

export type PersistenceKind = 'none' | 'postgres';

export interface PersistenceBackend {
  kind: PersistenceKind;
  /** Human-readable location for logs and /api/health. Never contains credentials. */
  target: string;
  read(): Promise<string | null>;
  write(body: string): Promise<void>;
}

/** Row id for the single support-store document. */
function stateKey(): string {
  return process.env.NEXAVOICE_STATE_KEY?.trim() || 'nexavoice';
}

function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Picks the backend from env only — no I/O — so `/api/health` can report exactly
 * what the store will use, and tests can force `memory`.
 */
export function resolvePersistence(): PersistenceBackend {
  const forced = process.env.NEXAVOICE_STORE?.trim().toLowerCase();

  if (forced === 'memory' || forced === 'none') return noneBackend();
  if (forced === 'postgres' || forced === 'prisma') {
    return hasDatabaseUrl() ? postgresBackend() : unavailablePostgresBackend();
  }
  if (hasDatabaseUrl()) return postgresBackend();
  return noneBackend();
}

function noneBackend(): PersistenceBackend {
  return {
    kind: 'none',
    target: 'in-memory',
    async read() {
      return null;
    },
    async write() {},
  };
}

/** Configured for Postgres but the URL is missing: fail loudly instead of silently losing state. */
function unavailablePostgresBackend(): PersistenceBackend {
  return {
    kind: 'none',
    target: 'postgres (unconfigured: DATABASE_URL missing)',
    async read() {
      throw new Error('NEXAVOICE_STORE=postgres requires DATABASE_URL');
    },
    async write() {
      throw new Error('NEXAVOICE_STORE=postgres requires DATABASE_URL');
    },
  };
}

function postgresBackend(): PersistenceBackend {
  return {
    kind: 'postgres',
    target: describeTarget(),
    async read() {
      const row = await prisma.storeState.findUnique({ where: { id: stateKey() } });
      return row ? JSON.stringify(row.snapshot) : null;
    },
    async write(body) {
      const parsed = JSON.parse(body) as { rev?: number };
      const snapshot = parsed as unknown as Prisma.InputJsonValue;
      const rev = typeof parsed.rev === 'number' ? parsed.rev : 0;
      await prisma.storeState.upsert({
        where: { id: stateKey() },
        create: { id: stateKey(), rev, snapshot },
        update: { rev, snapshot },
      });
    },
  };
}

/** `postgresql:<database>` — the database name never contains credentials. */
function describeTarget(): string {
  const url = process.env.DATABASE_URL?.trim() ?? '';
  const match = url.match(/postgres(?:ql)?:\/\/[^/]*\/([^?]+)/i);
  const database = match ? decodeURIComponent(match[1]) : 'unknown';
  return `postgresql:${database}`;
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
