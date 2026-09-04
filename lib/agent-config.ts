/**
 * Builds the NexaVoice Agora Conversational AI agent.
 *
 * Pipeline (Agora-managed credentials — no vendor keys needed):
 *   Deepgram nova-3 STT (multilingual: Hindi + English code-switching)
 *   → OpenAI gpt-4o-mini LLM with inline REST tools hitting this backend
 *   → MiniMax speech-2.6-turbo TTS
 *
 * Optional BYOK / custom LLM: set `NEXT_LLM_URL` + `NEXT_LLM_API_KEY` to route
 * the engine to any OpenAI-compatible endpoint — including this app's own
 * `/api/chat/completions` proxy, which executes the same tools server-side
 * (useful if inline REST tools are not enabled on your Agora project).
 */
import {
  Agent,
  type AgoraClient,
  DeepgramSTT,
  MiniMaxTTS,
  OpenAI,
  type TurnDetectionLanguage,
} from 'agora-agents';
import { buildAgoraRestTools, TEMPLATE_VARS } from './agent-tools';
import { buildSystemPrompt, FAILURE_MESSAGE, VOICE_GREETING } from './agent-prompt';

export interface BuildAgentOptions {
  client: AgoraClient;
  conversationId: string;
  /** Shared secret the tool endpoints expect; omitted → tools disabled. */
  toolToken: string | null;
}

/** Deepgram nova-3 `multi` transcribes Hindi/English code-switching in one stream. */
export const STT_LANGUAGE = process.env.AGENT_STT_LANGUAGE?.trim() || 'multi';

/**
 * Interaction language for Agora turn detection (`turn_detection.language`).
 * The SDK copies it into `asr.language`, so keep it a locale both Agora and
 * Deepgram accept. `en-IN` covers Hinglish callers; set `AGENT_LANGUAGE=hi-IN`
 * for Hindi-first deployments (bn-IN, ta-IN, te-IN, gu-IN, kn-IN also valid).
 */
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

/** MiniMax multilingual voice; override with AGENT_TTS_VOICE_ID (e.g. a Hindi voice id). */
export const TTS_VOICE_ID = process.env.AGENT_TTS_VOICE_ID?.trim() || 'English_captivating_female1';

export interface BuiltAgent {
  agent: Agent;
  /** Whether the session was configured with backend tools. */
  toolsEnabled: boolean;
  llmMode: 'agora-managed' | 'custom';
}

export function buildNexaVoiceAgent({ client, conversationId, toolToken }: BuildAgentOptions): BuiltAgent {
  const customLlmUrl = process.env.NEXT_LLM_URL?.trim();
  const customLlmKey = process.env.NEXT_LLM_API_KEY?.trim();
  const useCustomLlm = Boolean(customLlmUrl && customLlmKey);

  const templateVariables: Record<string, string> = {
    [TEMPLATE_VARS.conversationId]: conversationId,
    [TEMPLATE_VARS.toolToken]: toolToken ?? 'disabled',
  };

  const llmCommon = {
    maxHistory: 24,
    greetingMessage: VOICE_GREETING,
    failureMessage: FAILURE_MESSAGE,
    systemMessages: [{ role: 'system', content: buildSystemPrompt({ mode: 'voice' }) }],
    params: { max_tokens: 400, temperature: 0.4, top_p: 0.9 },
    templateVariables,
  };

  const llm = useCustomLlm
    ? new OpenAI({
        ...llmCommon,
        apiKey: customLlmKey!,
        url: customLlmUrl!,
        model: process.env.NEXT_LLM_MODEL?.trim() || 'gpt-4o-mini',
        // Custom endpoints receive the conversation id as a header so the
        // in-process tool loop can scope tool calls (see lib/chat-completions.ts).
        headers: { 'x-nexavoice-conversation-id': conversationId },
        vendor: 'custom',
      })
    : new OpenAI({ ...llmCommon, model: 'gpt-4o-mini' });

  // Inline REST tools (engine → our /api/agent-tools/* endpoints). Only when the
  // Agora-managed LLM is used AND the deployment is publicly reachable; the
  // custom LLM path executes tools itself.
  const restTools = !useCustomLlm && toolToken ? buildAgoraRestTools() : null;

  const agent = new Agent({
    client,
    turnDetection: {
      language: INTERACTION_LANGUAGE,
      config: {
        speech_threshold: 0.5,
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
    // RTM is required for transcript/state events in the browser; enable_tools
    // is required for the engine to invoke tools.
    advancedFeatures: { enable_rtm: true, enable_tools: true },
    parameters: {
      audio_scenario: 'chorus',
      data_channel: 'rtm',
      enable_error_message: true,
      enable_metrics: true,
      silence_config: {
        timeout_ms: 12000,
        action: 'speak',
        content: 'Kya aap line par hain? Main aapki madad ke liye yahan hoon.',
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

/**
 * `OpenAI.toConfig()` has no `tools` option yet; `Agent.toProperties()` spreads
 * the stored LLM config verbatim into `properties.llm`, so we attach the tools
 * to the stored config. Kept in one place so an SDK upgrade is a one-line fix.
 */
function injectRestTools(agent: Agent, tools: ReturnType<typeof buildAgoraRestTools>) {
  const holder = agent as unknown as { _llm?: Record<string, unknown> };
  if (!holder._llm) throw new Error('LLM must be configured before attaching tools');
  holder._llm = { ...holder._llm, tools };
}
