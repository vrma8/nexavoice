/**
 * Login identities, maintained in PostgreSQL through Prisma.
 *
 * The /login page collects the details of a client (customer) or a support
 * agent, and this module is the only place that writes those records to the
 * `Client` / `Agent` tables. Pages read the session the login response wrote to
 * localStorage, and `/api/auth/me` re-reads it from the database so what the UI
 * shows always matches the stored record.
 */
import { prisma } from './db';

export interface ClientInput {
  name: string;
  email: string;
  phone: string;
  tier?: string;
  city?: string;
  preferredLanguage?: string;
}

export interface AgentInput {
  name: string;
  email: string;
  title?: string;
}

export interface ClientRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: string;
  city: string;
  preferredLanguage: string;
}

export interface AgentRecord {
  id: string;
  name: string;
  email: string;
  title: string;
}

export async function upsertClient(input: ClientInput): Promise<ClientRecord> {
  const tier = input.tier === 'prime' ? 'prime' : 'standard';
  const row = await prisma.client.upsert({
    where: { phone: input.phone },
    create: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      tier,
      city: input.city?.trim() ?? '',
      preferredLanguage: input.preferredLanguage ?? 'english',
    },
    update: {
      name: input.name,
      email: input.email,
      tier,
      city: input.city?.trim() ?? '',
      preferredLanguage: input.preferredLanguage ?? 'english',
    },
  });
  return toClientRecord(row);
}

export async function upsertAgent(input: AgentInput): Promise<AgentRecord> {
  const row = await prisma.agent.upsert({
    where: { email: input.email },
    create: {
      name: input.name,
      email: input.email,
      title: input.title?.trim() || 'Support Agent',
    },
    update: {
      name: input.name,
      title: input.title?.trim() || 'Support Agent',
    },
  });
  return { id: row.id, name: row.name, email: row.email, title: row.title };
}

export async function getClient(id: string): Promise<ClientRecord | null> {
  const row = await prisma.client.findUnique({ where: { id } });
  return row ? toClientRecord(row) : null;
}

export async function getClientByPhone(phone: string): Promise<ClientRecord | null> {
  const row = await prisma.client.findUnique({ where: { phone } });
  return row ? toClientRecord(row) : null;
}

export async function getAgent(id: string): Promise<AgentRecord | null> {
  const row = await prisma.agent.findUnique({ where: { id } });
  return row ? { id: row.id, name: row.name, email: row.email, title: row.title } : null;
}

function toClientRecord(row: {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: string;
  city: string;
  preferredLanguage: string;
}): ClientRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    tier: row.tier,
    city: row.city,
    preferredLanguage: row.preferredLanguage,
  };
}

// ---------------------------------------------------------------------------
// Demo identities
// ---------------------------------------------------------------------------

/**
 * The same three customers the demo shop (`lib/shop/data.ts`) ships with, plus a
 * demo agent, so /login's "use a demo account" buttons and the dashboard always
 * have matching records in the database. Seeded once per process, never throws.
 */
const DEMO_CLIENTS: ClientInput[] = [
  {
    name: 'Rahul Sharma',
    email: 'rahul.sharma@example.com',
    phone: '9876543210',
    tier: 'prime',
    city: 'Delhi',
    preferredLanguage: 'hinglish',
  },
  {
    name: 'Priya Nair',
    email: 'priya.nair@example.com',
    phone: '9123456780',
    tier: 'standard',
    city: 'Bengaluru',
    preferredLanguage: 'english',
  },
  {
    name: 'Amit Verma',
    email: 'amit.verma@example.com',
    phone: '9988776655',
    tier: 'standard',
    city: 'Lucknow',
    preferredLanguage: 'hindi',
  },
];

const DEMO_AGENTS: AgentInput[] = [
  { name: 'Kavya R.', email: 'kavya.r@nexamart.example', title: 'Senior Support Agent' },
];

let authSeeded = false;

/**
 * Called from `withStore()` alongside the demo store fixture. Best-effort:
 * identity records must never take down a real conversation, and a database that
 * is not configured simply means there are no demo login records.
 */
export async function maybeSeedAuthData(): Promise<void> {
  if (authSeeded) return;
  authSeeded = true;
  if (!process.env.DATABASE_URL?.trim()) return;
  try {
    for (const client of DEMO_CLIENTS) await upsertClient(client);
    for (const agent of DEMO_AGENTS) await upsertAgent(agent);
  } catch (error) {
    console.warn('[auth] demo identities not written:', error instanceof Error ? error.message : error);
  }
}

/** Test seam. */
export function resetAuthSeedState(): void {
  authSeeded = false;
}
