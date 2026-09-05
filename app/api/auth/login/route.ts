import { NextRequest, NextResponse } from 'next/server';
import { hasDatabaseUrl } from '@/lib/db';
import { upsertAgent, upsertClient, type AgentRecord, type ClientRecord } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface LoginBody {
  role?: string;
  name?: string;
  email?: string;
  phone?: string;
  tier?: string;
  city?: string;
  address?: string;
  preferredLanguage?: string;
  title?: string;
}

/** Normalises Indian mobile numbers to 10 digits (drops +91 / 0 prefix, spaces, dashes). */
function normalizePhone(input: string): string | null {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

/**
 * POST /api/auth/login  { role: 'client' | 'agent', ... }
 *
 * Collects the details of a client (customer) or a support agent and maintains
 * them in PostgreSQL (Client / Agent tables) via Prisma. Returns the stored
 * record so the browser can keep it as the session.
 */
export async function POST(request: NextRequest) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { error: 'Database is not configured. Set DATABASE_URL (PostgreSQL) and run pnpm db:push.' },
      { status: 503 },
    );
  }

  let body: LoginBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const role = body.role?.trim().toLowerCase();
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();

  try {
    if (role === 'agent') {
      if (!name || !email) {
        return NextResponse.json({ error: 'Name and email are required for a support agent.' }, { status: 400 });
      }
      const agent: AgentRecord = await upsertAgent({ name, email, title: body.title });
      return NextResponse.json({ ok: true, agent });
    }

    if (role === 'client') {
      const phone = normalizePhone(body.phone ?? '');
      if (!name || !email || !phone) {
        return NextResponse.json({ error: 'Name, email and a valid 10-digit mobile number are required.' }, { status: 400 });
      }
      const client: ClientRecord = await upsertClient({
        name,
        email,
        phone,
        tier: body.tier,
        city: body.city,
        address: body.address,
        preferredLanguage: body.preferredLanguage,
      });
      return NextResponse.json({ ok: true, client });
    }

    return NextResponse.json({ error: "role must be 'client' or 'agent'" }, { status: 400 });
  } catch (error) {
    console.error('[auth] login failed:', error);
    return NextResponse.json(
      { error: 'Could not save the login details. Check the database connection.' },
      { status: 500 },
    );
  }
}
