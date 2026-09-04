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

  console.log('API contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
