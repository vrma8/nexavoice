import { prisma } from '../db';
import type { Prisma } from '@/generated/prisma/client';

export type PersistenceKind = 'none' | 'postgres';

export interface PersistenceBackend {
  kind: PersistenceKind;
  target: string;
  read(): Promise<string | null>;
  write(body: string): Promise<void>;
}

function stateKey(): string {
  return process.env.NEXAVOICE_STATE_KEY?.trim() || 'nexavoice';
}

function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

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

function describeTarget(): string {
  const url = process.env.DATABASE_URL?.trim() ?? '';
  const match = url.match(/postgres(?:ql)?:\/\/[^/]*\/([^?]+)/i);
  const database = match ? decodeURIComponent(match[1]) : 'unknown';
  return `postgresql:${database}`;
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
