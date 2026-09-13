import { NextRequest, NextResponse } from 'next/server';
import { createConversation, listConversations } from '@/lib/support/store';
import type { ConversationMode, CustomerSnapshot } from '@/lib/support/types';
import { withStore } from '@/lib/support/route-store';
import { prisma, hasDatabaseUrl } from '@/lib/db';

async function handleGet(request: NextRequest) {
  const active = request.nextUrl.searchParams.get('active') === '1';
  return NextResponse.json({ conversations: listConversations({ active }) });
}

const DEFAULT_ADDRESS = 'B-42, Lajpat Nagar II, New Delhi 110024';

async function loadClient(clientId?: string): Promise<CustomerSnapshot> {
  const fallbackCustomer: CustomerSnapshot = {
    id: clientId?.trim() || 'demo-client-1',
    name: 'Rahul Sharma',
    phone: '9876543210',
    email: 'rahul.sharma@example.com',
    tier: 'prime',
    city: 'Delhi',
    address: DEFAULT_ADDRESS,
    preferredLanguage: 'hinglish',
  };

  if (!hasDatabaseUrl()) return fallbackCustomer;
  try {
    let row = clientId?.trim()
      ? await prisma.client.findUnique({ where: { id: clientId.trim() } })
      : null;
    if (!row) {
      row = await prisma.client.findFirst({ orderBy: { createdAt: 'asc' } });
    }
    if (!row) return fallbackCustomer;
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      tier: row.tier,
      city: row.city,
      address: row.address?.trim() || DEFAULT_ADDRESS,
      preferredLanguage: row.preferredLanguage,
    };
  } catch (error) {
    console.warn('[conversations] could not load client:', error);
    return fallbackCustomer;
  }
}

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

export const GET = withStore(handleGet);
export const POST = withStore(handlePost);
