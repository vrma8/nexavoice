import { prisma } from './db';

export interface ClientInput {
  name: string;
  email: string;
  phone: string;
  tier?: string;
  city?: string;
  address?: string;
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
  address: string;
  preferredLanguage: string;
  walletBalanceInr: number;
}

const WELCOME_WALLET_GIFT_INR = 500;

export interface AgentRecord {
  id: string;
  name: string;
  email: string;
  title: string;
}

export async function upsertClient(input: ClientInput): Promise<ClientRecord> {
  const tier = input.tier === 'prime' ? 'prime' : 'standard';
  const existing = await prisma.client.findUnique({ where: { phone: input.phone } });
  if (!existing) {
    const row = await prisma.client.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        tier,
        city: input.city?.trim() ?? '',
        address: input.address?.trim() ?? '',
        preferredLanguage: input.preferredLanguage ?? 'english',
        walletBalanceInr: WELCOME_WALLET_GIFT_INR,
        walletTransactions: {
          create: {
            amountInr: WELCOME_WALLET_GIFT_INR,
            label: 'Welcome gift — NexaCash',
          },
        },
      },
    });
    return toClientRecord(row);
  }
  const row = await prisma.client.update({
    where: { phone: input.phone },
    data: {
      name: input.name,
      email: input.email,
      tier,
      city: input.city?.trim() ?? '',
      ...(input.address?.trim() ? { address: input.address.trim() } : {}),
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
  address: string;
  preferredLanguage: string;
  walletBalanceInr: number;
}): ClientRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    tier: row.tier,
    city: row.city,
    address: row.address,
    preferredLanguage: row.preferredLanguage,
    walletBalanceInr: row.walletBalanceInr,
  };
}

const DEMO_CLIENTS: ClientInput[] = [
  {
    name: 'Rahul Sharma',
    email: 'rahul.sharma@example.com',
    phone: '9876543210',
    tier: 'prime',
    city: 'Delhi',
    address: 'B-42, Lajpat Nagar II, New Delhi 110024',
    preferredLanguage: 'hinglish',
  },
  {
    name: 'Priya Nair',
    email: 'priya.nair@example.com',
    phone: '9123456780',
    tier: 'standard',
    city: 'Bengaluru',
    address: '12, 4th Cross, Indiranagar, Bengaluru 560038',
    preferredLanguage: 'english',
  },
  {
    name: 'Amit Verma',
    email: 'amit.verma@example.com',
    phone: '9988776655',
    tier: 'standard',
    city: 'Lucknow',
    address: '221, Gomti Nagar, Lucknow 226010',
    preferredLanguage: 'hindi',
  },
];

const DEMO_AGENTS: AgentInput[] = [
  { name: 'Kavya R.', email: 'kavya.r@nexamart.example', title: 'Senior Support Agent' },
];

let authSeeded = false;

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

export function resetAuthSeedState(): void {
  authSeeded = false;
}
