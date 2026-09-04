import { NextRequest, NextResponse } from 'next/server';
import {
  appendMessage,
  closeConversation,
  getCase,
  getConversation,
  listMessages,
  updateConversation,
} from '@/lib/support/store';
import type { MessageRole } from '@/lib/support/types';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/conversations/:id?since=<ms>
 * Conversation + messages (+ case when escalated). Polled by the chat UI and
 * by the dashboard case view.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  const since = Number(request.nextUrl.searchParams.get('since') ?? 0) || 0;
  return NextResponse.json({
    conversation,
    messages: listMessages(id, since),
    case: conversation.caseId ? getCase(conversation.caseId) : null,
    now: Date.now(),
  });
}

/**
 * PATCH /api/conversations/:id
 * Body: { agentState?, transcript?: [{ role, content, turnId? }], close?: boolean }
 * Voice client mirrors live transcript + agent state here so the dashboard can
 * show the call in real time and escalation summaries have context.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  let body: {
    agentState?: string;
    transcript?: Array<{ role: MessageRole; content: string; turnId?: number }>;
    close?: boolean;
    humanUid?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.agentState === 'string') {
    updateConversation(id, { agentState: body.agentState });
  }
  if (Array.isArray(body.transcript)) {
    for (const item of body.transcript.slice(-20)) {
      if (!item || typeof item.content !== 'string' || !item.content.trim()) continue;
      const role: MessageRole = item.role === 'ai' || item.role === 'human_agent' ? item.role : 'user';
      appendMessage(id, role, item.content.trim(), { turnId: item.turnId });
    }
  }
  if (body.close) {
    closeConversation(id, 'closed by client');
  }
  return NextResponse.json({ conversation: getConversation(id) });
}
