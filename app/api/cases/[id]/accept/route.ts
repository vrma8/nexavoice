import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { getAgoraCredentials } from '@/lib/agora-server';
import { acceptCase, getCase, getConversation } from '@/lib/support/store';
import { DEFAULT_AGENT_UID, DEFAULT_HUMAN_UID } from '@/lib/agora';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/cases/:id/accept  { agentName }
 *
 * Human agent accepts the case (state → HUMAN_HANDLING). For voice cases the
 * response also contains an RTC+RTM token for the *same* Agora channel so the
 * dashboard can join the call (v1.md §19). The AI agent is stopped separately
 * by /api/cases/:id/takeover once the human has actually joined.
 */
export async function POST(request: NextRequest, { params }: Params) {
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

  let voice: { token: string; uid: string; channel: string; agentUid: string } | null = null;
  if (conversation?.mode === 'VOICE' && conversation.channel) {
    const { appId, appCertificate } = getAgoraCredentials();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = RtcTokenBuilder.buildTokenWithRtm(
      appId,
      appCertificate,
      conversation.channel,
      String(DEFAULT_HUMAN_UID),
      RtcRole.PUBLISHER,
      expiresAt,
      expiresAt,
    );
    voice = {
      token,
      uid: String(DEFAULT_HUMAN_UID),
      channel: conversation.channel,
      agentUid: String(DEFAULT_AGENT_UID),
    };
  }

  return NextResponse.json({ case: supportCase, conversation, voice });
}
