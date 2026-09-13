import { NextResponse } from 'next/server';
import type { StopConversationRequest } from '@/types/conversation';
import { stopAgent } from '@/lib/agora-server';
import { closeConversation, getConversation, recordEvent } from '@/lib/support/store';
import { withStore } from '@/lib/support/route-store';

export const maxDuration = 30;

async function handlePost(request: Request) {
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

export const POST = withStore(handlePost);
