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
import type { Agora } from 'agora-agents';
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
 * Order of precedence: explicit `AGENT_TOOLS_BASE_URL` → Vercel URL → null.
 */
export function resolveToolsBaseUrl(): string | null {
  const explicit = process.env.AGENT_TOOLS_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;
  return null;
}

export function getToolSecret(): string | null {
  const secret = process.env.AGENT_TOOLS_SECRET?.trim();
  return secret && secret.length >= 8 ? secret : null;
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
export function buildAgoraRestTools(): LlmTool[] | null {
  const baseUrl = resolveToolsBaseUrl();
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
