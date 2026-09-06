/**
 * Client identification for the shopping API.
 *
 * The signed-in client record (created on /login and stored in PostgreSQL) is
 * identified by the `x-nexavoice-client-id` header the browser sends with every
 * shop request. The id is always resolved against the database before anything
 * is read or written, so a stale localStorage session cannot reach data that no
 * longer exists, and every cart/order query is scoped to that one client.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma, hasDatabaseUrl } from '@/lib/db';

export const CLIENT_ID_HEADER = 'x-nexavoice-client-id';

export interface ShopClient {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: string;
  city: string;
  address: string;
  preferredLanguage: string;
}

export type ClientLookup = { ok: true; client: ShopClient } | { ok: false; response: NextResponse };

export async function requireClient(request: NextRequest): Promise<ClientLookup> {
  if (!hasDatabaseUrl()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Database is not configured. Set DATABASE_URL (PostgreSQL) and run pnpm db:push.' },
        { status: 503 },
      ),
    };
  }
  const id = request.headers.get(CLIENT_ID_HEADER)?.trim() || request.nextUrl.searchParams.get('clientId')?.trim();
  if (!id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Sign in as a client first.' }, { status: 401 }),
    };
  }
  const row = await prisma.client.findUnique({ where: { id } });
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Client session is unknown — please sign in again.' }, { status: 401 }),
    };
  }
  return {
    ok: true,
    client: {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      tier: row.tier,
      city: row.city,
      address: row.address,
      preferredLanguage: row.preferredLanguage,
    },
  };
}
