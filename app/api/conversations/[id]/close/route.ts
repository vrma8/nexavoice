import { NextRequest, NextResponse } from 'next/server';
import { closeConversation, getConversation } from '@/lib/support/store';
import { withStore } from '@/lib/support/route-store';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/conversations/:id/close
 *
 * The customer left: they closed the chat panel, signed out, or the browser
 * fired `pagehide` and sent a `navigator.sendBeacon` here (which can only do
 * POST, hence a route of its own rather than the PATCH above).
 *
 * Ending the conversation is idempotent, so a beacon plus an explicit close on
 * the same session is harmless. If a human agent was already handling the case,
 * `closeConversation` keeps the case open and flags `customerLeftAt` instead of
 * deleting it, so the agent sees what happened.
 */
async function handlePost(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!getConversation(id)) {
    return NextResponse.json({ ok: true, alreadyClosed: true });
  }
  const conversation = closeConversation(id, 'closed by customer');
  return NextResponse.json({ ok: true, conversation });
}

export const POST = withStore(handlePost);
