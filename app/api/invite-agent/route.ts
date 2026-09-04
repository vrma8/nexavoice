import { NextRequest, NextResponse } from 'next/server';
import { ExpiresIn } from 'agora-agents';
import type { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { createAgoraClient, getAgoraCredentials } from '@/lib/agora-server';
import { buildNexaVoiceAgent } from '@/lib/agent-config';
import { getToolSecret, resolveToolsBaseUrl } from '@/lib/agent-tools';
import {
  createConversation,
  findConversationByChannel,
  recordEvent,
  updateConversation,
} from '@/lib/support/store';

// agentUid identifies the AI in the RTC channel and shares its default with the client.
const agentUid = String(DEFAULT_AGENT_UID);

/**
 * POST /api/invite-agent
 * Starts the NexaVoice Conversational AI agent in the caller's channel and
 * registers a VOICE conversation so tools, escalation and the human dashboard
 * can track the call.
 */
export async function POST(request: NextRequest) {
  try {
    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name } = body;

    // Validate env early so misconfiguration surfaces with a clear message.
    getAgoraCredentials();

    if (!channel_name || !requester_id) {
      return NextResponse.json(
        { error: 'channel_name and requester_id are required' },
        { status: 400 },
      );
    }

    // One conversation per channel; re-invites (e.g. after an agent crash) reuse it.
    const conversation =
      findConversationByChannel(channel_name) ??
      createConversation({ mode: 'VOICE', channel: channel_name, customerUid: requester_id });

    const client = createAgoraClient();
    const toolToken = getToolSecret();
    const toolsBaseUrl = resolveToolsBaseUrl();
    if (!toolToken || !toolsBaseUrl) {
      console.warn(
        '[invite-agent] Backend tools disabled: set AGENT_TOOLS_SECRET (>=8 chars) and AGENT_TOOLS_BASE_URL (public https URL of this app) so the Agora agent can call the demo backend.',
      );
    }

    const { agent, toolsEnabled, llmMode } = buildNexaVoiceAgent({
      client,
      conversationId: conversation.id,
      toolToken: toolToken && toolsBaseUrl ? toolToken : null,
    });

    // remoteUids restricts the agent to only process audio from this user,
    // so a human agent joining later is never transcribed as the customer.
    const session = agent.createSession({
      name: `nexavoice-${conversation.id}`,
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 60,
      expiresIn: ExpiresIn.hours(1),
      debug: process.env.AGORA_DEBUG === 'true',
    });

    const agentId = await session.start();

    updateConversation(conversation.id, { agentId, customerUid: requester_id, agentState: 'starting' });
    recordEvent(conversation.id, 'agent.started', `${agentId} (${llmMode}${toolsEnabled ? ', tools' : ', no tools'})`);

    return NextResponse.json({
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
      conversation_id: conversation.id,
      tools_enabled: toolsEnabled,
    } as AgentResponse);
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to start conversation',
      },
      { status: 500 },
    );
  }
}
