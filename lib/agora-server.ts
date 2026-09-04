/**
 * Server-only Agora helpers: credentials, a shared `AgoraClient` factory and
 * agent control calls (stop / speak / interrupt) that work without holding an
 * `AgentSession` reference — e.g. when a human agent takes over a call from
 * the dashboard.
 *
 * Never import this from client components: it reads the App Certificate.
 * (No `server-only` marker on purpose — the contract tests import API routes
 * under plain Node via tsx.)
 */
import { AgoraClient, Area, generateConvoAIToken } from 'agora-agents';

export function getAgoraCredentials(): { appId: string; appCertificate: string } {
  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;
  if (!appId || !appCertificate) {
    throw new Error(
      'Missing Agora configuration. Set NEXT_PUBLIC_AGORA_APP_ID and NEXT_AGORA_APP_CERTIFICATE.',
    );
  }
  return { appId, appCertificate };
}

/** `Area` also has `Unknown`/`CN`; the four routable public areas are what `AGORA_AREA` takes. */
type GlobalArea = Area.US | Area.EU | Area.AP | Area.CN;

let warnedAboutArea = false;

/**
 * `AGORA_AREA` must match the region the Agora project was created in. An unrecognised
 * value used to fall through to US silently, which on a project in another region shows
 * up as an agent that starts slowly or not at all — so say it out loud once.
 */
function resolveArea(): GlobalArea {
  const raw = process.env.AGORA_AREA?.trim();
  switch ((raw ?? 'US').toUpperCase()) {
    case 'EU':
      return Area.EU;
    case 'AP':
      return Area.AP;
    case 'CN':
      return Area.CN;
    case 'US':
    case '':
      return Area.US;
    default:
      if (!warnedAboutArea) {
        warnedAboutArea = true;
        console.warn(
          `[agora] AGORA_AREA="${raw}" is not one of US | EU | AP | CN — falling back to US. ` +
            'Set it to the region of your Agora project (Agora Console → Project → Configuration).',
        );
      }
      return Area.US;
  }
}

/** New client per request: cheap, and avoids sharing pool state across requests. */
export function createAgoraClient(): AgoraClient {
  const { appId, appCertificate } = getAgoraCredentials();
  return new AgoraClient({ area: resolveArea(), appId, appCertificate });
}

/**
 * Per-call ConvoAI auth headers for the low-level generated clients
 * (`client.agents.*`). Mirrors what `AgentSession` does internally in
 * app-credentials mode: `Authorization: agora token=<convoai token>`.
 */
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

/** Stops an agent; resolves `already-stopping` instead of throwing when it is gone. */
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

/**
 * Makes the agent say `text` immediately (interrupting anything it is saying).
 * Used for the human-takeover announcement before the AI leaves the channel.
 */
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
