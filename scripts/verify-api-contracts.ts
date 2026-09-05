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

/**
 * Creates a throw-away client with one freshly placed order, so the tool and
 * chat checks below run against the real PostgreSQL shop instead of fixtures.
 * Returns a `cleanup()` that removes everything it created.
 */
async function makeShopFixture(label: string) {
  const { prisma } = await import('../lib/db');
  const shop = await import('../lib/shop/service');
  await shop.ensureCatalog();
  const phone = String(9000000000 + (Date.now() % 999999999)).slice(0, 10);
  const client = await prisma.client.create({
    data: {
      name: `Contract ${label}`,
      email: `${label}@contract.example`,
      phone,
      city: 'Delhi',
      address: 'B-42, Lajpat Nagar II, New Delhi 110024',
      preferredLanguage: 'english',
    },
  });
  const products = await shop.listProducts();
  const headphones = products.find((p) => /headphones/i.test(p.title)) ?? products[0];
  await shop.addToCart(client.id, headphones.id, 1);
  const placed = await shop.placeOrder(client.id, {
    shippingAddress: 'B-42, Lajpat Nagar II, New Delhi 110024',
    paymentMethod: 'COD',
  });
  assert(placed.ok, 'fixture order should be placed');
  return {
    client,
    order: placed.ok ? placed.data : null!,
    product: headphones,
    products,
    async cleanup() {
      await prisma.order.deleteMany({ where: { clientId: client.id } });
      await prisma.cartItem.deleteMany({ where: { clientId: client.id } });
      await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    },
  };
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
  if (!(await postgresAvailable())) {
    console.log('tool guardrails: skipped (no PostgreSQL reachable)');
    return;
  }
  const { resetSupportDb, createConversation, getConversation, getCase } =
    await import('../lib/support/store');
  const { executeTool } = await import('../lib/support/tools');
  const shop = await import('../lib/shop/service');
  resetSupportDb();

  const fixture = await makeShopFixture('guardrails');
  try {
    // 1. Without a signed-in client no order data is reachable at all.
    const anonymous = createConversation({ mode: 'CHAT' });
    const blocked = await executeTool(anonymous.id, 'list_recent_orders', {});
    assert(
      !blocked.ok && blocked.result.error === 'NO_SIGNED_IN_CUSTOMER',
      'order tools must be blocked when the conversation has no signed-in client',
    );

    const conversation = createConversation({
      mode: 'CHAT',
      customerName: fixture.client.name,
      customer: {
        id: fixture.client.id,
        name: fixture.client.name,
        phone: fixture.client.phone,
        email: fixture.client.email,
        tier: fixture.client.tier,
        city: fixture.client.city,
        address: fixture.client.address,
      },
    });

    // 2. Context and orders come from the database.
    const context = await executeTool(conversation.id, 'get_customer_context', {});
    assert(
      context.ok && (context.result.orders as unknown[]).length === 1,
      'get_customer_context should return the client orders from PostgreSQL',
    );

    // 3. Only catalogue products can be added.
    const bogus = await executeTool(conversation.id, 'add_item_to_order', {
      order_id: fixture.order.code,
      product: 'diamond helicopter',
      confirmed: true,
    });
    assert(
      !bogus.ok && bogus.result.error === 'PRODUCT_NOT_FOUND',
      'products outside the catalogue must be refused',
    );

    // 4. Writes require explicit confirmation.
    const socks = fixture.products.find((p) => /socks/i.test(p.title))!;
    const unconfirmed = await executeTool(conversation.id, 'add_item_to_order', {
      order_id: fixture.order.code,
      product: socks.sku,
    });
    assert(
      !unconfirmed.ok && unconfirmed.result.error === 'CONFIRMATION_REQUIRED',
      'add_item_to_order without confirmed=true must not mutate',
    );
    const untouched = await shop.getOrderForClient(fixture.client.id, fixture.order.code);
    assert(untouched.ok && untouched.data.items.length === 1, 'unconfirmed add must leave the order untouched');

    const confirmed = await executeTool(conversation.id, 'add_item_to_order', {
      order_id: fixture.order.code,
      product: socks.sku,
      quantity: 2,
      confirmed: 'true',
    });
    assert(confirmed.ok, 'confirmed add should change the order');
    const afterAdd = await shop.getOrderForClient(fixture.client.id, fixture.order.code);
    assert(
      afterAdd.ok && afterAdd.data.items.length === 2 && afterAdd.data.totalInr === fixture.order.totalInr + socks.priceInr * 2,
      'the order total must include the added items',
    );

    // 5. Another client's order is invisible.
    const other = await makeShopFixture('guardrails-other');
    try {
      const foreign = await executeTool(conversation.id, 'get_order_status', { order_id: other.order.code });
      assert(!foreign.ok && foreign.result.code === 'ORDER_NOT_FOUND', "another client's order must not be readable");
    } finally {
      await other.cleanup();
    }

    // 6. Escalation builds a handoff carrying profile, orders and transcript.
    const escalated = await executeTool(conversation.id, 'escalate_to_human', {
      reason: 'Customer asked for a human',
      intent: 'order_edit',
      summary: 'Customer added socks and wants to discuss delivery.',
      language: 'english',
      confidence: 0.7,
    });
    assert(escalated.ok && typeof escalated.result.case_id === 'string', 'escalate_to_human should create a case');
    const supportCase = getCase(String(escalated.result.case_id));
    assert(supportCase?.status === 'WAITING_FOR_HUMAN', 'new case should be WAITING_FOR_HUMAN');
    assert(
      supportCase?.handoff.customer_profile?.id === fixture.client.id &&
        (supportCase?.handoff.orders?.length ?? 0) === 1 &&
        supportCase!.handoff.actions_taken.some((a) => a.includes('Added')),
      'the handoff must carry the client profile, their orders and what the AI already did',
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
      (getConversation(conversation.id)?.toolAudit.length ?? 0) >= 6,
      'every tool call should be recorded in the audit trail',
    );
  } finally {
    await fixture.cleanup();
  }
}

