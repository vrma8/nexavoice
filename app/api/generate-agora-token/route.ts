import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

const EXPIRATION_TIME_IN_SECONDS = 3600;

/**
 * GET /api/generate-agora-token[?uid=&channel=]
 * Issues one combined RTC + RTM token (see `buildTokenWithRtm`) and, when no
 * channel is supplied, mints a fresh one.
 *
 * The response also carries `appId`: the browser needs the App ID for `join()` and
 * for the RTM client, and a build-time inlined `NEXT_PUBLIC_AGORA_APP_ID` is a
 * Vercel footgun — if the variable is not marked for build, the client bundle gets
 * `undefined`, the RTC join fails, and the voice call "never connects" while every
 * server route keeps working. Reading it here makes the deployment self-sufficient.
 */
export const dynamic = 'force-dynamic';

function generateChannelName(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `ai-conversation-${timestamp}-${random}`;
}

export async function GET(request: NextRequest) {
  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return NextResponse.json(
      {
        error: 'Agora credentials are not set',
        hint: `Set ${appId ? '' : 'NEXT_PUBLIC_AGORA_APP_ID '}${appCertificate ? '' : 'NEXT_AGORA_APP_CERTIFICATE '}in Vercel → Project Settings → Environment Variables (Production), then redeploy so the build sees them.`,
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const uidStr = searchParams.get('uid');
  const parsedUid = uidStr ? parseInt(uidStr, 10) : Number.NaN;
  // uid 0 means "any unoccupied uid" in RTC, but RTM and the agent's
  // remoteUids filter both need a real, stable id — so assign one instead.
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

    return NextResponse.json({
      token,
      uid: uid.toString(),
      channel: channelName,
      appId,
      /** RTC tokens expire; the client renews via `token-privilege-will-expire`. */
      expiresAt: expirationTime,
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
