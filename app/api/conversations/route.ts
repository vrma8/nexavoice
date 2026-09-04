import { NextRequest, NextResponse } from 'next/server';
import { createConversation, listConversations } from '@/lib/support/store';
import type { ConversationMode } from '@/lib/support/types';
import { withStore } from '@/lib/support/route-store';
import * as shop from '@/lib/shop/service';

/** GET /api/conversations?active=1 — list conversations (dashboard). */
async function handleGet(request: NextRequest) {
  const active = request.nextUrl.searchParams.get('active') === '1';
  return NextResponse.json({ conversations: listConversations({ active }) });
}

/**
 * POST /api/conversations
 * Body: { mode: "CHAT" | "VOICE", customerName?, customerPhone? }
 *
 * The signed-in client's details (from /login) ride along so the conversation —
 * and any case it becomes — carries the customer's name and, when the mobile
 * number matches a NexaMart account, the full verified customer profile.
 */
async function handlePost(request: NextRequest) {
  let body: { mode?: string; customerName?: string; customerPhone?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const mode = (body.mode ?? 'CHAT').toUpperCase() as ConversationMode;
  if (mode !== 'CHAT' && mode !== 'VOICE') {
    return NextResponse.json({ error: 'mode must be CHAT or VOICE' }, { status: 400 });
  }

  const customerName = body.customerName?.trim() || undefined;
  const customerPhone = body.customerPhone?.trim() || undefined;
  const customer = customerPhone ? shop.findCustomerByPhone(customerPhone) : null;

  const conversation = createConversation({
    mode,
    customerName: customer ? customer.name : customerName,
    customer: customer ? shop.toCustomerSnapshot(customer) : undefined,
  });
  return NextResponse.json({ conversation }, { status: 201 });
}

// Bracketed by withStore so the durable store mirror is read before the
// handler runs and written back before the response is flushed (serverless).
export const GET = withStore(handleGet);
export const POST = withStore(handlePost);
