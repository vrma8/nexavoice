# 03 Code Map

> Directory-level ownership map and where to change behavior safely.

## Top-Level Layout

```text
app/                 Next.js routes + API handlers
components/          Client UI and RTC/RTM lifecycle
lib/                 Shared constants and transcript helpers
scripts/             Verification and doctor helpers
docs/                Human-oriented guides
docs/ai/             Progressive disclosure docs (this system)
public/              Static assets and branding
types/               Shared TypeScript route/component contracts
```

## API Route Ownership (`app/api`)

- `generate-agora-token/route.ts`: builds RTC+RTM token via `buildTokenWithRtm`.
- `invite-agent/route.ts`: validates input/env, registers the VOICE conversation, builds the agent via `lib/agent-config.ts` and starts the session.
- `stop-conversation/route.ts`: stops agent (idempotent) and closes the conversation.
- `chat/completions/route.ts`: OpenAI-compatible SSE proxy with server-side tools (custom-LLM path).
- `agent-tools/[tool]/route.ts`: secret-protected REST tool endpoint called by the Agora engine.
- `conversations/`, `conversations/[id]/`, `conversations/[id]/messages/`: conversation CRUD, voice transcript mirror, chat turns.
- `escalation/request/route.ts`: manual escalation.
- `cases/`, `cases/[id]/`, `cases/[id]/{accept,takeover,resolve}/`: human agent case lifecycle (accept issues the human's channel token; takeover makes the AI speak + leave).
- `dashboard/route.ts`, `dashboard/events/route.ts`: dashboard snapshot + SSE feed.
- `shop/{customers,orders/[id],tickets}/route.ts`: read-only demo shop.

## Client Ownership (`components`)

- `VoiceAgentCall.tsx`: pre-call shell, token/invite/RTM bootstrap, conversation mount/unmount, `conversationId` plumbing.
- `ConversationComponent.tsx`: RTC join, mic publish, toolkit init, transcript/metrics/issues state, backend sync (`useConversationSync.ts`), human-join detection, "Talk to a human"; `HandoffBanner.tsx` shows escalation/takeover status.
- `ClientChat.tsx`: customer chat (create conversation, send, poll for human replies, escalate).
- `SupportDashboard.tsx`: human dashboard (SSE + poll, live calls/chats, queue, handoff summary, customer details, accept).
- `CaseWorkspace.tsx` + `HumanVoiceBridge.tsx`: case page (transcript, join call as uid `654321` → takeover, chat reply, resolve).
- `QuickstartConversationLayout.tsx`: in-call framing and slots.
- `QuickstartTranscriptPanel.tsx`: live transcript panel.
- `QuickstartPipelineMetrics.tsx`: latency chips from metrics stream.
- `ConnectionStatusPanel.tsx` + `ConversationErrorCard.tsx`: issue rendering/severity.

## Shared Logic (`lib`)

- `agora.ts`: default constants (`DEFAULT_AGENT_UID` = 123456, `DEFAULT_HUMAN_UID` = 654321).
- `agora-server.ts`: server-side `AgoraClient` factory (`AGORA_AREA`), `stopAgent`, `speakAsAgent`, ConvoAI auth headers.
- `agent-config.ts` / `agent-prompt.ts` / `agent-tools.ts`: agent pipeline, NexaMart system prompt, tool schemas + Agora inline REST tool wiring.
- `conversation.ts`: transcript normalization, spacing cleanup, timestamp normalization, visualizer state mapping.
- `chat-completions.ts`: dependency-injected custom-LLM SSE handler with tool loop; keeping it outside the route module preserves Next.js route-export constraints.
- `chat-agent.ts`: chat turn — LLM (`ai` SDK) when configured, else rule-based EN/HI/Hinglish agent over `executeTool`.
- `support/types.ts`, `support/store.ts`, `support/tools.ts`: conversation/case model, in-memory store + event bus + dashboard snapshot, guarded tool execution + handoff summary.
- `shop/data.ts`, `shop/service.ts`: NexaMart demo customers/orders/tickets and business rules (cancel/address/return windows).
- `api.ts`: browser API client for chat, conversations, escalation, dashboard, cases.

## Validation and Tooling

- `scripts/verify-api-contracts.ts`: imports route handlers and validates contract behavior.
- `scripts/doctor.mjs`: local setup checks consumed by `pnpm run doctor`.
- `tailwind.config.ts`: includes `agora-agent-uikit` dist classes in content scan.

## Fast File Lookup

- Change agent prompt -> `lib/agent-prompt.ts`; model/VAD/voice/language -> `lib/agent-config.ts`.
- Add or change a tool -> `lib/agent-tools.ts` (schema) + `lib/support/tools.ts` (execution/guardrails) + `lib/chat-agent.ts` (rule-based path) + `scripts/verify-api-contracts.ts`.
- Change demo data / business rules -> `lib/shop/data.ts`, `lib/shop/service.ts`.
- Change escalation / handoff summary -> `lib/support/tools.ts` (`buildHandoffSummary`), `lib/support/store.ts` (`createCase`).
- Change token policy/channel naming -> `app/api/generate-agora-token/route.ts`.
- Change transcript mapping behavior -> `lib/conversation.ts` + `components/ConversationComponent.tsx`.
- Change session bootstrap UX -> `components/VoiceAgentCall.tsx`.
- Change dashboard -> `components/SupportDashboard.tsx`, `components/CaseWorkspace.tsx`.

## Additional Component Roles

- `QuickstartPreCallCard.tsx`: start CTA and pre-call messaging.
- `QuickstartConversationLayout.tsx`: shared in-call composition shell.
- `MicrophoneSelector.tsx`: input-device selection UI.
- `ConnectionStatusPanel.tsx`: summary + detailed connection issue panel.
- `ErrorBoundary.tsx`: runtime guardrail for conversation subtree.

## Type Contract Locations

- `types/conversation.ts`: request/response payloads and component prop types.
- `types/env.d.ts`: typed environment variable expectations.
- `types/jsx.d.ts` and `react-jsx.d.ts`: JSX typing support details.

## Static and Styling Assets

- `public/*`: icons, logos, and heading SVG assets used in pre-call/in-call experience.
- `app/globals.css` and `styles/globals.css`: baseline theme/layout styles.
- `tailwind.config.ts`: utility class scan and theme extension.

## Verification Path Mapping

- API contract behavior test: `scripts/verify-api-contracts.ts`.
- Environment and prerequisites check: `scripts/doctor.mjs`.
- Aggregate check chain: `pnpm run verify` script in `package.json`.

## Ownership Boundaries

- `components/` owns client runtime lifecycle and UI state.
- `app/api/` owns privileged operations needing app certificate.
- `lib/` owns pure transforms reusable across client modules.
- `docs/` owns human-facing implementation narrative and runbooks.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Cross-file call path during start/stop.
- [from_scratch_bootstrap.md](L2/from_scratch_bootstrap.md) — Official baseline map for recreating the quickstart recipe.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Mapping and rendering flow from toolkit events.
