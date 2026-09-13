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
import { listConversations } from '@/lib/support/store';

export const dynamic = 'force-dynamic';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  await hydrateStore().catch(() => {});

  let credentials: { appId: string } | null = null;
  let credentialError: string | null = null;
  try {
    credentials = getAgoraCredentials();
  } catch (error) {
    credentialError = error instanceof Error ? error.message : String(error);
  }

  // without credentials (nothing to prove) and with ?deep=0 (pure config check).
  const deepRequested = request?.nextUrl?.searchParams?.get('deep') !== '0';
  let convoai: ConvoAiProbe | null = null;
  if (credentials && deepRequested) {
    convoai = await probeConvoAiControlPlane();
  }

  const appIdShapeError =
    credentials && credentials.appId.length !== 32
      ? `App ID is ${credentials.appId.length} characters — Agora App IDs are exactly 32. Tokens will be empty and voice calls will fail to connect.`
      : null;

  const toolsBaseUrl = resolveToolsBaseUrl();
  const toolSecret = getToolSecret();
  const sync = getStoreSyncStatus();

  return NextResponse.json(
    {
      status: credentialError
        ? 'error'
        : appIdShapeError || sync.lastError || convoai?.ok === false
          ? 'degraded'
          : 'ok',
      agora: {
        appIdConfigured: Boolean(credentials),
        appId: credentials ? mask(credentials.appId) : null,
        appIdLength: credentials ? credentials.appId.length : 0,
        appIdShapeError,
        appCertificateConfigured: Boolean(
          getAgoraCredentialSources().appCertificate,
        ),
        credentialSources: getAgoraCredentialSources(),
        publicAppIdInlined: Boolean(process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim()),
        area: getResolvedAreaName(),
        error: credentialError,
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

function mask(appId: string): string {
  return appId.length > 8 ? `${appId.slice(0, 6)}…${appId.slice(-4)}` : 'set';
}
