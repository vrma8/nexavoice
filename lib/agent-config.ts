import {
  Agent,
  type AgoraClient,
  DeepgramSTT,
  MiniMaxTTS,
  OpenAI,
  type TurnDetectionLanguage,
} from 'agora-agents';
import { buildAgoraRestTools, TEMPLATE_VARS } from './agent-tools';
import { buildSystemPrompt, buildVoiceGreeting, FAILURE_MESSAGE, normalizeLanguageName } from './agent-prompt';

export interface BuildAgentOptions {
  client: AgoraClient;
  conversationId: string;
  toolToken: string | null;
  toolsBaseUrl?: string | null;
  customer?: { name?: string; preferredLanguage?: string } | null;
}

export const STT_LANGUAGE = process.env.AGENT_STT_LANGUAGE?.trim() || 'multi';

const INTERACTION_LANGUAGES: ReadonlySet<TurnDetectionLanguage> = new Set<TurnDetectionLanguage>([
  'en-IN',
  'en-US',
  'hi-IN',
  'bn-IN',
  'ta-IN',
  'te-IN',
  'gu-IN',
  'kn-IN',
]);
export const INTERACTION_LANGUAGE: TurnDetectionLanguage = (() => {
  const requested = process.env.AGENT_LANGUAGE?.trim() as TurnDetectionLanguage | undefined;
  if (!requested) return 'en-IN';
  if (INTERACTION_LANGUAGES.has(requested)) return requested;
  console.warn(`[agent-config] Unsupported AGENT_LANGUAGE "${requested}", falling back to en-IN`);
  return 'en-IN';
})();

export const TTS_VOICE_ID = process.env.AGENT_TTS_VOICE_ID?.trim() || 'English_captivating_female1';

export interface BuiltAgent {
  agent: Agent;
  toolsEnabled: boolean;
  llmMode: 'agora-managed' | 'custom';
}

export function buildNexaVoiceAgent({
  client,
  conversationId,
  toolToken,
  toolsBaseUrl,
  customer,
}: BuildAgentOptions): BuiltAgent {
  const customLlmUrl = process.env.NEXT_LLM_URL?.trim();
  const customLlmKey = process.env.NEXT_LLM_API_KEY?.trim();
  const useCustomLlm = Boolean(customLlmUrl && customLlmKey);

  const templateVariables: Record<string, string> = {
    [TEMPLATE_VARS.conversationId]: conversationId,
    [TEMPLATE_VARS.toolToken]: toolToken ?? 'disabled',
  };

  const preferredLanguage = normalizeLanguageName(customer?.preferredLanguage);

  const restTools =
    !useCustomLlm && toolToken && toolsBaseUrl !== null
      ? buildAgoraRestTools(toolsBaseUrl)
      : null;

  const effectiveToolsEnabled = Boolean(restTools) || useCustomLlm;

  const llmCommon = {
    maxHistory: 32,
    greetingMessage: buildVoiceGreeting(preferredLanguage, customer?.name),
    failureMessage: FAILURE_MESSAGE,
    systemMessages: [
      {
        role: 'system',
        content: buildSystemPrompt({
          mode: 'voice',
          customerName: customer?.name,
          preferredLanguage,
          toolsEnabled: effectiveToolsEnabled,
        }),
      },
    ],
    params: { max_tokens: 400, temperature: 0.3, top_p: 0.9 },
    templateVariables,
  };

  const llm = useCustomLlm
    ? new OpenAI({
        ...llmCommon,
        apiKey: customLlmKey!,
        url: customLlmUrl!,
        model: process.env.NEXT_LLM_MODEL?.trim() || 'gpt-4o-mini',
        headers: { 'x-nexavoice-conversation-id': conversationId },
        vendor: 'custom',
      })
    : new OpenAI({ ...llmCommon, model: 'gpt-4o-mini' });

  const agent = new Agent({
    client,
    turnDetection: {
      language: INTERACTION_LANGUAGE,
      config: {
        speech_threshold: 0.8, // Hardcoded threshold to override console sync issues
        start_of_speech: {
          mode: 'vad',
          vad_config: { interrupt_duration_ms: 200, prefix_padding_ms: 300 },
        },
        end_of_speech: {
          mode: 'vad',
          vad_config: { silence_duration_ms: 560 },
        },
      },
    },
    advancedFeatures: {
      enable_rtm: true,
      ...(restTools && restTools.length > 0 ? { enable_tools: true } : {}),
    },
    parameters: {
      audio_scenario: 'chorus',
      data_channel: 'rtm',
      enable_error_message: true,
      enable_metrics: true,
      silence_config: {
        timeout_ms: 25000,
        action: 'speak',
        content: 'Are you still there? I am here to help you.',
      },
    },
  })
    .withStt(new DeepgramSTT({ model: 'nova-3', language: STT_LANGUAGE }))
    .withLlm(llm)
    .withTts(new MiniMaxTTS({ model: 'speech_2_6_turbo', voiceId: TTS_VOICE_ID }));

  if (restTools) {
    injectRestTools(agent, restTools);
  }

  return {
    agent,
    toolsEnabled: Boolean(restTools) || useCustomLlm,
    llmMode: useCustomLlm ? 'custom' : 'agora-managed',
  };
}

function injectRestTools(agent: Agent, tools: ReturnType<typeof buildAgoraRestTools>) {
  const holder = agent as unknown as { _llm?: Record<string, unknown> };
  if (!holder._llm) throw new Error('LLM must be configured before attaching tools');
  holder._llm = { ...holder._llm, tools };
}
