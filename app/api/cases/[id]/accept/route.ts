import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { getAgoraCredentials } from '@/lib/agora-server';
import { acceptCase, getCase, getConversation } from '@/lib/support/store';
import { DEFAULT_AGENT_UID, DEFAULT_HUMAN_UID } from '@/lib/agora';
import { withStore } from '@/lib/support/route-store';

export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

async function handlePost(request: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: { agentName?: string; agentEmail?: string } = {};
  try {
    body = await request.json();
  } catch {
    // agentName optional
  }
  const agentName = body.agentName?.trim() || 'Support Agent';
  const agentEmail = body.agentEmail?.trim() || undefined;

  const existing = getCase(id);
  if (!existing) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  const supportCase = acceptCase(id, agentName, agentEmail)!;
  const conversation = getConversation(supportCase.conversationId);

  let voice: { token: string; uid: string; channel: string; agentUid: string; appId: string } | null = null;
  if (conversation?.mode === 'VOICE' && conversation.channel) {
    const { appId, appCertificate } = getAgoraCredentials();
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
      appId,
    };
  }

  return NextResponse.json({ case: supportCase, conversation, voice });
}

export const POST = withStore(handlePost);
