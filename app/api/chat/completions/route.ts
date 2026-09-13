import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createChatCompletionsHandler } from '@/lib/chat-completions';
import { withStore } from '@/lib/support/route-store';

export const maxDuration = 60;

export const POST = withStore(
  createChatCompletionsHandler({
    createOpenAIClient: createOpenAI,
    streamTextImpl: streamText,
  }),
);
