import { AgoraClient, Agent } from 'agora-agents';
import { RtcTokenBuilder } from 'agora-token';
import { NextRequest } from 'next/server';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

process.env.NEXT_PUBLIC_AGORA_APP_ID = '0123456789abcdef0123456789abcdef';
process.env.NEXT_AGORA_APP_CERTIFICATE = 'fedcba9876543210fedcba9876543210';
// Keep the durable mirror off unless a test turns it on: contract checks must not
// touch a developer's real store just because DATABASE_URL is in the env file.
process.env.NEXAVOICE_STORE = 'memory';

/**
 * Durability checks need PostgreSQL. They skip (without failing) when no database
 * is reachable — e.g. inside a build container that has no Postgres — so the rest
 * of the contract suite still runs.
 */
async function postgresAvailable(): Promise<boolean> {
  if (!process.env.DATABASE_URL?.trim()) return false;
  try {
    const { Client } = await import('pg');
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 2000,
    });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/** Deletes a Postgres-backed store document, used to clean up isolated test state. */
async function deleteStoreDocument(key: string): Promise<void> {
  try {
    const { prisma } = await import('../lib/db');
    await prisma.storeState.deleteMany({ where: { id: key } });
  } catch {
    // Best effort — the row id is unique to this process run.
  }
}


async function verifyGenerateAgoraTokenRoute() {
  const { GET: generateAgoraToken } =
    await import('../app/api/generate-agora-token/route');
  const originalBuildTokenWithRtm = RtcTokenBuilder.buildTokenWithRtm;
  let tokenBuilderArgs: unknown[] | null = null;

  RtcTokenBuilder.buildTokenWithRtm = ((...args: unknown[]) => {
    tokenBuilderArgs = args;
    return 'mock-rtc-rtm-token';
  }) as typeof RtcTokenBuilder.buildTokenWithRtm;

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/generate-agora-token?uid=4321&channel=test-channel',
    );
    const response = await generateAgoraToken(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'GET /api/generate-agora-token should return 200',
    );
    assert(
      body.token === 'mock-rtc-rtm-token',
      'GET /api/generate-agora-token should return the built token',
    );
    assert(
      body.uid === '4321',
      'GET /api/generate-agora-token should preserve the requested uid',
    );
    assert(
      body.channel === 'test-channel',
      'GET /api/generate-agora-token should preserve the requested channel',
    );
    // Unit guard: Agora's token builder wants Unix *seconds*, but a client comparing an
    // expiry against Date.now() needs milliseconds. Returning the builder's raw value
    // reads as an expiry in 1970 and silently breaks anything that schedules on it.
    assert(
      typeof body.expiresAt === 'number' &&
        body.expiresAt > Date.now() &&
        body.expiresAt < Date.now() + 3_700_000,
      `expiresAt must be Unix milliseconds about an hour out, got ${body.expiresAt}`,
    );

    assert(
      Array.isArray(tokenBuilderArgs),
      'GET /api/generate-agora-token should call buildTokenWithRtm',
    );
    assert(
      tokenBuilderArgs?.[2] === 'test-channel',
      'buildTokenWithRtm should use the requested channel',
    );
    assert(
      tokenBuilderArgs?.[3] === '4321',
      'buildTokenWithRtm should receive the requested uid as account string',
    );
  } finally {
    RtcTokenBuilder.buildTokenWithRtm = originalBuildTokenWithRtm;
  }
}

async function verifyGenerateAgoraTokenReplacesZeroUid() {
  const { GET: generateAgoraToken } =
    await import('../app/api/generate-agora-token/route');
  const originalBuildTokenWithRtm = RtcTokenBuilder.buildTokenWithRtm;
  let tokenBuilderArgs: unknown[] | null = null;

  RtcTokenBuilder.buildTokenWithRtm = ((...args: unknown[]) => {
    tokenBuilderArgs = args;
    return 'mock-rtc-rtm-token';
  }) as typeof RtcTokenBuilder.buildTokenWithRtm;

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/generate-agora-token?uid=0&channel=test-channel',
    );
    const response = await generateAgoraToken(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'GET /api/generate-agora-token?uid=0 should return 200',
    );
    assert(
      typeof body.uid === 'string' && body.uid !== '0',
      'GET /api/generate-agora-token?uid=0 should generate an RTM-safe uid',
    );
    assert(
      Array.isArray(tokenBuilderArgs) && tokenBuilderArgs[3] === body.uid,
      'buildTokenWithRtm should mint the token for the generated uid',
    );
  } finally {
    RtcTokenBuilder.buildTokenWithRtm = originalBuildTokenWithRtm;
  }
}