async function verifyAgentToolsEndpoint() {
  const { resetSupportDb, createConversation } = await import('../lib/support/store');
  const { POST: agentTool } = await import('../app/api/agent-tools/[tool]/route');
  resetSupportDb();
  const originalSecret = process.env.AGENT_TOOLS_SECRET;
  process.env.AGENT_TOOLS_SECRET = 'test-secret-123';
  try {
    const conversation = createConversation({ mode: 'VOICE', channel: 'ch-1', customerUid: '42' });
    const url = `http://localhost:3000/api/agent-tools/get_customer_context?conversation_id=${conversation.id}`;
    const params = Promise.resolve({ tool: 'get_customer_context' });

    const unauthorized = await agentTool(
      new NextRequest(url, { method: 'POST', body: '{}' }),
      { params },
    );
    assert(unauthorized.status === 401, 'agent tool endpoint must reject calls without the tool token');

    const ok = await agentTool(
      new NextRequest(url, {
        method: 'POST',
        headers: { 'x-nexavoice-tool-token': 'test-secret-123', 'content-type': 'application/json' },
        body: JSON.stringify({ tool_call_id: 'call_1' }),
      }),
      { params },
    );
    const body = await getJson(ok);
    // No signed-in client on this conversation: the engine still gets a 200 with a
    // message the model can speak, never a transport error.
    assert(ok.status === 200 && body.ok === false, 'agent tool endpoint should execute the tool and answer 200');
    assert(body.tool_call_id === 'call_1', 'agent tool endpoint should echo tool_call_id');
    assert(body.error === 'NO_SIGNED_IN_CUSTOMER', 'an unbound conversation must not reach order data');

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
  if (!(await postgresAvailable())) {
    console.log('chat escalation flow: skipped (no PostgreSQL reachable)');
    return;
  }
  const { resetSupportDb } = await import('../lib/support/store');
  const { POST: createConversationRoute } = await import('../app/api/conversations/route');
  const { POST: postMessage } = await import('../app/api/conversations/[id]/messages/route');
  const { POST: acceptCase } = await import('../app/api/cases/[id]/accept/route');
  const { GET: dashboard } = await import('../app/api/dashboard/route');
  resetSupportDb();
  delete process.env.NEXT_LLM_URL;
  delete process.env.NEXT_LLM_API_KEY;

  const fixture = await makeShopFixture('chatflow');
  try {
    const created = await createConversationRoute(
      new NextRequest('http://localhost:3000/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ mode: 'CHAT', clientId: fixture.client.id }),
      }),
    );
    const conversation = (await getJson(created)).conversation as {
      id: string;
      context: { customer?: { id: string } };
    };
    assert(
      conversation.context.customer?.id === fixture.client.id,
      'a conversation must be bound to the signed-in client record',
    );
    const conversationId = conversation.id;

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
    const reply = (r: Record<string, unknown>) => (r.reply as { content: string }).content;

    const r1 = await send('mera order kahan hai');
    assert(
      reply(r1).includes(fixture.order.code),
      'the chat agent should answer with the order it found in the database, without asking to verify',
    );

    const r2 = await send(`add cotton socks to ${fixture.order.code}`);
    assert(/socks/i.test(reply(r2)) && /(haan|yes|nahi|no)/i.test(reply(r2)), 'adding an item must ask for confirmation first');

    const r3 = await send('haan');
    assert(/added|add kar/i.test(reply(r3)), 'confirming should perform the add');
    const shop = await import('../lib/shop/service');
    const updated = await shop.getOrderForClient(fixture.client.id, fixture.order.code);
    assert(updated.ok && updated.data.items.length === 2, 'the confirmed add must reach the database');

    const r4 = await send('kisi insaan se baat karao');
    assert((r4.case as { status: string } | null)?.status === 'WAITING_FOR_HUMAN', 'human request should create a waiting case');
    const caseId = (r4.case as { id: string }).id;

    const snapshot = await getJson(await dashboard());
    assert(
      (snapshot.waitingCases as Array<{ id: string }>).some((c) => c.id === caseId),
      'dashboard snapshot should list the waiting case',
    );

    const accepted = await getJson(
      await acceptCase(
        new NextRequest(`http://localhost:3000/api/cases/${caseId}/accept`, {
          method: 'POST',
          body: JSON.stringify({ agentName: 'Asha' }),
        }),
        { params: Promise.resolve({ id: caseId }) },
      ),
    );
    assert(
      (accepted.case as { status: string; assignedTo: string }).status === 'HUMAN_HANDLING' &&
        (accepted.case as { assignedTo: string }).assignedTo === 'Asha',
      'accepting a case should move it to HUMAN_HANDLING',
    );
    const r5 = await send('hello?');
    assert(r5.reply === null, 'AI must stay silent once a human handles the chat');
  } finally {
    await fixture.cleanup();
  }
}

