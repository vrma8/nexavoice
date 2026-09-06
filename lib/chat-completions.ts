import { NextRequest, NextResponse } from 'next/server';
import { jsonSchema, stepCountIs, streamText, tool, type ModelMessage, type ToolSet } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { randomUUID } from 'crypto';
import { executeTool, TOOL_DEFINITIONS } from '@/lib/support/tools';
import { getConversation, updateConversation } from '@/lib/support/store';
import {
  isMedicalRequest,
  MEDICAL_ESCALATION_LIMIT,
  MEDICAL_ESCALATION_REASON,
  MEDICAL_REFUSAL_COPY,
} from '@/lib/support/medical-guard';

type ChatBody = {
  messages?: Array<{ role: string; content: unknown }>;
  model?: string;
  /** NexaVoice extension: scopes tool calls to a backend conversation. */
  conversation_id?: string;
  [key: string]: unknown;
};

type ChatCompletionsDeps = {
  createOpenAIClient: typeof createOpenAI;
  streamTextImpl: typeof streamText;
};

export const CONVERSATION_HEADER = 'x-nexavoice-conversation-id';

/**
 * Builds Vercel AI SDK tools bound to one conversation. The same shared tool
 * layer (`lib/support/tools.ts`) backs the Agora voice agent, so chat and voice
 * share identical capabilities and guardrails.
 */
export function buildConversationTools(conversationId: string): ToolSet {
  const tools: ToolSet = {};
  for (const definition of TOOL_DEFINITIONS) {
    tools[definition.name] = tool({
      description: definition.description,
      inputSchema: jsonSchema<Record<string, unknown>>(definition.parameters as never),
      execute: async (input: Record<string, unknown>) => {
        const outcome = await executeTool(conversationId, definition.name, input ?? {});
        return { ok: outcome.ok, ...outcome.result };
      },
    });
  }
  return tools;
}

/**
 * OpenAI-compatible `/chat/completions` handler (SSE).
 *
 * Two callers:
 *  1. Agora Conversational AI, when `NEXT_LLM_URL` points here ("custom LLM").
 *     The engine sends the conversation id in `x-nexavoice-conversation-id`
 *     (set via `llm.headers` in lib/agent-config.ts).
 *  2. The web chat UI (`/client/chat`) via lib/api.ts, sending `conversation_id`
 *     in the body.
 *
 * Tool calls are executed server-side in a bounded loop; only the final text
 * is streamed back, so the engine can speak it directly.
 */
export function createChatCompletionsHandler({
  createOpenAIClient,
  streamTextImpl,
}: ChatCompletionsDeps) {
  return async function POST(request: NextRequest) {
    const apiKey = process.env.NEXT_LLM_API_KEY;
    const llmUrl = process.env.NEXT_LLM_URL;
    const modelId = process.env.NEXT_LLM_MODEL?.trim() || 'gpt-4o';

    if (!apiKey || !llmUrl) {
      return NextResponse.json(
        { error: 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set' },
        { status: 500 },
      );
    }

    const baseURL = llmUrl.replace(/\/chat\/completions\/?$/, '');

    let body: ChatBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const conversationId =
      (typeof body.conversation_id === 'string' && body.conversation_id) ||
      request.headers.get(CONVERSATION_HEADER) ||
      undefined;
    const conversation = conversationId ? getConversation(conversationId) : null;

    // Hard medical gate for the custom-LLM voice path (Agora engine →
    // /api/chat/completions): the model never sees a medical turn, so it cannot
    // answer one even if the system prompt is bypassed. First ask → refusal;
    // second ask → case created + handoff summary (same policy as the tools).
    const lastUser = [...((body.messages as ModelMessage[]) ?? [])].reverse().find((m) => m.role === 'user');
    const lastUserText = typeof lastUser?.content === 'string' ? lastUser.content.trim() : '';
    if (conversation && lastUserText && isMedicalRequest(lastUserText)) {
      const count = (conversation.context.medicalRequestCount ?? 0) + 1;
      const queries = [...(conversation.context.medicalQueries ?? []), lastUserText.slice(0, 160)]
        .filter(Boolean)
        .slice(-6);
      updateConversation(conversation.id, {
        context: {
          medicalRequestCount: count,
          medicalQueries: queries,
        },
      });

      let replyText: string;
      if (count < MEDICAL_ESCALATION_LIMIT) {
        const lang = conversation.context.language === 'hindi' ? 'hi' : conversation.context.language === 'hinglish' ? 'hinglish' : 'en';
        replyText = MEDICAL_REFUSAL_COPY[lang];
      } else {
        const outcome = await executeTool(conversation.id, 'escalate_to_human', {
          reason: MEDICAL_ESCALATION_REASON,
          intent: 'medical_advice',
          summary:
            `Customer repeatedly (${count} times) asked for medical advice or medication recommendations despite NexaVoice policy. ` +
            `Last message: "${lastUserText.slice(0, 160)}". No medical advice or product recommendation was given by the AI.`,
          language: conversation.context.language,
          confidence: 0.9,
          information_collected: queries.map((q) => `customer asked: ${q}`),
          missing_information: [],
        });
        replyText = outcome.ok
          ? `A human support agent has been connected for your request — please hold on. I am not able to give medical advice; they can help you with this.`
          : 'I could not reach a human agent right now. Please try again in a moment.';
      }

      const encoder = new TextEncoder();
      const sseChunk = (
        delta: Record<string, unknown>,
        finishReason: string | null = null,
      ) =>
        encoder.encode(
          `data: ${JSON.stringify({
            id: `chatcmpl-medical`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: body.model ?? modelId,
            choices: [{ index: 0, delta, finish_reason: finishReason }],
          })}\n\n`,
        );
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(sseChunk({ role: 'assistant', content: '' }));
          controller.enqueue(sseChunk({ content: replyText }));
          controller.enqueue(sseChunk({}, 'stop'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new NextResponse(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    const openai = createOpenAIClient({ apiKey, baseURL });
    const result = streamTextImpl({
      model: openai(modelId),
      messages: (body.messages ?? []) as ModelMessage[],
      ...(conversation
        ? {
            tools: buildConversationTools(conversation.id),
            // Enough steps to read the cart/order, search the catalogue, preview
            // a change and apply it after a yes — all inside one spoken turn, so
            // the agent never answers with "let me check" and then goes silent.
            stopWhen: stepCountIs(10),
          }
        : {}),
    });

    const encoder = new TextEncoder();
    const id = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const model = body.model ?? modelId;

    const sseChunk = (
      delta: Record<string, unknown>,
      finishReason: string | null = null,
    ) =>
      encoder.encode(
        `data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`,
      );

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(sseChunk({ role: 'assistant', content: '' }));
          for await (const chunk of result.textStream) {
            controller.enqueue(sseChunk({ content: chunk }));
          }
          controller.enqueue(sseChunk({}, 'stop'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  };
}
