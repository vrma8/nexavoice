# 02 Architecture

> Runtime architecture for browser RTC/RTM, Next.js route handlers, and Agora managed agent session.

## High-Level Shape

- Next.js App Router frontend and API routes in one deployable app.
- Browser joins Agora RTC channel and uses RTM for transcript/state/metrics/errors.
- Server-side routes mint token and call Agora Agent Server SDK.
- Agent executes STT -> LLM -> TTS pipeline in Agora cloud; the LLM calls back into this app's `/api/agent-tools/*` (inline REST tools) or the whole LLM step runs through `/api/chat/completions` (custom LLM).
- A backend support store (`lib/support`) owns conversation/case state for both chat and voice; the human dashboard consumes it via `/api/dashboard` (+ SSE) and the case routes.

## Component Graph

```text
Customer voice UI (VoiceAgentCall + ConversationComponent)
  -> GET /api/generate-agora-token
  -> POST /api/invite-agent            (creates VOICE conversation, starts agent)
  -> RTC join/publish mic
  -> RTM subscribe + AgoraVoiceAI events
  -> PATCH /api/conversations/:id      (mirror transcript + agent state)
  -> POST /api/escalation/request      ("Talk to a human")
  -> POST /api/stop-conversation

Customer chat UI (ClientChat)
  -> POST /api/conversations, POST /api/conversations/:id/messages, GET …?since=

Agora Cloud
  -> Agent session (Deepgram STT multi + OpenAI LLM + MiniMax TTS)
  -> tool calls: POST /api/agent-tools/<tool>?conversation_id=…  (x-nexavoice-tool-token)
     or custom LLM: POST /api/chat/completions (tools run in-process)
  -> RTM payloads (transcript, state, metrics, error)

Backend (lib/support + lib/shop)
  -> executeTool guardrails -> shop service (business rules) -> audit + events
  -> escalate_to_human -> SupportCase + handoff summary -> SSE to dashboard

Human dashboard (SupportDashboard, CaseWorkspace, HumanVoiceBridge)
  -> GET /api/dashboard, GET /api/dashboard/events
  -> POST /api/cases/:id/accept      (token for the customer's channel, uid 654321)
  -> RTC join same channel -> POST /api/cases/:id/takeover (AI speaks handover, leaves)
  -> POST /api/conversations/:id/messages role=human_agent (chat)
  -> POST /api/cases/:id/resolve
```

## Conversation State Machine

`AI_HANDLING -> WAITING_FOR_HUMAN -> HUMAN_HANDLING -> RESOLVED`, with `CLOSED` when the customer leaves before resolution. Transitions happen only in `lib/support/store.ts` (`createCase`, `acceptCase`, `resolveCase`, `closeConversation`); clients poll or subscribe.

## Start Sequence

1. UI fetches RTC+RTM token and channel.
2. UI invites agent and initializes RTM in parallel.
3. UI mounts conversation view.
4. `useJoin` connects RTC once `isReady` guard passes.
5. `AgoraVoiceAI.init()` subscribes transcript/state/metrics streams.

## End Sequence

1. UI calls `/api/stop-conversation` with `agent_id` if present.
2. UI logs out RTM client.
3. RTC hook ownership handles leave/unpublish cleanup.
4. Component state resets to pre-call shell.

## Core State Domains

- Session bootstrap: `VoiceAgentCall` (`agoraData`, `rtmClient`, loading/error flags).
- RTC transport and mic: `ConversationComponent` + `agora-rtc-react` hooks.
- Transcript + agent state: `AgoraVoiceAI` events mapped through `lib/conversation.ts`.
- Metrics and connection issues: `AGENT_METRICS`, `MESSAGE_ERROR`, `SAL_STATUS`, RTM fallback parsing.

## External Dependencies

- `agora-rtc-react` / `agora-rtc-sdk-ng` for media transport.
- `agora-rtm` for data channel.
- `agora-agent-client-toolkit` and `agora-agent-uikit` for conversation logic/UI.
- `agora-agents` for managed agent lifecycle.

## Deployment Modes

- Local development via `pnpm run dev`.
- Vercel deployment as single Next.js app with server env vars.

## Data and Control Boundaries

- Browser never sees the app certificate; only receives signed short-lived tokens.
- Agent lifecycle control (`start`, `stop`) is server-routed.
- Transcript/state/metrics are data-plane RTM events from agent to browser.
- UI control-plane actions (start/end, renew) originate in `VoiceAgentCall`.

## Internal Interfaces Between Components

`VoiceAgentCall` -> `ConversationComponent` props:

- `agoraData` (`token`, `uid`, `channel`, optional `agentId`)
- `rtmClient` (already logged-in and subscribed)
- `onTokenWillExpire(uid)` callback for dual-token renewal
- `onEndConversation()` callback for teardown and route stop call

`ConversationComponent` -> child UI components:

- normalized transcript items and current in-progress turn
- agent visualizer state derived from transport + semantic state
- connection issue list and derived severity
- recent metric window for stage latency chips

## Why the App Router Structure Matters

- API handlers under `app/api` co-deploy with UI and share env management.
- Client components isolate browser-only SDK usage via dynamic import and `ssr: false`.
- This avoids SSR-side access to WebRTC-dependent modules.

## Change Impact Hints

- Changes to token or invite routes affect both startup and renewal paths.
- Changes to transcript mapping can break both transcript panel and visualizer semantics.
- Changes to RTM setup in `VoiceAgentCall` affect toolkit subscription readiness.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Detailed bootstrapping and teardown timeline.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Event mapping, UID remap, in-progress/completed segmentation.
