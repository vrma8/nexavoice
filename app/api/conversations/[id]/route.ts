import { NextRequest, NextResponse } from 'next/server';
import {
  appendMessage,
  closeConversation,
  getCase,
  getConversation,
  heartbeatConversation,
  listMessages,
  updateConversation,
} from '@/lib/support/store';
import type { MessageRole } from '@/lib/support/types';
import { withStore } from '@/lib/support/route-store';

type Params = { params: Promise<{ id: string }> };

async function handleGet(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  heartbeatConversation(id);
  const since = Number(request.nextUrl.searchParams.get('since') ?? 0) || 0;
  return NextResponse.json({
    conversation,
    messages: listMessages(id, since),
    case: conversation.caseId ? getCase(conversation.caseId) : null,
    now: Date.now(),
  });
}

async function handlePatch(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  heartbeatConversation(id);
  let body: {
    agentState?: string;
    transcript?: Array<{ role: MessageRole; content: string; turnId?: number }>;
    heartbeat?: boolean;
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

export const GET = withStore(handleGet);
export const PATCH = withStore(handlePatch);
