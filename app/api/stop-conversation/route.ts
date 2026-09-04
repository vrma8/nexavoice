import { NextResponse } from 'next/server';
import type { StopConversationRequest } from '@/types/conversation';
import { stopAgent } from '@/lib/agora-server';
import { closeConversation, getConversation, recordEvent } from '@/lib/support/store';

/**
 * POST /api/stop-conversation
 * Stops the Conversational AI agent. Idempotent: an agent that already left is
 * reported as `already-stopping`. Optionally closes the backend conversation.
 */
export async function POST(request: Request) {
  try {
    const body: StopConversationRequest = await request.json();
    const { agent_id, conversation_id } = body;

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    const outcome = await stopAgent(agent_id);

    if (conversation_id) {
      const conversation = getConversation(conversation_id);
      if (conversation) {
        recordEvent(conversation.id, 'agent.stopped', agent_id);
        if (conversation.state !== 'RESOLVED' && conversation.state !== 'CLOSED') {
          // Customer hung up. An open case stays visible on the dashboard and is
          // flagged "customer left" so the human agent can call back.
          closeConversation(conversation.id, 'customer ended call');
        }
      }
    }

    if (outcome === 'already-stopping') {
      return NextResponse.json({ success: true, state: 'already-stopping' });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error stopping conversation:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to stop conversation',
      },
      { status: 500 },
    );
  }
}
