import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { getAgoraCredentials } from '@/lib/agora-server';

const EXPIRATION_TIME_IN_SECONDS = 3600;

export const dynamic = 'force-dynamic';

function generateChannelName(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `ai-conversation-${timestamp}-${random}`;
}

export async function GET(request: NextRequest) {
  let appId: string | undefined;
  let appCertificate: string | undefined;
  try {
    ({ appId, appCertificate } = getAgoraCredentials());
  } catch {
    // appId/appCertificate stay undefined; the branch below reports which names to set.
  }

  if (!appId || !appCertificate) {
    return NextResponse.json(
      {
        error: 'Agora credentials are not set',
        hint: `Set ${appId ? '' : 'NEXT_PUBLIC_AGORA_APP_ID (or AGORA_APP_ID) '}${appCertificate ? '' : 'NEXT_AGORA_APP_CERTIFICATE (or AGORA_APP_CERTIFICATE) '}in Vercel → Project Settings → Environment Variables (Production + Preview), then redeploy so the build sees them.`,
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const uidStr = searchParams.get('uid');
  const parsedUid = uidStr ? parseInt(uidStr, 10) : Number.NaN;
  const uid = Number.isNaN(parsedUid) || parsedUid <= 0
    ? Math.floor(Math.random() * 9_999_000) + 1000
    : parsedUid;
  const channelName = searchParams.get('channel') || generateChannelName();

  const expirationTime =
    Math.floor(Date.now() / 1000) + EXPIRATION_TIME_IN_SECONDS;

  try {
    const token = RtcTokenBuilder.buildTokenWithRtm(
      appId,
      appCertificate,
      channelName,
      uid.toString(),
      RtcRole.PUBLISHER,
      expirationTime,
      expirationTime,
    );

    if (!token) {
      return NextResponse.json(
        {
          error: 'Agora token generation produced an empty token',
          hint:
            'The credentials look malformed — Agora App IDs are exactly 32 characters and App Certificates are 32-character hex strings. ' +
            'Check NEXT_PUBLIC_AGORA_APP_ID (or AGORA_APP_ID) and NEXT_AGORA_APP_CERTIFICATE (or AGORA_APP_CERTIFICATE) in ' +
            'Vercel → Project Settings → Environment Variables (Production + Preview), then redeploy.',
          appIdLength: appId.length,
          appCertificateLength: appCertificate.length,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      token,
      uid: uid.toString(),
      channel: channelName,
      appId,
      expiresAt: expirationTime * 1000,
    });
  } catch (error) {
    console.error('Error generating Agora token:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate Agora token',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
