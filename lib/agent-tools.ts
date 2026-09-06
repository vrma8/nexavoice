/**
 * Agora Conversational AI inline REST tools.
 *
 * The Conversational AI Engine can call HTTP endpoints as LLM tools: each tool
 * is declared under `properties.llm.tools[]` with a JSON-schema function and a
 * `server` block describing the HTTP request. Placeholders:
 *   - `{{args.<name>}}`                → argument produced by the LLM (url/body only)
 *   - `{{template_variables.<name>}}`  → per-session constants we set on the LLM
 *   - `{{tool_call_id}}`               → engine-generated call id
 *
 * We point every tool at `/api/agent-tools/<tool_name>` on this app and pass
 * the conversation id + a shared secret via `template_variables`, so the tool
 * endpoint can (1) authenticate the engine and (2) scope the call to the
 * right customer conversation — the model never chooses the conversation.
 *
 * Shape follows `LlmTool` / `LlmToolServer` in `agora-agents` (SDK v2.7).
 */
import { createHmac } from 'node:crypto';
import type { Agora } from 'agora-agents';
import { getAgoraCredentialsOrNull } from '@/lib/agora-server';
import { TOOL_DEFINITIONS, type ToolDefinition } from '@/lib/support/tools';

type LlmTool = Agora.LlmTool;

export const TOOL_TOKEN_HEADER = 'x-nexavoice-tool-token';

/** Template variable names injected into the LLM config for tool routing. */
export const TEMPLATE_VARS = {
  conversationId: 'nv_conversation_id',
  toolToken: 'nv_tool_token',
} as const;

/**
 * Public base URL of this deployment (must be reachable from Agora's cloud).
 *
 * Precedence: explicit `AGENT_TOOLS_BASE_URL` → `requestOrigin` → `VERCEL_URL`.
 * The request origin is what makes a Vercel deployment self-configuring: the
 * browser always calls the app through its public https URL, so the same URL the
 * engine needs is already in hand. `VERCEL_URL` alone is unreliable here because a
 * preview deployment's host differs from the one the invite request arrived on.
 *
 * Local origins are rejected on purpose — Agora's cloud cannot reach
 * `localhost`, and silently configuring a tool that always times out is worse
 * than starting the agent without tools.
 */
export function resolveToolsBaseUrl(requestOrigin?: string | null): string | null {
  const explicit = process.env.AGENT_TOOLS_BASE_URL?.trim();
  if (explicit) return normalizeOrigin(explicit);

  const candidate =
    requestOrigin ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? '';
  if (!candidate) return null;

  const origin = normalizeOrigin(
    candidate.startsWith('http') ? candidate : `https://${candidate}`,
  );
  if (!origin) return null;

  const host = origin.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (isLocalHost(host)) {
    console.warn(
      `[agent-tools] "${host}" is not reachable from Agora's cloud — starting without backend tools. Expose the app over https (Vercel URL, ngrok, cloudflared) and set AGENT_TOOLS_BASE_URL.`,
    );
    return null;
  }
  return origin;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * `AGENT_TOOLS_BASE_URL` is the one knob an operator can get wrong in a way that
 * produces a 15s tool timeout per turn instead of an obvious error, so bad values
 * are reported and ignored rather than passed to the engine.
 */
function normalizeOrigin(value: string): string | null {
  const base = normalizeBaseUrl(value);
  if (!base) return null;
  try {
    const url = new URL(base);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.') ||
    /\.local$/.test(host) ||
    host === '[::1]'
  );
}

/**
 * Shared secret the engine must present on every tool call.
 *
 * `AGENT_TOOLS_SECRET` wins. Otherwise the app derives a stable per-deployment
 * secret from the Agora App Certificate: the value never leaves the server, it is
 * identical on every instance, and it changes on every redeploy of a project with a
 * new certificate — so tools work on Vercel with zero extra configuration instead of
 * answering "Backend tools disabled" in the logs.
 */
export function getToolSecret(): string | null {
  const secret = process.env.AGENT_TOOLS_SECRET?.trim();
  if (secret) {
    if (secret.length < 8) {
      console.warn(
        '[agent-tools] AGENT_TOOLS_SECRET is shorter than 8 characters — ignoring it.',
      );
    } else {
      return secret;
    }
  }
  return deriveToolSecret();
}

/** Derived from the App Certificate, which every deployment already has. */
function deriveToolSecret(): string | null {
  const credentials = getAgoraCredentialsOrNull();
  if (!credentials) return null;
  const digest = createHmac('sha256', credentials.appCertificate)
    .update(`nexavoice-agent-tools:${credentials.appId}`)
    .digest('hex');
  return digest.slice(0, 48);
}

/**
 * Tool calls are only safe to enable when the engine can actually reach this app
 * over https and we can authenticate the call — one check for both, so
 * `enable_tools` is never sent for a session that has no usable tools.
 */
export function resolveToolAccess(requestOrigin?: string | null): {
  baseUrl: string;
  secret: string;
} | null {
  const baseUrl = resolveToolsBaseUrl(requestOrigin);
  if (!baseUrl) return null;
  const secret = getToolSecret();
  if (!secret) return null;
  return { baseUrl, secret };
}

/** Placeholders may only be used as whole values, one per leaf (SDK docs). */
function bodyTemplate(definition: ToolDefinition): Record<string, unknown> {
  const body: Record<string, unknown> = {
    tool_call_id: '{{tool_call_id}}',
  };
  for (const key of Object.keys(definition.parameters.properties)) {
    body[key] = `{{args.${key}}}`;
  }
  return body;
}

/**
 * Builds the `llm.tools` array for one voice session.
 * Returns `null` when the deployment has no public URL — the caller then
 * starts the agent without tools (still works as a conversational agent).
 */
export function buildAgoraRestTools(baseUrl = resolveToolsBaseUrl()): LlmTool[] | null {
  if (!baseUrl) return null;
  return TOOL_DEFINITIONS.map((definition) => ({
    type: 'function',
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
    },
    execution: { mode: 'sync' },
    server: {
      method: 'POST',
      // Conversation id travels in the path so the endpoint never trusts the model for it.
      url: `${baseUrl}/api/agent-tools/${definition.name}?conversation_id={{template_variables.${TEMPLATE_VARS.conversationId}}}`,
      headers: {
        'Content-Type': 'application/json',
        [TOOL_TOKEN_HEADER]: `{{template_variables.${TEMPLATE_VARS.toolToken}}}`,
      },
      body: bodyTemplate(definition),
      timeout_ms: 15000,
    },
  }));
}
