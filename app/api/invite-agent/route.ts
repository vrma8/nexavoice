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
import { prisma, hasDatabaseUrl } from '@/lib/db';
import type { CustomerSnapshot } from '@/lib/support/types';

const agentUid = String(DEFAULT_AGENT_UID);

export const maxDuration = 30;

async function handlePost(request: NextRequest) {
  let conversationIdForFailure: string | undefined;

  try {
    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name } = body;

    getAgoraCredentials();

    if (!channel_name || !requester_id) {
      return NextResponse.json(
        { error: 'channel_name and requester_id are required' },
        { status: 400 },
      );
    }

    const existing = findConversationByChannel(channel_name);
    let conversation = existing;
    if (!conversation) {
      const customer = await loadClient(body.client_id?.trim());
      conversation = createConversation({
        mode: 'VOICE',
        channel: channel_name,
        customerUid: requester_id,
        customerName: customer?.name ?? body.customer_name?.trim() ?? undefined,
        customer,
      });
    } else if (!conversation.context.customerName && body.customer_name?.trim()) {
      updateConversation(conversation.id, { context: { customerName: body.customer_name.trim() } });
    }
    conversationIdForFailure = conversation.id;

    const client = createAgoraClient();
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
      customer: {
        name: conversation.context.customer?.name ?? conversation.context.customerName,
        preferredLanguage: conversation.context.customer?.preferredLanguage,
      },
    });

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
    if (conversationIdForFailure) {
      recordEvent(conversationIdForFailure, 'agent.stopped', `start failed: ${detail.message}`);
    }
    return NextResponse.json(
      { error: detail.message, hint: detail.hint, status_code: detail.statusCode },
      { status: 502 },
    );
  }
}

const DEFAULT_ADDRESS = 'B-42, Lajpat Nagar II, New Delhi 110024';

async function loadClient(clientId?: string): Promise<CustomerSnapshot> {
  const fallbackCustomer: CustomerSnapshot = {
    id: clientId?.trim() || 'demo-client-1',
    name: 'Rahul Sharma',
    phone: '9876543210',
    email: 'rahul.sharma@example.com',
    tier: 'prime',
    city: 'Delhi',
    address: DEFAULT_ADDRESS,
    preferredLanguage: 'hinglish',
  };

  if (!hasDatabaseUrl()) return fallbackCustomer;
  try {
    let row = clientId?.trim()
      ? await prisma.client.findUnique({ where: { id: clientId.trim() } })
      : null;
    if (!row) {
      row = await prisma.client.findFirst({ orderBy: { createdAt: 'asc' } });
    }
    if (!row) return fallbackCustomer;
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      tier: row.tier,
      city: row.city,
      address: row.address?.trim() || DEFAULT_ADDRESS,
      preferredLanguage: row.preferredLanguage,
    };
  } catch (error) {
    console.warn('[invite-agent] could not load client:', error);
    return fallbackCustomer;
  }
}

interface DescribedError {
  message: string;
  hint?: string;
  statusCode?: number;
  raw: string;
}

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

export const POST = withStore(handlePost);
