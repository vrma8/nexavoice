import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getToolSecret, TOOL_TOKEN_HEADER } from '@/lib/agent-tools';
import { executeTool, getToolDefinition, TOOL_DEFINITIONS } from '@/lib/support/tools';
import { withStore } from '@/lib/support/route-store';

export const maxDuration = 30;

async function handlePost(request: NextRequest, context: { params: Promise<{ tool: string }> }) {
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

async function handleGet(request: NextRequest) {
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

function stripUnrenderedPlaceholders(args: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && /^\{\{\s*[\w.]+\s*\}\}$/.test(value)) continue;
    if (value === null || value === undefined || value === '') continue;
    clean[key] = value;
  }
  return clean;
}

export const GET = withStore(handleGet);
export const POST = withStore(handlePost);
