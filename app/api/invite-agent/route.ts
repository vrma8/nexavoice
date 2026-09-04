import { NextRequest, NextResponse } from 'next/server';
import { ExpiresIn } from 'agora-agents';
import type { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { createAgoraClient, getAgoraCredentials } from '@/lib/agora-server';
import { buildNexaVoiceAgent } from '@/lib/agent-config';
import { resolveToolAccess } from '@/lib/agent-tools';
import {
  createConversation,
  findConversationByChannel,
  recordEvent,
  updateConversation,
} from '@/lib/support/store';
import { withStore } from '@/lib/support/route-store';

// agentUid identifies the AI in the RTC channel and shares its default with the client.
const agentUid = String(DEFAULT_AGENT_UID);

/**
 * `/join` is a round trip to Agora's control plane (plus one to the tool URL
 * resolution path); Vercel's stock function budget is too tight for a cold start.
 */
export const maxDuration = 30;

/**
 * POST /api/invite-agent
 * Starts the NexaVoice Conversational AI agent in the caller's channel and
 * registers a VOICE conversation so tools, escalation and the human dashboard
 * can track the call.
 */
async function handlePost(request: NextRequest) {
  let conversationIdForFailure: string | undefined;

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
    conversationIdForFailure = conversation.id;

    const client = createAgoraClient();
    // The engine calls back into *this* deployment, so the origin the browser just
    // used is the authoritative public URL — no AGENT_TOOLS_BASE_URL to remember.
    const access = resolveToolAccess(new URL(request.url).origin);
    if (!access) {
      console.warn(
        '[invite-agent] Backend tools disabled: the app needs a public https URL the Agora engine can reach (AGENT_TOOLS_BASE_URL, or a Vercel URL) so the agent can call /api/agent-tools/*.',
      );
    }

    const { agent, toolsEnabled, llmMode } = buildNexaVoiceAgent({
      client,
      conversationId: conversation.id,
      toolToken: access?.secret ?? null,
      toolsBaseUrl: access?.baseUrl ?? null,
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
    const detail = describeAgentStartError(error);
    console.error('[invite-agent] failed to start conversation:', detail.raw, error);
    // Record the failure on the conversation so the dashboard and /api/health show
    // why the call did not connect instead of an empty "live calls" list.
    if (conversationIdForFailure) {
      recordEvent(conversationIdForFailure, 'agent.stopped', `start failed: ${detail.message}`);
    }
    return NextResponse.json(
      { error: detail.message, hint: detail.hint, status_code: detail.statusCode },
      { status: 502 },
    );
  }
}

interface DescribedError {
  message: string;
  hint?: string;
  statusCode?: number;
  raw: string;
}

/**
 * Turns an `agora-agents` API error into something the UI can show. Without this
 * the browser only ever saw "Failed to start conversation", which is why voice
 * failures on a deployment are so hard to diagnose.
 */
function describeAgentStartError(error: unknown): DescribedError {
  const err = error as {
    statusCode?: number;
    body?: { message?: string; detail?: string; reason?: string };
    message?: string;
  } | null;

  const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
  const raw =
    err?.body?.message ??
    err?.body?.detail ??
    (error instanceof Error ? error.message : String(error));
  const lower = raw.toLowerCase();

  let hint: string | undefined;
  if (statusCode === 401 || statusCode === 403) {
    hint =
      'Agora rejected the request. Check NEXT_AGORA_APP_CERTIFICATE, and confirm Conversational AI is enabled for the project (Agora Console → Project → All features → Conversational AI, or `agora project doctor --deep`).';
  } else if (statusCode === 429) {
    hint = 'Agora rate-limited or the project quota is exhausted. Check the project usage page in Agora Console.';
  } else if (/timeout|network|fetch failed|enotfound|econn/i.test(lower)) {
    hint =
      `This deployment could not reach Agora's ${process.env.AGORA_AREA ?? 'US'} control plane. If the project lives in another region, set AGORA_AREA (US | EU | AP).`;
  } else if (/invalid.*config|invalidrequest|property|validation/i.test(lower)) {
    hint = 'Agora rejected the agent configuration. Run `agora project doctor --deep` and check the AGENT_* variables in the deployment.';
  }

  return { message: raw || 'Failed to start conversation', hint, statusCode, raw };
}

// Bracketed by withStore so the durable store mirror is read before the
// handler runs and written back before the response is flushed (serverless).
export const POST = withStore(handlePost);