/**
 * The shopping contract the whole feature rests on: an order is editable while it
 * is PLACED, moves on by itself, and is frozen afterwards — for the customer's own
 * clicks and for the AI agent alike, because both go through this service.
 */
async function verifyOrderLifecycle() {
  if (!(await postgresAvailable())) {
    console.log('order lifecycle: skipped (no PostgreSQL reachable)');
    return;
  }
  const previousPlaced = process.env.ORDER_PLACED_SECONDS;
  const previousTransit = process.env.ORDER_TRANSIT_SECONDS;
  // Two seconds per stage keeps the check fast; production defaults are minutes.
  process.env.ORDER_PLACED_SECONDS = '2';
  process.env.ORDER_TRANSIT_SECONDS = '2';

  const shop = await import('../lib/shop/service');
  const fixture = await makeShopFixture('lifecycle');
  try {
    const socks = fixture.products.find((p) => /socks/i.test(p.title))!;
    assert(fixture.order.status === 'PLACED' && fixture.order.editable, 'a new order starts PLACED and editable');

    const added = await shop.addItemToOrder(fixture.client.id, fixture.order.code, socks.sku, 2);
    assert(added.ok && added.data.items.length === 2, 'items can be added while PLACED');
    const removed = await shop.removeItemFromOrder(fixture.client.id, fixture.order.code, socks.sku);
    assert(removed.ok && removed.data.items.length === 1, 'items can be removed while PLACED');
    const lastItem = await shop.removeItemFromOrder(fixture.client.id, fixture.order.code, fixture.product.sku);
    assert(!lastItem.ok && lastItem.error.code === 'LAST_ITEM', 'the final item cannot be removed — cancel instead');

    // Status advances on its own.
    await new Promise((resolve) => setTimeout(resolve, 2200));
    const onTheWay = await shop.getOrderForClient(fixture.client.id, fixture.order.code);
    assert(onTheWay.ok && onTheWay.data.status === 'ON_THE_WAY', 'a PLACED order becomes ON_THE_WAY on its own');
    assert(!onTheWay.data.editable, 'an order on the way is not editable');

    const lateAdd = await shop.addItemToOrder(fixture.client.id, fixture.order.code, socks.sku, 1);
    assert(!lateAdd.ok && lateAdd.error.code === 'ORDER_LOCKED', 'items must not change after the PLACED stage');
    const lateCancel = await shop.cancelOrder(fixture.client.id, fixture.order.code, 'too late');
    assert(!lateCancel.ok && lateCancel.error.code === 'NOT_CANCELLABLE', 'an order on the way cannot be cancelled');

    await new Promise((resolve) => setTimeout(resolve, 2200));
    const delivered = await shop.getOrderForClient(fixture.client.id, fixture.order.code);
    assert(delivered.ok && delivered.data.status === 'DELIVERED', 'an ON_THE_WAY order becomes DELIVERED on its own');
    assert(
      delivered.ok && delivered.data.history.some((h) => /Delivered/.test(h.event)),
      'the timeline should record every status change',
    );
    console.log('order lifecycle: PLACED → ON_THE_WAY → DELIVERED, edits only while PLACED');
  } finally {
    await fixture.cleanup();
    if (previousPlaced === undefined) delete process.env.ORDER_PLACED_SECONDS;
    else process.env.ORDER_PLACED_SECONDS = previousPlaced;
    if (previousTransit === undefined) delete process.env.ORDER_TRANSIT_SECONDS;
    else process.env.ORDER_TRANSIT_SECONDS = previousTransit;
  }
}

