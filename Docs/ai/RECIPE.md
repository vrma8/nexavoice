---
recipe_version: 0.1.0
recipe_status: stable
extension_points:
  - api.routes
  - prompts.system
  - pipeline.providers
  - ui.conversation
  - support.medical-safety
  - support.handoff
invariants:
  - baseline.official-sample
  - tokens.rtc-rtm
  - lifecycle.strict-mode
  - transcript.uid-remap
  - support.medical-guard
  - support.two-sided-end
stable_contracts:
  - env.required
  - api.token
  - api.invite-agent
  - api.stop-conversation
  - api.cases.leave
---

# Quickstart Recipe Profile

This repo is a reusable quickstart sample for building browser voice-agent experiences with Agora Conversational AI Engine.

## Recipe Role

- Role: `base` quickstart recipe.
- Target audience: developers bootstrapping a production-style Next.js voice agent app.
- Reuse model: clone, bind project, run, then customize prompt/pipeline/UI.

## Recipe Scope

This base recipe provides a copyable browser voice-agent starter with:

- browser RTC audio and RTM event transport
- server-side token, invite, stop, and optional custom LLM routes
- managed default STT, LLM, and TTS provider configuration
- pre-call, in-call, transcript, metrics, and connection-status UI

## Baseline Implementation Guidance

This repository is the official Agora Next.js quickstart baseline for this recipe. Agents should use this repo's source and progressive disclosure docs as the starting point, then customize.

Do not recreate Agora ConvoAI integration from memory. Provider schemas, SDK builder fields, token behavior, and RTM event details can drift. For a new baseline implementation, follow [L1/L2/from_scratch_bootstrap.md](L1/L2/from_scratch_bootstrap.md) while copying verified patterns from this repo.

## Extension Points

- `api.routes`: add browser-facing routes under `app/api`, with shared request/response types in `types/conversation.ts` when the client consumes them.
- `prompts.system`: edit the Nexa system prompt and greetings in `lib/agent-prompt.ts`.
- `pipeline.providers`: adjust the `DeepgramSTT`, `OpenAI`, and `MiniMaxTTS` builder chain in `lib/agent-config.ts`, or enable the BYOK blocks.
- `ui.conversation`: customize `VoiceAgentCall` (pre-call bootstrap), `ConversationComponent` (joined call), `QuickstartTranscriptPanel`, and `QuickstartPipelineMetrics`.
- `support.medical-safety`: refuse/auto-escalate policy lives in `lib/support/medical-guard.ts` (threshold, copy, medical product set) and is enforced in `lib/support/tools.ts`, `lib/chat-agent.ts`, `lib/chat-completions.ts` and `lib/agent-prompt.ts` — change it there, not by editing catalogue data.
- `support.handoff`: handoff summary shape and escalation behavior live in `lib/support/tools.ts` (`buildHandoffSummary`) and `lib/support/store.ts` (`createCase`).

## Invariants

- Keep `RtcTokenBuilder.buildTokenWithRtm` for RTM-capable tokens.
- Treat this repo as the official baseline; customize after preserving a working token, invite, RTC, RTM, and transcript flow.
- Preserve StrictMode `isReady` guard for join/mic initialization.
- Preserve UID remap (`uid="0"`) and `INTERRUPTED` message-list inclusion.
- **Medical safety is enforced in the tool layer, not only in the prompt**: medical searches are refused, medicine-category products are filtered from results and blocked from cart/order writes, and the second medical request auto-escalates (`support.medical-guard`).
- **Voice calls are two-sided**: customer close (`CLOSED`, `endedBy: customer`, case `customerLeftAt`) ends the human side, and human resolve/leave (`RESOLVED` / `humanLeftAt`, `endedBy: human`) ends the customer side. `resolveCase` must never delete the conversation — the case keeps the full transcript.
- Keep documentation synchronized when workflows/contracts change.

## Stable Contracts

- `GET /api/generate-agora-token` returns `{ token, uid, channel }`.
- `POST /api/invite-agent` accepts `{ requester_id, channel_name }` and returns the agent id/state payload.
- `POST /api/stop-conversation` accepts `{ agent_id }` and treats already-stopping sessions as success.
- `POST /api/cases/:id/leave` ends the call for both sides (`humanLeftAt` + `endedBy: human`) without resolving.
- Required env vars are `NEXT_PUBLIC_AGORA_APP_ID` and `NEXT_AGORA_APP_CERTIFICATE`.
- `components/VoiceAgentCall.tsx` owns pre-call bootstrap and RTM client lifecycle; the agent dock on `/client` is the voice entry point (`components/LandingPage.tsx` from the upstream quickstart was removed as a dead duplicate bootstrap).
- `components/ConversationComponent.tsx` owns joined-session RTC/toolkit lifecycle (incl. Mute/Unmute and post-handover customer captions).
- `lib/conversation.ts` owns transcript normalization helpers.
- `hooks/use-speech-recognition.ts` owns the post-handover Web Speech captions (customer + human side); Firefox does not support them — the call still works, captions are skipped.

## Internal / Subject to Change

- Visual styling and copy in the quickstart UI.
- The exact reseller defaults for STT, LLM, and TTS models.
- Connection issue display heuristics and metric chip presentation.

## Consumer Onboarding Recipe

1. Clone or scaffold from template.
2. Bind Agora project and write `.env.local`.
3. Run `pnpm run doctor` and `pnpm run dev`.
4. Validate with `pnpm run verify` before sharing modifications.
5. Customize agent behavior and UI using the supported surfaces above.
