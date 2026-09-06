import { NextRequest, NextResponse } from 'next/server';
import { getCase, getConversation, humanLeaveCase } from '@/lib/support/store';
import { withStore } from '@/lib/support/route-store';

/** Store flag + event write. */
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/cases/:id/leave
 *
 * The human agent left the voice call (without resolving). The call is
 * two-sided: the conversation is closed — which the customer's call UI polls
 * for and ends itself — while the case stays visible and flagged `humanLeftAt`
 * so the queue shows "agent left" instead of a live call nobody is on.
 */
async function handlePost(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supportCase = getCase(id);
  if (!supportCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  const updated = humanLeaveCase(id);
  return NextResponse.json({
    case: updated,
    conversation: getConversation(supportCase.conversationId),
  });
}

// Bracketed by withStore so the durable store mirror is read before the
// handler runs and written back before the response is flushed (serverless).
export const POST = withStore(handlePost);
