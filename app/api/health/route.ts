import { NextResponse } from 'next/server';
import { getAgoraCredentials } from '@/lib/agora-server';
import { getToolSecret, resolveToolsBaseUrl } from '@/lib/agent-tools';
import { INTERACTION_LANGUAGE, STT_LANGUAGE, TTS_VOICE_ID } from '@/lib/agent-config';
import { getStoreSyncStatus } from '@/lib/support/store';
import { getSeedStatus } from '@/lib/support/seed';
import { listConversations } from '@/lib/support/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health — deployment self-check.
 *
 * Reports which configuration a deployment actually loaded, without returning any
 * secret (only "set / missing" and lengths). This exists because the failure mode
 * on Vercel is silent: an unset variable turns the voice agent into a chatbot with
 * no backend access, or makes the call fail to connect, with nothing in the UI to
 * say why. Open it in a browser after every deploy:
 *
 *   https://<your-deployment>/api/health
 */
export async function GET() {
  let credentials: { appId: string } | null = null;
  let credentialError: string | null = null;
  try {
    credentials = getAgoraCredentials();
  } catch (error) {
    credentialError = error instanceof Error ? error.message : String(error);
  }

  const toolsBaseUrl = resolveToolsBaseUrl();
  const toolSecret = getToolSecret();
  const sync = getStoreSyncStatus();

  return NextResponse.json(
    {
      status: credentialError ? 'error' : sync.lastError ? 'degraded' : 'ok',
      agora: {
        appIdConfigured: Boolean(credentials),
        appId: credentials ? mask(credentials.appId) : null,
        appCertificateConfigured: Boolean(process.env.NEXT_AGORA_APP_CERTIFICATE?.trim()),
        /** Whether the browser bundle was given the public App ID at build time. */
        publicAppIdInlined: Boolean(process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim()),
        area: process.env.AGORA_AREA?.trim().toUpperCase() || 'US',
        error: credentialError,
      },
      agent: {
        llm: process.env.NEXT_LLM_URL?.trim() && process.env.NEXT_LLM_API_KEY?.trim() ? 'custom' : 'agora-managed',
        tools: {
          enabled: Boolean(toolsBaseUrl && toolSecret),
          baseUrl: toolsBaseUrl,
          secretSource: process.env.AGENT_TOOLS_SECRET?.trim()
            ? 'AGENT_TOOLS_SECRET'
            : toolSecret
              ? 'derived-from-app-certificate'
              : null,
        },
        interactionLanguage: INTERACTION_LANGUAGE,
        sttLanguage: STT_LANGUAGE,
        ttsVoice: TTS_VOICE_ID,
      },
      seed: getSeedStatus(),
      store: {
        ...sync,
        conversations: listConversations().length,
        note:
          sync.backend === 'none'
            ? 'In-memory only: conversation state lives per instance and is lost on cold start. On Vercel, create a Blob store (Storage → Blob) so BLOB_READ_WRITE_TOKEN is injected — state is then shared by every instance.'
            : `Shared via ${sync.backend}.`,
      },
      checkedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** First 6 chars only — enough to confirm the right project is wired up. */
function mask(appId: string): string {
  return appId.length > 8 ? `${appId.slice(0, 6)}…${appId.slice(-4)}` : 'set';
}
