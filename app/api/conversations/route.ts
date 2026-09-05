import { NextRequest, NextResponse } from 'next/server';
import { createConversation, listConversations } from '@/lib/support/store';
import type { ConversationMode, CustomerSnapshot } from '@/lib/support/types';
import { withStore } from '@/lib/support/route-store';
import { prisma, hasDatabaseUrl } from '@/lib/db';

/** GET /api/conversations?active=1 — list conversations (dashboard). */
async function handleGet(request: NextRequest) {
  const active = request.nextUrl.searchParams.get('active') === '1';
  return NextResponse.json({ conversations: listConversations({ active }) });
}

/**
 * Loads the signed-in client from PostgreSQL and turns it into the snapshot the
 * conversation (and every tool call made inside it) is scoped to. The browser
 * only ever sends an id — the profile itself always comes from the database.
 */
async function loadClient(clientId?: string): Promise<CustomerSnapshot | undefined> {
  if (!clientId || !hasDatabaseUrl()) return undefined;
  try {
    const row = await prisma.client.findUnique({ where: { id: clientId } });
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      tier: row.tier,
      city: row.city,
      address: row.address,
      preferredLanguage: row.preferredLanguage,
    };
  } catch (error) {
    console.warn('[conversations] could not load client:', error);
    return undefined;
  }
}

/**
 * POST /api/conversations
 * Body: { mode: "CHAT" | "VOICE", clientId?, customerName? }
 *
 * The conversation is bound to the signed-in client record, so the AI agent
 * starts out knowing who it is talking to and can never touch another
 * customer's orders.
 */
async function handlePost(request: NextRequest) {
  let body: { mode?: string; clientId?: string; customerName?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const mode = (body.mode ?? 'CHAT').toUpperCase() as ConversationMode;
  if (mode !== 'CHAT' && mode !== 'VOICE') {
    return NextResponse.json({ error: 'mode must be CHAT or VOICE' }, { status: 400 });
  }

  const customer = await loadClient(body.clientId?.trim());
  const conversation = createConversation({
    mode,
    customerName: customer?.name ?? body.customerName?.trim(),
    customer,
  });
  return NextResponse.json({ conversation }, { status: 201 });
}

// Bracketed by withStore so the durable store mirror is read before the
// handler runs and written back before the response is flushed (serverless).
export const GET = withStore(handleGet);
export const POST = withStore(handlePost);
