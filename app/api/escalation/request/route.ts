import { NextRequest, NextResponse } from 'next/server';
import { appendMessage, getCase, getConversation } from '@/lib/support/store';
import { executeTool } from '@/lib/support/tools';
import { withStore } from '@/lib/support/route-store';

export const maxDuration = 30;

async function handlePost(request: NextRequest) {
  let body: { conversation_id?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.conversation_id) {
    return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
  }
  const conversation = getConversation(body.conversation_id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  const reason = body.reason?.trim() || 'Customer requested a human agent';
  const confidence = Number((0.3 + Math.random() * 0.3).toFixed(2));
  const outcome = await executeTool(conversation.id, 'escalate_to_human', {
    reason,
    intent: conversation.context.intent ?? 'other',
    summary: `Customer requested a human agent in ${conversation.mode.toLowerCase()} mode. ${
      conversation.context.customer ? `Verified customer: ${conversation.context.customer.name}. ` : 'Customer not yet verified. '
    }${conversation.context.orderIds.length ? `Orders discussed: ${conversation.context.orderIds.join(', ')}.` : ''}`,
    customer_name: conversation.context.customerName,
    language: conversation.context.language,
    confidence,
  });
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.result.message ?? 'Escalation failed' }, { status: 500 });
  }
  const caseId = String(outcome.result.case_id);
  if (conversation.mode === 'CHAT') {
    appendMessage(
      conversation.id,
      'system',
      `Escalated to a human agent (case ${caseId}).`,
    );
  }
  return NextResponse.json({
    success: true,
    caseId,
    case: getCase(caseId),
    conversation: getConversation(conversation.id),
  });
}

export const POST = withStore(handlePost);
