import { NextRequest, NextResponse } from 'next/server';
import { closeConversation, getConversation } from '@/lib/support/store';
import { withStore } from '@/lib/support/route-store';

type Params = { params: Promise<{ id: string }> };

async function handlePost(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!getConversation(id)) {
    return NextResponse.json({ ok: true, alreadyClosed: true });
  }
  const conversation = closeConversation(id, 'closed by customer');
  return NextResponse.json({ ok: true, conversation });
}

export const POST = withStore(handlePost);
