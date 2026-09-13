import { NextRequest, NextResponse } from 'next/server';
import { getCase, getConversation, listMessages } from '@/lib/support/store';
import { withStore } from '@/lib/support/route-store';

type Params = { params: Promise<{ id: string }> };

async function handleGet(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supportCase = getCase(id);
  if (!supportCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  const conversation = getConversation(supportCase.conversationId);
  return NextResponse.json({
    case: supportCase,
    conversation,
    messages: listMessages(supportCase.conversationId),
    now: Date.now(),
  });
}

export const GET = withStore(handleGet);
