import { NextRequest, NextResponse } from 'next/server';
import { speakAsAgent, stopAgent } from '@/lib/agora-server';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { normalizeLanguageName } from '@/lib/agent-prompt';
import { getCase, getConversation, recordEvent, updateConversation } from '@/lib/support/store';
import { withStore } from '@/lib/support/route-store';

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

function handoverLine(language?: string): string {
  switch (normalizeLanguageName(language)) {
    case 'hindi':
      return 'Aapko ab hamare support agent se connect kiya ja raha hai. Main line chhod rahi hoon, kripya hold karein.';
    case 'hinglish':
      return 'Ab main aapko hamare support agent se connect kar rahi hoon. Main call chhod rahi hoon, please hold karein.';
    default:
      return 'I am connecting you to a human support agent now. I am leaving the line — please stay on the call.';
  }
}

async function handlePost(request: NextRequest, { params }: Params) {
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
        text: handoverLine(conversation.context.language),
      });
      announcement = 'spoken';
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

export const POST = withStore(handlePost);
