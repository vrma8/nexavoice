import { NextRequest, NextResponse } from 'next/server';
import { getCase, getConversation, listMessages } from '@/lib/support/store';

type Params = { params: Promise<{ id: string }> };

/** GET /api/cases/:id — case + conversation + transcript (dashboard case view). */
export async function GET(_request: NextRequest, { params }: Params) {
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