/**
 * The agent dashboard may only show conversations whose customer is still there.
 * A browser that stops sending heartbeats (tab closed, signed out, network gone)
 * must have its conversation terminated by the sweep.
 */
async function verifyStaleConversationsAreTerminated() {
  const {
    resetSupportDb,
    createConversation,
    heartbeatConversation,
    sweepStaleConversations,
    getConversation,
    getDashboardSnapshot,
    STALE_AFTER_MS,
  } = await import('../lib/support/store');
  resetSupportDb();

  const live = createConversation({ mode: 'CHAT' });
  const gone = createConversation({ mode: 'VOICE', channel: 'ch-stale' });

  heartbeatConversation(live.id);
  // Pretend the second browser last checked in well over the stale window ago.
  const staleConversation = getConversation(gone.id)!;
  staleConversation.lastSeenAt = Date.now() - STALE_AFTER_MS - 5_000;

  const swept = sweepStaleConversations();
  assert(swept.closed.includes(gone.id), 'a conversation without heartbeats must be closed');
  assert(getConversation(live.id)?.state === 'AI_HANDLING', 'a conversation that is still pinging must stay open');

  const snapshot = getDashboardSnapshot();
  assert(
    snapshot.liveCalls.every((c) => c.id !== gone.id) && snapshot.activeChats.some((c) => c.id === live.id),
    'the dashboard must list live conversations only',
  );
  console.log('conversation lifecycle: stale sessions terminated, dashboard shows live only');
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
  assert(routes.length >= 14, `expected the whole api surface, found ${routes.length} routes`);

  // Only the support store lives in the mirrored document; the shop routes talk to
  // PostgreSQL directly and need no bracketing.
  const stateful = /from '[^']*lib\/support\/(store|tools)[^']*'/;
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
  assert(checked >= 10, `expected at least 10 stateful routes to be checked, got ${checked}`);

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
  await verifyOrderLifecycle();
  await verifyStaleConversationsAreTerminated();
  await verifyHealthRoute();

  console.log('API contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
