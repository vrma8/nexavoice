import { NextRequest, NextResponse } from 'next/server';
import {
  getAgoraCredentialSources,
  getAgoraCredentials,
  getResolvedAreaName,
  probeConvoAiControlPlane,
  type ConvoAiProbe,
} from '@/lib/agora-server';
import { getToolSecret, resolveToolsBaseUrl } from '@/lib/agent-tools';
import { INTERACTION_LANGUAGE, STT_LANGUAGE, TTS_VOICE_ID } from '@/lib/agent-config';
import { getStoreSyncStatus, hydrateStore } from '@/lib/support/store';
import { getSeedStatus } from '@/lib/support/seed';
import { listConversations } from '@/lib/support/store';

export const dynamic = 'force-dynamic';

// The deep check is a live round trip to Agora's Conversational AI control plane;
// the store hydration plus that probe still fit comfortably in a default function.
export const maxDuration = 30;

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
 *
 * By default it also performs one read-only live round trip to the Conversational
 * AI control plane (`agora.convoai`), which answers "is Agora actually connected
 * for this deployment?" — credentials accepted, feature enabled, gateway reachable,
 * quota left. Pass `?deep=0` to skip the round trip (offline checks only).
 */
export async function GET(request?: NextRequest) {
  // Read the shared document first: without this the conversation count below is this
  // instance's memory, which on Vercel says "0" next to a store that is working fine.
  await hydrateStore().catch(() => {});

  let credentials: { appId: string } | null = null;
  let credentialError: string | null = null;
  try {
    credentials = getAgoraCredentials();
  } catch (error) {
    credentialError = error instanceof Error ? error.message : String(error);
  }

  // One live, read-only call that proves the full server-side wiring in a single
  // shot: auth accepted, Conversational AI enabled, gateway area reachable. Skipped
  // without credentials (nothing to prove) and with ?deep=0 (pure config check).
  const deepRequested = request?.nextUrl?.searchParams?.get('deep') !== '0';
  let convoai: ConvoAiProbe | null = null;
  if (credentials && deepRequested) {
    convoai = await probeConvoAiControlPlane();
  }

  const toolsBaseUrl = resolveToolsBaseUrl();
  const toolSecret = getToolSecret();
  const sync = getStoreSyncStatus();

  return NextResponse.json(
    {
      status: credentialError
        ? 'error'
        : sync.lastError || convoai?.ok === false
          ? 'degraded'
          : 'ok',
      agora: {
        appIdConfigured: Boolean(credentials),
        appId: credentials ? mask(credentials.appId) : null,
        appCertificateConfigured: Boolean(
          getAgoraCredentialSources().appCertificate,
        ),
        /** Which env names provided the credentials, and inert Agora names that are set. */
        credentialSources: getAgoraCredentialSources(),
        /** Whether the browser bundle was given the public App ID at build time. */
        publicAppIdInlined: Boolean(process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim()),
        area: getResolvedAreaName(),
        error: credentialError,
        /** Live control-plane round trip; null when skipped (?deep=0 / no credentials). */
        convoai,
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
            ? 'In-memory only: conversation state lives per instance and is lost on cold start. Set DATABASE_URL (PostgreSQL) and run pnpm db:push so state is shared by every instance through Prisma.'
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
