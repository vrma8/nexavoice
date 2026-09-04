import { NextRequest, NextResponse } from 'next/server';
import { speakAsAgent, stopAgent } from '@/lib/agora-server';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { getCase, getConversation, recordEvent, updateConversation } from '@/lib/support/store';

type Params = { params: Promise<{ id: string }> };

const HANDOVER_LINE =
  'Aapko ab hamare support agent se connect kiya ja raha hai. Main line chhod rahi hoon, please hold karein.';

/**
 * POST /api/cases/:id/takeover  { humanUid }
 *
 * Called by the dashboard once the human agent has joined the RTC channel:
 * the AI announces the handover, then leaves the channel so only the human and
 * the customer remain (v1.md §19 "AI stops/mutes").
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supportCase = getCase(id);
  if (!supportCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  const conversation = getConversation(supportCase.conversationId);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  let body: { humanUid?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional
  }

  let aiStopped = false;
  let announcement: 'spoken' | 'skipped' | 'failed' = 'skipped';
  if (conversation.mode === 'VOICE' && conversation.agentId && conversation.channel) {
    try {
      await speakAsAgent({
        agentId: conversation.agentId,
        channel: conversation.channel,
        agentUid: DEFAULT_AGENT_UID,
        text: HANDOVER_LINE,
      });
      announcement = 'spoken';
      // Give TTS a moment to play the line before the agent leaves.
      await new Promise((resolve) => setTimeout(resolve, 4500));
    } catch (error) {
      announcement = 'failed';
      console.warn('[takeover] handover announcement failed (continuing):', error);
    }
    try {
      await stopAgent(conversation.agentId);
      aiStopped = true;
      recordEvent(conversation.id, 'agent.stopped', 'human takeover');
    } catch (error) {
      console.error('[takeover] failed to stop AI agent:', error);
    }
  }

  updateConversation(conversation.id, {
    humanUid: body.humanUid,
    agentState: aiStopped ? 'left' : conversation.agentState,
    state: 'HUMAN_HANDLING',
  });
  recordEvent(conversation.id, 'human.joined', supportCase.assignedTo ?? body.humanUid);

  return NextResponse.json({
    ok: true,
    aiStopped,
    announcement,
    conversation: getConversation(conversation.id),
  });
}
