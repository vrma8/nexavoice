import { AgoraClient, Area, generateConvoAIToken } from 'agora-agents';

const APP_ID_ENV_VARS = ['NEXT_PUBLIC_AGORA_APP_ID', 'AGORA_APP_ID'] as const;
const APP_CERT_ENV_VARS = ['NEXT_AGORA_APP_CERTIFICATE', 'AGORA_APP_CERTIFICATE'] as const;

export const INERT_AGORA_ENV_VARS = [
  'AGORA_PROJECT_ID',
  'AGORA_PROJECT_NAME',
  'AGORA_ENABLED_FEATURES',
  'AGORA_FEATURE_RTC',
  'AGORA_FEATURE_RTM',
  'AGORA_FEATURE_CONVOAI',
] as const;

function firstEnvValue(names: readonly string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

export function getAgoraCredentials(): { appId: string; appCertificate: string } {
  const credentials = getAgoraCredentialsOrNull();
  if (!credentials) {
    throw new Error(
      'Missing Agora configuration. Set ' +
        `${APP_ID_ENV_VARS.join(' or ')} and ${APP_CERT_ENV_VARS.join(' or ')}.`,
    );
  }
  return credentials;
}

export function getAgoraCredentialsOrNull(): {
  appId: string;
  appCertificate: string;
} | null {
  const appId = firstEnvValue(APP_ID_ENV_VARS);
  const appCertificate = firstEnvValue(APP_CERT_ENV_VARS);
  if (!appId || !appCertificate) return null;
  return { appId: appId.value, appCertificate: appCertificate.value };
}

export function getAgoraCredentialSources(): {
  appId: string | null;
  appCertificate: string | null;
  inertVarsSet: string[];
} {
  return {
    appId: firstEnvValue(APP_ID_ENV_VARS)?.name ?? null,
    appCertificate: firstEnvValue(APP_CERT_ENV_VARS)?.name ?? null,
    inertVarsSet: INERT_AGORA_ENV_VARS.filter((name) => Boolean(process.env[name]?.trim())),
  };
}

type GlobalArea = Area.US | Area.EU | Area.AP | Area.CN;

let warnedAboutArea = false;
let infoedAboutGlobalRegion = false;

function rawAreaName(): string {
  const area = process.env.AGORA_AREA?.trim();
  if (area) return area;
  const region = process.env.AGORA_REGION?.trim();
  if (region) {
    if (region.toUpperCase() === 'GLOBAL') {
      if (!infoedAboutGlobalRegion) {
        infoedAboutGlobalRegion = true;
        console.info(
          '[agora] AGORA_REGION="global" has no dedicated Conversational AI gateway — ' +
            'routing through US (the default for global projects). Set AGORA_AREA=US|EU|AP|CN to override.',
        );
      }
      return 'US';
    }
    return region;
  }
  return 'US';
}

export function getResolvedArea(): GlobalArea {
  const raw = rawAreaName().toUpperCase();
  switch (raw) {
    case 'EU':
      return Area.EU;
    case 'AP':
      return Area.AP;
    case 'CN':
      return Area.CN;
    case 'US':
      return Area.US;
    default: {
      if (!warnedAboutArea) {
        warnedAboutArea = true;
        console.warn(
          `[agora] AGORA_AREA/AGORA_REGION="${rawAreaName()}" is not one of US | EU | AP | CN — falling back to US. ` +
            'Set AGORA_AREA to the region of your Agora project (Agora Console → Project → Configuration).',
        );
      }
      return Area.US;
    }
  }
}

export function createAgoraClient(): AgoraClient {
  const { appId, appCertificate } = getAgoraCredentials();
  return new AgoraClient({ area: getResolvedArea(), appId, appCertificate });
}

export function getResolvedAreaName(): string {
  return Area[getResolvedArea()];
}

export function convoAiAuthHeaders(
  client: AgoraClient,
  channelName: string,
  uid: number,
): Record<string, string> | undefined {
  if (client.authMode !== 'app-credentials') return undefined;
  const token = generateConvoAIToken({
    appId: client.appId,
    appCertificate: client.appCertificate,
    channelName,
    uid,
    tokenExpire: 600,
  });
  return { Authorization: `agora token=${token}` };
}

export function isAgentAlreadyStoppingOrStopped(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeErr = error as {
    statusCode?: number;
    body?: { detail?: string; reason?: string };
    message?: string;
  };
  const statusCode = maybeErr.statusCode;
  const reason = maybeErr.body?.reason?.toLowerCase();
  const detail = maybeErr.body?.detail?.toLowerCase() ?? maybeErr.message?.toLowerCase() ?? '';
  if (statusCode === 404) return true;
  if (reason === 'invalidrequest' && detail.includes('already in the process of shutting down')) {
    return true;
  }
  return false;
}

export async function stopAgent(agentId: string): Promise<'stopped' | 'already-stopping'> {
  const client = createAgoraClient();
  try {
    await client.stopAgent(agentId);
    return 'stopped';
  } catch (error) {
    if (isAgentAlreadyStoppingOrStopped(error)) return 'already-stopping';
    throw error;
  }
}

export async function speakAsAgent(opts: {
  agentId: string;
  channel: string;
  agentUid: number;
  text: string;
}): Promise<void> {
  const client = createAgoraClient();
  await client.agents.speak(
    {
      appid: client.appId,
      agentId: opts.agentId,
      text: opts.text.slice(0, 400),
      priority: 'INTERRUPT',
      interruptable: false,
    },
    { headers: convoAiAuthHeaders(client, opts.channel, opts.agentUid) },
  );
}

export interface ConvoAiProbe {
  ok: boolean;
  area: string;
  latencyMs?: number;
  agents?: { running: number; starting: number; total: number };
  error?: string;
  hint?: string;
  statusCode?: number;
}

export async function probeConvoAiControlPlane(timeoutInSeconds = 6): Promise<ConvoAiProbe> {
  const area = Area[getResolvedArea()];
  const client = createAgoraClient();
  const startedAt = Date.now();
  try {
    const page = await client.agents.list(
      { appid: client.appId, limit: 100 },
      {
        timeoutInSeconds,
        maxRetries: 0,
        headers: convoAiAuthHeaders(client, '', 0),
      },
    );
    const items = page.data ?? [];
    return {
      ok: true,
      area,
      latencyMs: Date.now() - startedAt,
      agents: {
        running: items.filter((agent) => agent.status === 'RUNNING').length,
        starting: items.filter(
          (agent) => agent.status === 'STARTING' || agent.status === 'IDLE',
        ).length,
        total: items.length,
      },
    };
  } catch (error) {
    const err = error as {
      statusCode?: number;
      body?: { message?: string; detail?: string; reason?: string };
      message?: string;
    } | null;
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
    const raw =
      err?.body?.message ?? err?.body?.detail ?? (error instanceof Error ? error.message : String(error));
    const lower = raw.toLowerCase();

    let hint: string | undefined;
    if (statusCode === 401 || statusCode === 403) {
      hint =
        'Agora rejected the credentials for the Conversational AI API. Check ' +
        `${APP_CERT_ENV_VARS.join(' / ')} belongs to the same project as the App ID, and that ` +
        'Conversational AI is enabled for it (Agora Console → Project → All features, or `agora project doctor --deep`).';
    } else if (statusCode === 429) {
      hint = 'Agora rate-limited the request or the project quota is exhausted — check the usage page in Agora Console.';
    } else if (/timeout|network|fetch failed|enotfound|econn/i.test(lower)) {
      hint =
        `This deployment could not reach the ${area} Conversational AI gateway. ` +
        'If the project lives in another region, set AGORA_AREA (US | EU | AP | CN).';
    }

    return { ok: false, area, error: raw || 'Control-plane request failed', hint, statusCode };
  }
}