async function verifyChatCompletionsMissingEnv() {
  const { createChatCompletionsHandler } = await import('../lib/chat-completions');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;

  delete process.env.NEXT_LLM_API_KEY;
  delete process.env.NEXT_LLM_URL;

  const handler = createChatCompletionsHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called when env is missing');
    }) as never,
    streamTextImpl: (() => {
      throw new Error('streamText should not be called when env is missing');
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: JSON.stringify({ messages: [] }),
        method: 'POST',
      },
    );
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 500,
      'POST /api/chat/completions should reject missing LLM env',
    );
    assert(
      body.error === 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set',
      'POST /api/chat/completions should explain missing LLM env',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyChatCompletionsInvalidJson() {
  const { createChatCompletionsHandler } = await import('../lib/chat-completions');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  const handler = createChatCompletionsHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called for invalid JSON');
    }) as never,
    streamTextImpl: (() => {
      throw new Error('streamText should not be called for invalid JSON');
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: '{not json',
        method: 'POST',
      },
    );
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 400,
      'POST /api/chat/completions should reject invalid JSON',
    );
    assert(
      body.error === 'Invalid JSON body',
      'POST /api/chat/completions should explain invalid JSON',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyChatCompletionsSseDone() {
  const { createChatCompletionsHandler } = await import('../lib/chat-completions');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  let capturedBaseUrl: string | undefined;
  let capturedModelId: string | undefined;
  let capturedMessages: unknown;

  const handler = createChatCompletionsHandler({
    createOpenAIClient: ((options: { baseURL?: string }) => {
      capturedBaseUrl = options.baseURL;
      return (modelId: string) => {
        capturedModelId = modelId;
        return { modelId };
      };
    }) as never,
    streamTextImpl: ((options: { messages?: unknown }) => {
      capturedMessages = options.messages;
      return {
        textStream: (async function* () {
          yield 'hello';
          yield ' world';
        })(),
      };
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: JSON.stringify({
          model: 'caller-model-ignored-for-routing',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        method: 'POST',
      },
    );
    const response = await handler(request);
    const text = await response.text();

    assert(
      response.status === 200,
      'POST /api/chat/completions should return 200 for a valid request',
    );
    assert(
      response.headers.get('content-type') === 'text/event-stream',
      'POST /api/chat/completions should return SSE content type',
    );
    assert(
      capturedBaseUrl === 'https://example.test/v1',
      'POST /api/chat/completions should pass base URL without /chat/completions',
    );
    assert(
      capturedModelId === 'gpt-4o',
      'POST /api/chat/completions should route to the pinned server model',
    );
    assert(
      JSON.stringify(capturedMessages) ===
        JSON.stringify([{ role: 'user', content: 'Hi' }]),
      'POST /api/chat/completions should pass request messages to streamText',
    );
    assert(
      text.includes('data: [DONE]'),
      'POST /api/chat/completions should terminate with [DONE]',
    );
    assert(
      text.includes('"content":"hello"') && text.includes('"content":" world"'),
      'POST /api/chat/completions should stream text chunks as OpenAI-compatible deltas',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyInviteAgentValidation() {
  const { POST: inviteAgent } = await import('../app/api/invite-agent/route');
  const request = new NextRequest('http://localhost:3000/api/invite-agent', {
    body: JSON.stringify({ channel_name: 'missing-requester' }),
    method: 'POST',
  });
  const response = await inviteAgent(request);
  const body = await getJson(response);

  assert(
    response.status === 400,
    'POST /api/invite-agent should reject missing fields',
  );
  assert(
    body.error === 'channel_name and requester_id are required',
    'POST /api/invite-agent should explain validation failure',
  );
}

async function verifyInviteAgentSuccess() {
  const { POST: inviteAgent } = await import('../app/api/invite-agent/route');
  const originalCreateSession = Agent.prototype.createSession;
  let capturedSessionConfig: {
    channel?: string;
    agentUid?: string;
    remoteUids?: string[];
  } | null = null;

  Agent.prototype.createSession = ((sessionConfig: unknown) => {
    capturedSessionConfig = sessionConfig as {
      channel?: string;
      agentUid?: string;
      remoteUids?: string[];
    };
    return {
      start: async () => 'mock-agent-id',
    };
  }) as unknown as typeof Agent.prototype.createSession;

  try {
    const request = new NextRequest('http://localhost:3000/api/invite-agent', {
      body: JSON.stringify({
        requester_id: 'user-4321',
        channel_name: 'test-channel',
      }),
      method: 'POST',
    });
    const response = await inviteAgent(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'POST /api/invite-agent should return 200 on success',
    );
    assert(
      body.agent_id === 'mock-agent-id',
      'POST /api/invite-agent should return the started agent id',
    );
    assert(
      body.state === 'RUNNING',
      'POST /api/invite-agent should return RUNNING state',
    );
    assert(
      capturedSessionConfig !== null,
      'POST /api/invite-agent should call createSession',
    );
    const sessionConfig = capturedSessionConfig as {
      channel?: string;
      agentUid?: string;
      remoteUids?: string[];
    };

    assert(
      sessionConfig.channel === 'test-channel',
      'POST /api/invite-agent should pass the requested channel to createSession',
    );
    assert(
      sessionConfig.agentUid === '123456',
      'POST /api/invite-agent should use the shared default agent UID',
    );
    assert(
      JSON.stringify(sessionConfig.remoteUids) ===
        JSON.stringify(['user-4321']),
      'POST /api/invite-agent should scope the session to the requesting user',
    );
  } finally {
    Agent.prototype.createSession = originalCreateSession;
  }
}

async function verifyStopConversationValidation() {
  const { POST: stopConversation } =
    await import('../app/api/stop-conversation/route');
  const request = new NextRequest(
    'http://localhost:3000/api/stop-conversation',
    {
      body: JSON.stringify({}),
      method: 'POST',
    },
  );
  const response = await stopConversation(request);
  const body = await getJson(response);

  assert(
    response.status === 400,
    'POST /api/stop-conversation should reject missing agent_id',
  );
  assert(
    body.error === 'agent_id is required',
    'POST /api/stop-conversation should explain validation failure',
  );
}

async function verifyStopConversationSuccess() {
  const { POST: stopConversation } =
    await import('../app/api/stop-conversation/route');
  const originalStopAgent = AgoraClient.prototype.stopAgent;
  let stoppedAgentId: string | null = null;

  AgoraClient.prototype.stopAgent = async function (
    this: AgoraClient,
    agentId: string,
  ) {
    stoppedAgentId = agentId;
  } as typeof AgoraClient.prototype.stopAgent;

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/stop-conversation',
      {
        body: JSON.stringify({ agent_id: 'mock-agent-id' }),
        method: 'POST',
      },
    );
    const response = await stopConversation(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'POST /api/stop-conversation should return 200 on success',
    );
    assert(
      body.success === true,
      'POST /api/stop-conversation should return success',
    );
    assert(
      stoppedAgentId === 'mock-agent-id',
      'POST /api/stop-conversation should call stopAgent with the requested agent id',
    );
  } finally {
    AgoraClient.prototype.stopAgent = originalStopAgent;
  }
}

// ---------------------------------------------------------------------------
// NexaVoice support backend: tool guardrails, REST tool endpoint, escalation
// ---------------------------------------------------------------------------

async function verifyToolLayerGuardrails() {
  const { resetSupportDb, createConversation, getConversation, getCase } =
    await import('../lib/support/store');
  const { resetShopDb } = await import('../lib/shop/data');
  const { executeTool } = await import('../lib/support/tools');
  resetSupportDb();
  resetShopDb();

  const conversation = createConversation({ mode: 'CHAT' });

  // 1. Order tools are blocked until the customer is verified.
  const blocked = await executeTool(conversation.id, 'get_order_status', { order_id: 'NM-10023' });
  assert(
    !blocked.ok && blocked.result.error === 'CUSTOMER_NOT_VERIFIED',
    'get_order_status must be blocked before verify_customer',
  );

  // 2. Verification by phone (accepts +91 / spaces).
  const verified = await executeTool(conversation.id, 'verify_customer', { phone: '+91 98765 43210' });
  assert(verified.ok, 'verify_customer should find the seeded customer');
  assert(
    (verified.result.customer as { name: string }).name === 'Rahul Sharma',
    'verify_customer should return the customer name',
  );
  assert(
    getConversation(conversation.id)?.context.customer?.id === 'cust_rahul',
    'verify_customer should attach the customer to the conversation',
  );

  // 3. Cross-customer access is denied.
  const foreign = await executeTool(conversation.id, 'get_order_status', { order_id: '10030' });
  assert(!foreign.ok && foreign.result.code === 'ORDER_NOT_FOUND', 'orders of other customers must not be visible');

  // 4. Writes require explicit confirmation.
  const unconfirmed = await executeTool(conversation.id, 'cancel_order', {
    order_id: '10023',
    reason: 'changed mind',
    confirmed: false,
  });
  assert(
    !unconfirmed.ok && unconfirmed.result.error === 'CONFIRMATION_REQUIRED',
    'cancel_order without confirmed=true must not mutate',
  );
  const status = await executeTool(conversation.id, 'get_order_status', { order_id: 'NM-10023' });
  assert(
    status.ok && (status.result.order as { status: string }).status === 'PLACED',
    'unconfirmed cancel must leave the order untouched',
  );

  const confirmed = await executeTool(conversation.id, 'cancel_order', {
    order_id: 'NM-10023',
    reason: 'changed mind',
    confirmed: 'true',
  });
  assert(
    confirmed.ok && (confirmed.result.order as { status: string }).status === 'CANCELLED',
    'confirmed cancel should cancel the order',
  );

  // 5. Business rules: shipped orders cannot be cancelled.
  const shipped = await executeTool(conversation.id, 'cancel_order', {
    order_id: 'NM-10021',
    reason: 'x',
    confirmed: true,
  });
  assert(!shipped.ok && shipped.result.code === 'NOT_CANCELLABLE', 'shipped orders must not be cancellable');

  // 6. Escalation creates a case with a §24 handoff summary and blocks further actions.
  const escalated = await executeTool(conversation.id, 'escalate_to_human', {
    reason: 'Customer asked for a human',
    intent: 'cancellation',
    summary: 'Customer cancelled NM-10023 and wants to talk about a refund.',
    language: 'hinglish',
    confidence: 0.7,
  });
  assert(escalated.ok && typeof escalated.result.case_id === 'string', 'escalate_to_human should create a case');
  const supportCase = getCase(String(escalated.result.case_id));
  assert(supportCase?.status === 'WAITING_FOR_HUMAN', 'new case should be WAITING_FOR_HUMAN');
  assert(
    supportCase?.handoff.conversation_id === conversation.id &&
      supportCase.handoff.client_name === 'Rahul Sharma' &&
      supportCase.handoff.actions_taken.some((a) => a.includes('Cancelled NM-10023')),
    'handoff summary should include client name and actions taken',
  );
  assert(
    getConversation(conversation.id)?.state === 'WAITING_FOR_HUMAN',
    'conversation should move to WAITING_FOR_HUMAN',
  );
  const afterHandoff = await executeTool(conversation.id, 'list_recent_orders', {});
  assert(
    !afterHandoff.ok && afterHandoff.result.error === 'HANDED_OFF',
    'tools must be blocked once the conversation is handed off',
  );
  assert(
    (getConversation(conversation.id)?.toolAudit.length ?? 0) >= 7,
    'every tool call should be recorded in the audit trail',
  );
}

async function verifyAgentToolsEndpoint() {
  const { resetSupportDb, createConversation } = await import('../lib/support/store');
  const { resetShopDb } = await import('../lib/shop/data');
  const { POST: agentTool } = await import('../app/api/agent-tools/[tool]/route');
  resetSupportDb();
  resetShopDb();
  const originalSecret = process.env.AGENT_TOOLS_SECRET;
  process.env.AGENT_TOOLS_SECRET = 'test-secret-123';
  try {
    const conversation = createConversation({ mode: 'VOICE', channel: 'ch-1', customerUid: '42' });
    const url = `http://localhost:3000/api/agent-tools/verify_customer?conversation_id=${conversation.id}`;
    const params = Promise.resolve({ tool: 'verify_customer' });

    const unauthorized = await agentTool(
      new NextRequest(url, { method: 'POST', body: JSON.stringify({ phone: '9876543210' }) }),
      { params },
    );
    assert(unauthorized.status === 401, 'agent tool endpoint must reject calls without the tool token');

    const ok = await agentTool(
      new NextRequest(url, {
        method: 'POST',
        headers: { 'x-nexavoice-tool-token': 'test-secret-123', 'content-type': 'application/json' },
        body: JSON.stringify({ tool_call_id: 'call_1', phone: '9876543210' }),
      }),
      { params },
    );
    const body = await getJson(ok);
    assert(ok.status === 200 && body.ok === true, 'agent tool endpoint should execute the tool');
    assert(body.tool_call_id === 'call_1', 'agent tool endpoint should echo tool_call_id');

    const unknown = await agentTool(
      new NextRequest(`http://localhost:3000/api/agent-tools/drop_db?conversation_id=${conversation.id}`, {
        method: 'POST',
        headers: { 'x-nexavoice-tool-token': 'test-secret-123' },
        body: '{}',
      }),
      { params: Promise.resolve({ tool: 'drop_db' }) },
    );
    assert(unknown.status === 404, 'unknown tools must be rejected');
  } finally {
    if (originalSecret === undefined) delete process.env.AGENT_TOOLS_SECRET;
    else process.env.AGENT_TOOLS_SECRET = originalSecret;
  }
}

async function verifyAgentConfigDeclaresRestTools() {
  const { buildNexaVoiceAgent } = await import('../lib/agent-config');
  const originalBase = process.env.AGENT_TOOLS_BASE_URL;
  const originalLlmUrl = process.env.NEXT_LLM_URL;
  const originalLlmKey = process.env.NEXT_LLM_API_KEY;
  process.env.AGENT_TOOLS_BASE_URL = 'https://nexavoice.example.com/';
  delete process.env.NEXT_LLM_URL;
  delete process.env.NEXT_LLM_API_KEY;
  try {
    const client = new AgoraClient({
      area: 1,
      appId: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      appCertificate: process.env.NEXT_AGORA_APP_CERTIFICATE!,
    });
    const { agent, toolsEnabled, llmMode } = buildNexaVoiceAgent({
      client,
      conversationId: 'conv_test',
      toolToken: 'secret-token',
    });
    assert(toolsEnabled && llmMode === 'agora-managed', 'agent should use managed LLM with REST tools');
    const properties = agent.toProperties({
      channel: 'ch',
      agentUid: '123456',
      remoteUids: ['1'],
      appId: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      appCertificate: process.env.NEXT_AGORA_APP_CERTIFICATE!,
    });
    const llm = properties.llm as {
      tools?: Array<{ function: { name: string }; server: { url: string; headers: Record<string, string>; body: Record<string, unknown> } }>;
      template_variables?: Record<string, string>;
      system_messages?: Array<{ content: string }>;
    };
    assert(Array.isArray(llm.tools) && llm.tools.length >= 8, 'llm.tools should list the support tools');
    const escalate = llm.tools!.find((t) => t.function.name === 'escalate_to_human');
    assert(
      escalate?.server.url === 'https://nexavoice.example.com/api/agent-tools/escalate_to_human?conversation_id={{template_variables.nv_conversation_id}}',
      'REST tool url should target this backend with the conversation template variable',
    );
    assert(
      escalate?.server.headers['x-nexavoice-tool-token'] === '{{template_variables.nv_tool_token}}',
      'REST tool should authenticate with the tool token template variable',
    );
    assert(escalate?.server.body.reason === '{{args.reason}}', 'REST tool body should map LLM args');
    assert(
      llm.template_variables?.nv_conversation_id === 'conv_test' && llm.template_variables?.nv_tool_token === 'secret-token',
      'template variables should carry conversation id and tool token',
    );
    assert(
      llm.system_messages?.[0]?.content.includes('NexaMart'),
      'system prompt should be the shopping-support prompt',
    );
    assert(
      (properties.asr as { params?: { language?: string } }).params?.language === 'multi',
      'Deepgram should run in multilingual (Hindi/English) mode',
    );
    assert(
      properties.advanced_features?.enable_tools === true && properties.advanced_features?.enable_rtm === true,
      'enable_tools and enable_rtm must be on',
    );
  } finally {
    if (originalBase === undefined) delete process.env.AGENT_TOOLS_BASE_URL;
    else process.env.AGENT_TOOLS_BASE_URL = originalBase;
    if (originalLlmUrl !== undefined) process.env.NEXT_LLM_URL = originalLlmUrl;
    if (originalLlmKey !== undefined) process.env.NEXT_LLM_API_KEY = originalLlmKey;
  }
}

async function verifyChatEscalationFlow() {
  const { resetSupportDb } = await import('../lib/support/store');
  const { resetShopDb } = await import('../lib/shop/data');
  const { POST: createConversationRoute } = await import('../app/api/conversations/route');
  const { POST: postMessage } = await import('../app/api/conversations/[id]/messages/route');
  const { POST: acceptCase } = await import('../app/api/cases/[id]/accept/route');
  const { GET: dashboard } = await import('../app/api/dashboard/route');
  resetSupportDb();
  resetShopDb();
  delete process.env.NEXT_LLM_URL;
  delete process.env.NEXT_LLM_API_KEY;

  const created = await createConversationRoute(
    new NextRequest('http://localhost:3000/api/conversations', { method: 'POST', body: JSON.stringify({ mode: 'CHAT' }) }),
  );
  const conversationId = ((await getJson(created)).conversation as { id: string }).id;
  const send = async (content: string) => {
    const res = await postMessage(
      new NextRequest(`http://localhost:3000/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
      { params: Promise.resolve({ id: conversationId }) },
    );
    return getJson(res);
  };

  const r1 = await send('mera order kahan hai');
  assert(
    typeof (r1.reply as { content: string }).content === 'string' && /mobile/i.test((r1.reply as { content: string }).content),
    'chat agent should ask for the mobile number first',
  );
  const r2 = await send('9876543210');
  assert(/Rahul/.test((r2.reply as { content: string }).content), 'chat agent should verify the customer');
  const r3 = await send('NM-10021');
  assert(/BlueDart|Shipped/i.test((r3.reply as { content: string }).content), 'chat agent should report the order status');
  const r4 = await send('cancel kar do 10021');
  assert(/can't be cancelled|cancel nahi ho sakta|नहीं/i.test((r4.reply as { content: string }).content), 'shipped order must not be offered for cancellation');
  const r5 = await send('kisi insaan se baat karao');
  assert((r5.case as { status: string } | null)?.status === 'WAITING_FOR_HUMAN', 'human request should create a waiting case');
  const caseId = (r5.case as { id: string }).id;

  const snapshot = await getJson(await dashboard());
  assert(
    (snapshot.waitingCases as Array<{ id: string }>).some((c) => c.id === caseId),
    'dashboard snapshot should list the waiting case',
  );

  const accepted = await getJson(
    await acceptCase(
      new NextRequest(`http://localhost:3000/api/cases/${caseId}/accept`, { method: 'POST', body: JSON.stringify({ agentName: 'Asha' }) }),
      { params: Promise.resolve({ id: caseId }) },
    ),
  );
  assert(
    (accepted.case as { status: string; assignedTo: string }).status === 'HUMAN_HANDLING' &&
      (accepted.case as { assignedTo: string }).assignedTo === 'Asha',
    'accepting a case should move it to HUMAN_HANDLING',
  );
  const r6 = await send('hello?');
  assert(r6.reply === null, 'AI must stay silent once a human handles the chat');
}

// ---------------------------------------------------------------------------
// Serverless hardening: public origin for tools, derived tool secret,
// enable_tools only with tools, durable store mirror, health report.
// ---------------------------------------------------------------------------

async function verifyToolsUrlAndSecret() {
  const { getToolSecret, resolveToolAccess, resolveToolsBaseUrl } =
    await import('../lib/agent-tools');
  const originalBase = process.env.AGENT_TOOLS_BASE_URL;
  const originalSecret = process.env.AGENT_TOOLS_SECRET;
  delete process.env.AGENT_TOOLS_BASE_URL;
  delete process.env.AGENT_TOOLS_SECRET;

  try {
    // The origin the browser used is enough — no AGENT_TOOLS_BASE_URL to configure.
    assert(
      resolveToolsBaseUrl('https://nexavoice-agora.vercel.app') ===
        'https://nexavoice-agora.vercel.app',
      'tools base URL should fall back to the request origin',
    );
    assert(
      resolveToolsBaseUrl('https://example.com/app/') === 'https://example.com',
      'tools base URL should normalise to an origin',
    );
    assert(
      resolveToolsBaseUrl('http://localhost:3000') === null,
      'localhost must never be handed to Agora as a callback URL',
    );
    process.env.AGENT_TOOLS_BASE_URL = 'https://tunnel.example';
    assert(
      resolveToolsBaseUrl('https://vercel.app') === 'https://tunnel.example',
      'AGENT_TOOLS_BASE_URL should win over the request origin',
    );
    delete process.env.AGENT_TOOLS_BASE_URL;

    // Without AGENT_TOOLS_SECRET the secret is derived from the App Certificate, so
    // tools work on a fresh Vercel deployment with no extra variable to set.
    const derived = getToolSecret();
    assert(
      derived !== null && derived.length >= 32,
      'a derived tool secret should be available without AGENT_TOOLS_SECRET',
    );
    assert(
      derived === getToolSecret(),
      'the derived tool secret must be stable across calls (all instances derive the same one)',
    );
    assert(
      !derived.includes(process.env.NEXT_AGORA_APP_CERTIFICATE as string),
      'the derived tool secret must not embed the App Certificate',
    );

    process.env.AGENT_TOOLS_SECRET = 'short';
    assert(
      getToolSecret() === derived,
      'an AGENT_TOOLS_SECRET shorter than 8 chars should be ignored in favour of the derived one',
    );
    process.env.AGENT_TOOLS_SECRET = 'a-long-enough-shared-secret';
    assert(
      getToolSecret() === 'a-long-enough-shared-secret',
      'an explicit AGENT_TOOLS_SECRET should win',
    );

    const access = resolveToolAccess('https://nexavoice-agora.vercel.app');
    assert(
      access?.baseUrl === 'https://nexavoice-agora.vercel.app' && !!access.secret,
      'resolveToolAccess should pair the public origin with a usable secret',
    );
  } finally {
    if (originalBase === undefined) delete process.env.AGENT_TOOLS_BASE_URL;
    else process.env.AGENT_TOOLS_BASE_URL = originalBase;
    if (originalSecret === undefined) delete process.env.AGENT_TOOLS_SECRET;
    else process.env.AGENT_TOOLS_SECRET = originalSecret;
  }
}

async function verifyEnableToolsFollowsTools() {
  const { AgoraClient, Area } = await import('agora-agents');
  const { buildNexaVoiceAgent } = await import('../lib/agent-config');
  const client = new AgoraClient({
    area: Area.US,
    appId: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
    appCertificate: process.env.NEXT_AGORA_APP_CERTIFICATE!,
  });
  const common = {
    client,
    conversationId: 'conv_test',
    toolToken: 'secret-token',
  } as const;
  const tokenOpts = {
    channel: 'ch',
    agentUid: '123456',
    remoteUids: ['1'],
    appId: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
    appCertificate: process.env.NEXT_AGORA_APP_CERTIFICATE!,
  };

  const withoutTools = buildNexaVoiceAgent({ ...common, toolToken: null });
  const plainProps = withoutTools.agent.toProperties(tokenOpts) as unknown as {
    advanced_features?: { enable_tools?: boolean };
  };
  assert(
    plainProps.advanced_features?.enable_tools !== true,
    'a session with no tools must not advertise enable_tools to the engine',
  );

  const unreachable = buildNexaVoiceAgent({
    ...common,
    toolsBaseUrl: null,
  });
  const unreachableProps = unreachable.agent.toProperties(tokenOpts) as unknown as {
    advanced_features?: { enable_tools?: boolean };
    llm?: { tools?: unknown[] };
  };
  assert(
    unreachableProps.advanced_features?.enable_tools !== true &&
      !unreachableProps.llm?.tools?.length,
    'no reachable tool endpoint should mean no tools and no enable_tools flag',
  );
}

/**
 * The Vercel regression this guards: two route invocations must observe the same
 * conversations even though each runs with a fresh in-memory store. The shared
 * document now lives in PostgreSQL (StoreState), so this check points the mirror
 * at an isolated row and skips entirely when no database is reachable.
 */
async function verifyDurableStoreMirror() {
  if (!(await postgresAvailable())) {
    console.log('durable store mirror: skipped (no PostgreSQL reachable)');
    return;
  }
  const { resetSupportDb, resetPersistenceClient, getStoreSyncStatus } =
    await import('../lib/support/store');

  const previousStore = process.env.NEXAVOICE_STORE;
  const previousKey = process.env.NEXAVOICE_STATE_KEY;
  const key = `contract-mirror-${process.pid}-${Date.now()}`;
  process.env.NEXAVOICE_STORE = 'postgres';
  process.env.NEXAVOICE_STATE_KEY = key;
  resetPersistenceClient();
  resetSupportDb();

  try {
    const { POST: createConversationRoute } = await import('../app/api/conversations/route');
    const created = await getJson(
      await createConversationRoute(
        new NextRequest('http://localhost:3000/api/conversations', {
          method: 'POST',
          body: JSON.stringify({ mode: 'CHAT' }),
        }),
      ),
    );
    const conversationId = (created.conversation as { id: string }).id;
    assert(typeof conversationId === 'string', 'conversation should be created');
    assert(
      getStoreSyncStatus().backend === 'postgres',
      'the postgres backend should be active for this check',
    );

    // A second instance: same code, empty memory, no shared process state.
    resetSupportDb();
    const { GET: getConversationRoute } = await import('../app/api/conversations/[id]/route');
    const reread = await getConversationRoute(
      new NextRequest(`http://localhost:3000/api/conversations/${conversationId}`),
      { params: Promise.resolve({ id: conversationId }) },
    );
    assert(
      reread.status === 200,
      'a cold instance must still find the conversation via the durable mirror',
    );

    // And writes made on the cold instance must be visible again after a restart.
    const { POST: sendRoute } = await import('../app/api/conversations/[id]/messages/route');
    const sent = await sendRoute(
      new NextRequest(`http://localhost:3000/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: 'hello', role: 'human_agent' }),
      }),
      { params: Promise.resolve({ id: conversationId }) },
    );
    assert(sent.status === 200, 'human reply should be accepted');
    resetSupportDb();
    const again = await getConversationRoute(
      new NextRequest(`http://localhost:3000/api/conversations/${conversationId}`),
      { params: Promise.resolve({ id: conversationId }) },
    );
    const body = await getJson(again);
    const messages = body.messages as Array<{ role: string; content: string }>;
    assert(
      messages?.some((m) => m.role === 'human_agent' && m.content === 'hello'),
      'mirrored messages must survive an instance restart',
    );
  } finally {
    await deleteStoreDocument(key);
    if (previousStore === undefined) delete process.env.NEXAVOICE_STORE;
    else process.env.NEXAVOICE_STORE = previousStore;
    if (previousKey === undefined) delete process.env.NEXAVOICE_STATE_KEY;
    else process.env.NEXAVOICE_STATE_KEY = previousKey;
    resetPersistenceClient();
    resetSupportDb();
  }
}

/**
 * `NEXAVOICE_SEED=demo` demo data: opt-in, idempotent, and — the part that actually
 * needs a test — safe when two cold instances seed at the same moment. Records carry
 * fixed ids so the snapshot merge collapses the two sets into one instead of doubling
 * the transcript in the dashboard.
 */
async function verifyDemoSeedFixture() {
  const {
    resetSupportDb,
    resetPersistenceClient,
    flushStore,
    listConversations,
    listMessages,
    getConversation,
    getCase,
    createConversation,
  } = await import('../lib/support/store');
  const { seedDemoData, seedEnabled, maybeSeedDemoData, resetSeedState } = await import('../lib/support/seed');
  const { getShopDb } = await import('../lib/shop/data');

  const previousStore = process.env.NEXAVOICE_STORE;
  const previousKey = process.env.NEXAVOICE_STATE_KEY;
  const previousSeed = process.env.NEXAVOICE_SEED;
  // In-memory backend is enough for the opt-in / idempotency assertions; the
  // race-safe merge below re-points the mirror at an isolated Postgres row.
  process.env.NEXAVOICE_STORE = 'memory';
  resetPersistenceClient();
  resetSupportDb();

  try {
    // Off unless asked for.
    delete process.env.NEXAVOICE_SEED;
    assert(!seedEnabled(), 'seeding must be opt-in via NEXAVOICE_SEED');
    resetSeedState();
    await maybeSeedDemoData();
    assert(listConversations().length === 0, 'no demo data without the flag');

    // On: the fixture appears, and only on an empty store.
    process.env.NEXAVOICE_SEED = 'demo';
    assert(seedEnabled(), 'NEXAVOICE_SEED=demo should enable seeding');
    resetSeedState();
    await maybeSeedDemoData();
    const conversations = listConversations();
    assert(conversations.length === 3, `expected 3 demo conversations, got ${conversations.length}`);

    const waiting = getConversation('conv_demo_waiting_case');
    assert(waiting?.state === 'WAITING_FOR_HUMAN', 'the escalated demo chat should wait for a human');
    assert(Boolean(waiting?.caseId), 'the escalated demo chat should own a case');
    const waitingCase = waiting?.caseId ? getCase(waiting.caseId) : null;
    assert(waitingCase?.priority === 'HIGH', 'a refund request should be seeded as HIGH');
    assert(
      (waitingCase?.handoff.missing_information.length ?? 0) > 0,
      'the handoff summary should carry what the customer still owes',
    );
    const resolvedVoice = getConversation('conv_demo_voice_resolved');
    assert(resolvedVoice?.state === 'RESOLVED', 'the demo voice case should read as resolved');
    const resolvedCase = resolvedVoice?.caseId ? getCase(resolvedVoice.caseId) : null;
    assert(resolvedCase?.status === 'RESOLVED' && Boolean(resolvedCase.resolutionNote), 'resolved case needs a note');
    assert(
      listMessages('conv_demo_active_chat').length === 2,
      'the active demo chat should have exactly two turns',
    );
    assert(
      listMessages('conv_demo_voice_resolved').some((m) => m.role === 'human_agent'),
      'the demo voice transcript should include the human turn',
    );

    // Demo data has to be consistent with the shop, or a human agent clicking through
    // a seeded case lands on an order that does not exist.
    const shop = getShopDb();
    for (const conversation of listConversations()) {
      for (const orderId of conversation.context.orderIds) {
        assert(shop.orders.has(orderId), `seeded order ${orderId} must exist in the shop data`);
      }
      if (conversation.context.customer) {
        assert(shop.customers.has(conversation.context.customer.id), 'seeded customer must exist in the shop data');
      }
      assert(conversation.createdAt < Date.now() - 60_000, 'demo records should be back-dated, not "just now"');
    }

    // Second call changes nothing, and never on a store that already has data.
    const second = seedDemoData({ onlyIfEmpty: true });
    assert(second.skipped && second.created.length === 0, 'a non-empty store must not be re-seeded');
    const third = seedDemoData();
    assert(third.created.length === 0 && third.skipped, 'existing demo records must not be replaced');
    assert(listConversations().length === 3, 'the store must still hold exactly the demo set');

    // A conversation added by a real customer is untouched by seeding.
    const live = createConversation({ mode: 'CHAT' });
    const seeded = seedDemoData();
    assert(seeded.created.length === 0, 'seeding must not add records that already exist');
    assert(Boolean(getConversation(live.id)), 'live conversations must survive seeding');

    // The race: a cold instance that seeded without ever seeing the first one's write
    // must merge to the same document, not a doubled one. Needs the durable mirror.
    if (await postgresAvailable()) {
      const { prisma } = await import('../lib/db');
      const key = `contract-seed-${process.pid}-${Date.now()}`;
      const readDoc = async () => {
        const row = await prisma.storeState.findUnique({ where: { id: key } });
        assert(Boolean(row), 'the mirror row should exist after a flush');
        return row?.snapshot as {
          conversations: unknown[];
          messages: Record<string, unknown[]>;
          events: unknown[];
        };
      };
      process.env.NEXAVOICE_STORE = 'postgres';
      process.env.NEXAVOICE_STATE_KEY = key;
      resetPersistenceClient();
      await flushStore();
      const first = await readDoc();
      const firstMessages = Object.values(first.messages).flat().length;
      resetSupportDb();
      assert(listConversations().length === 0, 'the simulated instance starts empty');
      seedDemoData();
      await flushStore();
      const merged = await readDoc();
      assert(
        merged.conversations.length === first.conversations.length,
        `conversations must not double after a racing seed (${first.conversations.length} → ${merged.conversations.length})`,
      );
      const mergedMessages = Object.values(merged.messages as Record<string, { id: string }[]>).flat();
      assert(
        mergedMessages.length === firstMessages,
        `transcript must not double after a racing seed (${firstMessages} → ${mergedMessages.length})`,
      );
      assert(
        new Set(mergedMessages.map((m) => m.id)).size === mergedMessages.length,
        'seeded message ids must be stable so the merge dedupes them',
      );
      assert(
        merged.events.length === first.events.length,
        `activity feed must not double after a racing seed (${first.events.length} → ${merged.events.length})`,
      );
      await deleteStoreDocument(key);
    }
    console.log('demo seed fixture: opt-in, idempotent, race-safe');
  } finally {
    if (previousStore === undefined) delete process.env.NEXAVOICE_STORE;
    else process.env.NEXAVOICE_STORE = previousStore;
    if (previousKey === undefined) delete process.env.NEXAVOICE_STATE_KEY;
    else process.env.NEXAVOICE_STATE_KEY = previousKey;
    if (previousSeed === undefined) delete process.env.NEXAVOICE_SEED;
    else process.env.NEXAVOICE_SEED = previousSeed;
    resetSeedState();
    resetSupportDb();
    resetPersistenceClient();
  }
}

/**
 * The demo shop is process-local global state, so a cancellation made on one serverless
 * instance used to be invisible to the next — the customer was told "cancelled" and the
 * following turn (or the human dashboard) still read the order as PLACED. It now rides in
 * the same mirror as conversations, with one rule that needs pinning: a record this
 * instance actually wrote wins a tie, so a freshly seeded copy cannot clobber a real
 * cancellation back to pristine fixture data.
 */
async function verifyShopWritesAreMirrored() {
  if (!(await postgresAvailable())) {
    console.log('shop writes mirror: skipped (no PostgreSQL reachable)');
    return;
  }
  const { resetSupportDb, resetPersistenceClient, hydrateStore, flushStore, appendMessage, createConversation } =
    await import('../lib/support/store');
  const { cancelOrder, getOrder } = await import('../lib/shop/service');
  const { getShopDb, resetShopDb } = await import('../lib/shop/data');
  const { prisma } = await import('../lib/db');

  const previousStore = process.env.NEXAVOICE_STORE;
  const previousKey = process.env.NEXAVOICE_STATE_KEY;
  const key = `contract-shop-${process.pid}-${Date.now()}`;
  process.env.NEXAVOICE_STORE = 'postgres';
  process.env.NEXAVOICE_STATE_KEY = key;
  resetPersistenceClient();
  resetSupportDb();
  resetShopDb();

  const doc = async () => {
    const row = await prisma.storeState.findUnique({ where: { id: key } });
    assert(Boolean(row), 'the mirror row should exist after a flush');
    return row?.snapshot as {
      shop: { orders: { id: string; status: string; cancellationReason?: string }[] };
    };
  };
  const statusOf = async (id: string) =>
    (await doc()).shop.orders.find((order) => order.id === id)?.status;

  try {
    // Instance A cancels and flushes.
    createConversation({ id: 'conv_shop_check', mode: 'CHAT' });
    assert(cancelOrder('cust_rahul', 'NM-10023', 'faulty item').ok, 'NM-10023 should be cancellable');
    await flushStore();
    assert((await statusOf('NM-10023')) === 'CANCELLED', 'a cancellation must reach the shared document');

    // Instance B is cold: freshly seeded, no memory of A.
    resetSupportDb();
    resetShopDb();
    assert(getOrder('NM-10023')?.status === 'PLACED', 'a fresh seed starts un-cancelled');
    await hydrateStore();
    assert(getOrder('NM-10023')?.status === 'CANCELLED', 'a cold instance must see the other instance\'s cancellation');
    assert(getOrder('NM-10021')?.status === 'SHIPPED', 'unrelated orders survive the merge');
    assert(getShopDb().customers.size >= 3, 'customers should still be present after a merge');

    // B writes its own change: both cancellations must end up in the document, and a
    // record B merely read must not be reverted to B's pristine seed.
    assert(cancelOrder('cust_amit', 'NM-10035', 'ordered the wrong size').ok, 'NM-10035 should be cancellable');
    appendMessage('conv_shop_check', 'ai', 'Noted — that order is cancelled too.');
    await flushStore();
    assert((await statusOf('NM-10023')) === 'CANCELLED', 'A\'s write must not be clobbered by B');
    assert((await statusOf('NM-10035')) === 'CANCELLED', 'B\'s own write must be published');

    // A third cold instance sees both.
    resetSupportDb();
    resetShopDb();
    await hydrateStore();
    assert(
      getOrder('NM-10023')?.status === 'CANCELLED' && getOrder('NM-10035')?.status === 'CANCELLED',
      'every instance should converge on the same shop state',
    );
    console.log('shop state: mirrored across instances, local writes win ties');
  } finally {
    await deleteStoreDocument(key);
    resetShopDb();
    if (previousStore === undefined) delete process.env.NEXAVOICE_STORE;
    else process.env.NEXAVOICE_STORE = previousStore;
    if (previousKey === undefined) delete process.env.NEXAVOICE_STATE_KEY;
    else process.env.NEXAVOICE_STATE_KEY = previousKey;
    resetSupportDb();
    resetPersistenceClient();
  }
}


/**
 * Route-bracketing invariant. The durable mirror only works if a handler reads the shared
 * document before touching state and writes it back before responding, and that is exactly
 * the kind of requirement a new route quietly forgets (the demo shop read routes did —
 * they answered from a stale copy on a warm instance and it looked fine locally).
 *
 * So: any `app/api` route that imports support or shop state must either go through
 * `withStore()` or hydrate explicitly, and no route may flush by hand — a hand-written
 * flush skips the read-merge that keeps other instances' writes alive.
 */
async function verifyStatefulRoutesAreBracketed() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const root = 'app/api';

  const routes: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === 'route.ts') routes.push(full);
    }
  };
  await walk(root);
  assert(routes.length >= 15, `expected the whole api surface, found ${routes.length} routes`);

  const stateful = /from '[^']*(lib\/shop|lib\/support)[^']*'/;
  let checked = 0;
  for (const file of routes) {
    const source = await fs.readFile(file, 'utf8');
    if (!stateful.test(source)) continue;
    checked += 1;
    const bracketed = source.includes('withStore(');
    const hydrates = source.includes('hydrateStore(');
    assert(
      bracketed || hydrates,
      `${file} reads support/shop state but neither uses withStore() nor hydrateStore() — it would serve stale data on another instance`,
    );
    assert(
      !bracketed || !source.includes('flushStore('),
      `${file} uses withStore() and calls flushStore() directly — the wrapper already flushes, and a manual flush can publish an unmerged document`,
    );
  }
  assert(checked >= 15, `expected at least 15 stateful routes to be checked, got ${checked}`);

  // And a handler must not be able to skip the bracket by exporting the raw function.
  const conversationRoute = await fs.readFile('app/api/conversations/[id]/messages/route.ts', 'utf8');
  assert(/export const POST = withStore\(/.test(conversationRoute), 'the chat turn route must be bracketed');
  console.log(`route bracketing: ${checked} stateful routes checked`);
}

async function verifyHealthRoute() {
  const { GET: health } = await import('../app/api/health/route');
  const response = await health();
  const text = await response.text();
  const body = JSON.parse(text) as {
    status: string;
    agora: { appIdConfigured: boolean; appId: string | null };
    agent: { tools?: { enabled?: boolean; baseUrl?: string | null } };
    store: { backend: string; note?: string };
  };

  assert(response.status === 200, 'GET /api/health should return 200');
  assert(body.agora?.appIdConfigured === true, 'health should report the App ID as configured');
  assert(
    typeof body.store?.backend === 'string',
    'health should report which store backend shares state',
  );
  assert(
    typeof body.agent.tools?.enabled === 'boolean',
    'health should report whether voice tools are reachable',
  );
  assert(
    !/fedcba9876543210/.test(body.agora.appId ?? ''),
    'health should only expose a masked App ID',
  );
  assert(
    !text.includes(process.env.NEXT_AGORA_APP_CERTIFICATE as string),
    'health must never leak the App Certificate',
  );
  // Env-var *names* may appear in guidance text; values must never.
  for (const key of ['BLOB_READ_WRITE_TOKEN', 'AGENT_TOOLS_SECRET', 'NEXT_LLM_API_KEY']) {
    const value = process.env[key]?.trim();
    if (value) {
      assert(!text.includes(value), `health must not leak the value of ${key}`);
    }
  }
}

async function main() {
  await verifyGenerateAgoraTokenRoute();
  await verifyGenerateAgoraTokenReplacesZeroUid();
  await verifyChatCompletionsMissingEnv();
  await verifyChatCompletionsInvalidJson();
  await verifyChatCompletionsSseDone();
  await verifyInviteAgentValidation();
  await verifyInviteAgentSuccess();
  await verifyStopConversationValidation();
  await verifyStopConversationSuccess();
  await verifyToolLayerGuardrails();
  await verifyAgentToolsEndpoint();
  await verifyAgentConfigDeclaresRestTools();
  await verifyChatEscalationFlow();
  await verifyToolsUrlAndSecret();
  await verifyEnableToolsFollowsTools();
  await verifyDurableStoreMirror();
  await verifyStatefulRoutesAreBracketed();
  await verifyDemoSeedFixture();
  await verifyShopWritesAreMirrored();
  await verifyHealthRoute();

  console.log('API contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
