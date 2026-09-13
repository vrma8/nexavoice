import { createHmac } from 'node:crypto';
import type { Agora } from 'agora-agents';
import { getAgoraCredentialsOrNull } from '@/lib/agora-server';
import { getVisibleToolDefinitions, type ToolDefinition } from '@/lib/support/tools';

type LlmTool = Agora.LlmTool;

export const TOOL_TOKEN_HEADER = 'x-nexavoice-tool-token';

export const TEMPLATE_VARS = {
  conversationId: 'nv_conversation_id',
  toolToken: 'nv_tool_token',
} as const;

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

function deriveToolSecret(): string | null {
  const credentials = getAgoraCredentialsOrNull();
  if (!credentials) return null;
  const digest = createHmac('sha256', credentials.appCertificate)
    .update(`nexavoice-agent-tools:${credentials.appId}`)
    .digest('hex');
  return digest.slice(0, 48);
}

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

function bodyTemplate(definition: ToolDefinition): Record<string, unknown> {
  const body: Record<string, unknown> = {
    tool_call_id: '{{tool_call_id}}',
  };
  for (const key of Object.keys(definition.parameters.properties)) {
    body[key] = `{{args.${key}}}`;
  }
  return body;
}

export function buildAgoraRestTools(baseUrl = resolveToolsBaseUrl()): LlmTool[] | null {
  if (!baseUrl) return null;
  return getVisibleToolDefinitions().map((definition) => ({
    type: 'function',
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
    },
    execution: { mode: 'sync' },
    server: {
      method: 'POST',
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
