import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createChatCompletionsHandler } from '@/lib/chat-completions';
import { withStore } from '@/lib/support/route-store';

/**
 * OpenAI-compatible chat completions proxy. It runs the NexaVoice tools
 * server-side, so it mutates the same store as every other route — hence the
 * `withStore` bracket (hydrate before, durable flush before the response ends).
 *
 * `maxDuration`: the handler streams an LLM response with up to 5 tool rounds;
 * Vercel's default budget is not enough for a slow upstream.
 */
export const maxDuration = 60;

export const POST = withStore(
  createChatCompletionsHandler({
    createOpenAIClient: createOpenAI,
    streamTextImpl: streamText,
  }),
);
