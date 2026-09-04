import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { getAgoraCredentials } from '@/lib/agora-server';
import { acceptCase, getCase, getConversation } from '@/lib/support/store';
import { DEFAULT_AGENT_UID, DEFAULT_HUMAN_UID } from '@/lib/agora';
import { withStore } from '@/lib/support/route-store';

/** Token minting plus a durable store read/write. */
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/cases/:id/accept  { agentName }
 *
 * Human agent accepts the case (state → HUMAN_HANDLING). For voice cases the
 * response also contains an RTC+RTM token for the *same* Agora channel so the
 * dashboard can join the call (v1.md §19). The AI agent is stopped separately
 * by /api/cases/:id/takeover once the human has actually joined.
 */
async function handlePost(request: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: { agentName?: string } = {};
  try {
    body = await request.json();
  } catch {
    // agentName optional
  }
  const agentName = body.agentName?.trim() || 'Support Agent';

  const existing = getCase(id);
  if (!existing) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  const supportCase = acceptCase(id, agentName)!;
  const conversation = getConversation(supportCase.conversationId);

  let voice: { token: string; uid: string; channel: string; agentUid: string; appId: string } | null = null;
  if (conversation?.mode === 'VOICE' && conversation.channel) {
    const { appId, appCertificate } = getAgoraCredentials();
    // RtcTokenBuilder takes a Unix *seconds* expiry; naming it `expiresAt` here once
    // made a milliseconds field out of it and clients compared it to Date.now().
    const expirationTs = Math.floor(Date.now() / 1000) + 3600;
    const token = RtcTokenBuilder.buildTokenWithRtm(
      appId,
      appCertificate,
      conversation.channel,
      String(DEFAULT_HUMAN_UID),
      RtcRole.PUBLISHER,
      expirationTs,
      expirationTs,
    );
    voice = {
      token,
      uid: String(DEFAULT_HUMAN_UID),
      channel: conversation.channel,
      agentUid: String(DEFAULT_AGENT_UID),
      // Same reason as /api/generate-agora-token: the human agent's browser must not
      // depend on a build-time-inlined App ID to be able to join the call.
      appId,
    };
  }

  return NextResponse.json({ case: supportCase, conversation, voice });
}

// Bracketed by withStore so the durable store mirror is read before the
// handler runs and written back before the response is flushed (serverless).
export const POST = withStore(handlePost);
