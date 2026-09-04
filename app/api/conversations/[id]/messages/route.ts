import { NextRequest, NextResponse } from 'next/server';
import { appendMessage, getCase, getConversation } from '@/lib/support/store';
import { runChatTurn } from '@/lib/chat-agent';
import { withStore } from '@/lib/support/route-store';

/** Runs an AI turn (possibly an upstream LLM with tool calls) before responding. */
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/conversations/:id/messages
 * Body: { content: string, role?: "user" | "human_agent" }
 *
 * - Customer message while AI_HANDLING → runs the AI turn (with tools) and
 *   returns the AI reply.
 * - Customer message while a human handles the chat → stored only; the human
 *   answers from the dashboard.
 * - role "human_agent" → message from the dashboard to the customer.
 */
async function handlePost(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  let body: { content?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }
  if (conversation.state === 'CLOSED' || conversation.state === 'RESOLVED') {
    return NextResponse.json({ error: 'Conversation is closed' }, { status: 409 });
  }

  if (body.role === 'human_agent') {
    const message = appendMessage(id, 'human_agent', content);
    return NextResponse.json({ message, conversation: getConversation(id) });
  }

  const userMessage = appendMessage(id, 'user', content);

  if (conversation.state !== 'AI_HANDLING') {
    // Human owns the conversation: just store it.
    return NextResponse.json({
      message: userMessage,
      reply: null,
      conversation: getConversation(id),
      case: conversation.caseId ? getCase(conversation.caseId) : null,
    });
  }

  const reply = await runChatTurn(id);
  const replyMessage = appendMessage(id, 'ai', reply.text);
  const updated = getConversation(id)!;
  return NextResponse.json({
    message: userMessage,
    reply: replyMessage,
    conversation: updated,
    case: updated.caseId ? getCase(updated.caseId) : null,
    degraded: reply.degraded,
  });
}

// Bracketed by withStore so the durable store mirror is read before the
// handler runs and written back before the response is flushed (serverless).
export const POST = withStore(handlePost);
