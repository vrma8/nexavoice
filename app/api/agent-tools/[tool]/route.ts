import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getToolSecret, TOOL_TOKEN_HEADER } from '@/lib/agent-tools';
import { executeTool, getToolDefinition, TOOL_DEFINITIONS } from '@/lib/support/tools';

/**
 * POST /api/agent-tools/<tool>?conversation_id=<id>
 *
 * Endpoint invoked by the Agora Conversational AI Engine for inline REST tools
 * (see lib/agent-tools.ts). The engine renders the JSON body from the LLM's
 * arguments; the conversation id and the shared secret come from
 * `template_variables` we set when starting the session, so neither can be
 * influenced by the model.
 *
 * Responses are always 200 with a JSON payload the LLM can read — including
 * business errors — so the model can explain problems instead of failing.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ tool: string }> }) {
  const { tool } = await context.params;

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Invalid tool token.' }, { status: 401 });
  }

  const definition = getToolDefinition(tool);
  if (!definition) {
    return NextResponse.json(
      { error: 'UNKNOWN_TOOL', message: `Unknown tool ${tool}.`, available: TOOL_DEFINITIONS.map((t) => t.name) },
      { status: 404 },
    );
  }

  const conversationId = request.nextUrl.searchParams.get('conversation_id');
  if (!conversationId) {
    return NextResponse.json(
      { error: 'MISSING_CONVERSATION', message: 'conversation_id query parameter is required.' },
      { status: 400 },
    );
  }

  let args: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    args = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON', message: 'Body must be JSON.' }, { status: 400 });
  }

  const { tool_call_id: toolCallId, ...toolArgs } = args;
  const outcome = await executeTool(conversationId, definition.name, stripUnrenderedPlaceholders(toolArgs));

  return NextResponse.json({
    ok: outcome.ok,
    tool: definition.name,
    tool_call_id: typeof toolCallId === 'string' ? toolCallId : undefined,
    ...outcome.result,
  });
}

/** GET lists the tool catalogue (handy for debugging the deployment). */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  return NextResponse.json({
    tools: TOOL_DEFINITIONS.map((t) => ({ name: t.name, write: t.write, description: t.description })),
  });
}

function isAuthorized(request: NextRequest): boolean {
  const secret = getToolSecret();
  if (!secret) return false;
  const provided = request.headers.get(TOOL_TOKEN_HEADER) ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * When the LLM omits an optional argument, some engines send the raw
 * placeholder string (`{{args.order_id}}`) through. Treat those as absent.
 */
function stripUnrenderedPlaceholders(args: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && /^\{\{\s*[\w.]+\s*\}\}$/.test(value)) continue;
    if (value === null || value === undefined || value === '') continue;
    clean[key] = value;
  }
  return clean;
}
