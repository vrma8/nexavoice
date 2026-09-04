import { NextRequest, NextResponse } from 'next/server';
import { getCase, getConversation, recordEvent, resolveCase } from '@/lib/support/store';

type Params = { params: Promise<{ id: string }> };

/** POST /api/cases/:id/resolve { note? } — human closes the case (state → RESOLVED). */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!getCase(id)) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  let body: { note?: string; humanLeft?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // optional
  }
  const supportCase = resolveCase(id, body.note?.trim() || undefined)!;
  if (body.humanLeft) recordEvent(supportCase.conversationId, 'human.left');
  return NextResponse.json({ case: supportCase, conversation: getConversation(supportCase.conversationId) });
}
