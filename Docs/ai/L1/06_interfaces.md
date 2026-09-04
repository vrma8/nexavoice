# 06 Interfaces

> Contracts at repo boundaries: API routes, env vars, runtime events, and shared TypeScript payloads.

## HTTP Route Contracts

### `GET /api/generate-agora-token`

Query params:

- `uid` optional; invalid/zero resolves to random RTM-safe UID.
- `channel` optional; defaults to `quickstart-<uid>` when the client already holds a
  conversation id, so a token refresh reuses the channel the agent is in instead of
  minting a new one (`nv-<id>`, `ai-conversation-<ts>-<rand>` for a fresh request).

Success response:

```json
{ "appId": "…", "token": "...", "uid": "1234", "channel": "ai-conversation-...", "expiresAt": 1730000000000 }
```

`appId` is resolved server-side (`NEXT_PUBLIC_AGORA_APP_ID` → `AGORA_APP_ID` →
`VITE_`/`REACT_APP_` aliases) by `resolveAppId()` in `lib/agora.ts` and is the App ID the
client must join with — the same value signs the token, so the pair cannot drift. It is
what lets the app work when `NEXT_PUBLIC_AGORA_APP_ID` is configured for Runtime only: a
`NEXT_PUBLIC_*` var is inlined into the bundle at build time. `expiresAt` is
`issuedAt + 3600` expressed in **milliseconds**; renewal itself is event-driven
(`token-privilege-will-expire`), so the field is for display and debugging.

Failure response: `{ "error": string, "details"?: string }` — `503` while
`NEXT_AGORA_APP_CERTIFICATE` is missing (the `details` name the variable and the Vercel
environment that must be ticked) instead of a token signed with `undefined`, `500`
otherwise.

### `POST /api/invite-agent`

Body (`ClientStartRequest`):

```json
{ "requester_id": "1234", "channel_name": "ai-conversation-..." }
```

Success (`AgentResponse`):

```json
{ "agent_id": "...", "create_ts": 1710000000, "state": "RUNNING", "conversation_id": "conv_…", "tools_enabled": true }
```

Registers (or reuses, keyed by channel) a `VOICE` conversation in the support store. `tools_enabled` is `false` when `AGENT_TOOLS_SECRET`/`AGENT_TOOLS_BASE_URL` are missing. Validation failures return `400`; server failures return `500`.

### `POST /api/stop-conversation`

Body (`StopConversationRequest`): `{ "agent_id": "...", "conversation_id"?: "conv_…" }`. When `conversation_id` is given the conversation is closed (`CLOSED`, or left `RESOLVED`); an open case is flagged `customerLeftAt`.

Responses:

- `{ "success": true }`
- `{ "success": true, "state": "already-stopping" }` for idempotent stop state
- `{ "error": string }` on failure

### `POST /api/chat/completions`

OpenAI-compatible SSE proxy used as the Agora **custom LLM** when `NEXT_LLM_URL`/`NEXT_LLM_API_KEY` are set. Runs the NexaVoice tools server-side (`lib/chat-completions.ts`), scoped by header `x-nexavoice-conversation-id` (set on `llm.headers` by `lib/agent-config.ts`). Always streams `data: {...}` chunks ending with `data: [DONE]`. Requires `NEXT_LLM_API_KEY` and `NEXT_LLM_URL` (500 otherwise); invalid JSON → 400.

### `POST /api/agent-tools/[tool]?conversation_id=…` (engine → backend)

Headers: `x-nexavoice-tool-token: <tool secret>` (401 otherwise) — `AGENT_TOOLS_SECRET`,
or a value derived from `NEXT_AGORA_APP_CERTIFICATE` when that variable is unset. Body: tool args (+ optional `tool_call_id`, echoed back). Tools: `verify_customer`, `get_order_status`, `list_recent_orders`, `cancel_order`, `update_shipping_address`, `request_return`, `create_ticket`, `escalate_to_human` (404 for anything else). Response: `{ ok, tool, tool_call_id?, ...result }`; guardrail errors come back as `ok: false` with `error` ∈ `CUSTOMER_NOT_VERIFIED | CONFIRMATION_REQUIRED | HANDED_OFF | INVALID_ARGS` (never HTTP 4xx, so the LLM can recover).

### Conversations

- `POST /api/conversations` `{ mode: "CHAT" | "VOICE" }` → `201 { conversation }`.
- `GET /api/conversations?active=1` → `{ conversations }`.
- `GET /api/conversations/:id?since=<ms>` → `{ conversation, messages, case, now }` (messages with `createdAt > since`).
- `PATCH /api/conversations/:id` `{ agentState?, transcript?: [{ role: "user"|"ai"|"human_agent", content, turnId? }], close?, humanUid? }` → `{ conversation }`. Voice client mirrors transcript/agent state here; `turnId` upserts.
- `POST /api/conversations/:id/messages` `{ content, role?: "user" | "human_agent" }` → `{ message, reply, conversation, case, degraded? }`. Customer message while `AI_HANDLING` runs the AI turn (`reply` = AI message); while a human handles the chat `reply` is `null`; `409` once `RESOLVED`/`CLOSED`.
- `POST /api/escalation/request` `{ conversation_id, reason? }` → `{ success, caseId, case, conversation }` (same path as the `escalate_to_human` tool).

### Cases & dashboard

- `GET /api/cases?status=A,B` → `{ cases }` (newest first).
- `GET /api/cases/:id` → `{ case, conversation, messages, now }`.
- `POST /api/cases/:id/accept` `{ agentName }` → `{ case, conversation, voice }`; for voice cases `voice` = `{ appId, token, uid: "654321", channel, agentUid: "123456" }` (RTC+RTM token via `buildTokenWithRtm`, 1 h), else `null`. Idempotent. The agent's uid is returned rather than recomputed in the browser, and the App ID comes from the server for the same reason as the token route.

Timestamp units: every timestamp an API route returns (including `expiresAt`) is Unix **milliseconds**. `RtcTokenBuilder` is the only place Agora's seconds unit is used, and it never crosses the wire.
- `POST /api/cases/:id/takeover` `{ humanUid? }` → `{ ok, aiStopped, announcement: "spoken"|"skipped"|"failed", conversation }`. AI speaks the handover line (`agents.speak`, INTERRUPT), waits ~4.5 s, then `stopAgent`; conversation → `HUMAN_HANDLING`, `agentState: "left"`.
- `POST /api/cases/:id/resolve` `{ note?, humanLeft? }` → `{ case, conversation }` (`RESOLVED`).
- `GET /api/dashboard` → `{ now, liveCalls, activeChats, waitingCases, handlingCases, recentResolved, recentEvents }` (no-store).
- `GET /api/dashboard/events` → SSE: `ready { now, backlog }`, `conversation <ConversationEvent>`, `ping` every 20 s, auto-close after 5 min (`SSE_MAX_LIFE_MS`) with client reconnect — a never-ending stream is incompatible with serverless function limits, hence `export const dynamic = 'force-dynamic'`.
- `GET /api/health` → always HTTP 200 with `{ status: "ok" | "degraded" | "error", agora, agent, store, checkedAt }`:
  - `agora`: `{ appIdConfigured, appId (masked: first 6 + last 4 chars), appCertificateConfigured, publicAppIdInlined, area, error }` — `publicAppIdInlined: false` means the browser bundle was built without the App ID.
  - `agent`: `{ llm: "custom" | "agora-managed", tools: { enabled, baseUrl, secretSource: "AGENT_TOOLS_SECRET" | "derived-from-app-certificate" | null }, interactionLanguage, sttLanguage, ttsVoice }`.
  - `seed`: `{ requested, created, skipped, reason?, error? }` — what the opt-in `NEXAVOICE_SEED=demo` fixture did on this instance.
  - `store`: `getStoreSyncStatus()` (`backend`, `revision`, `remoteRev`, `lastSyncAt`, `lastError`, …) plus `conversations` and a `note` naming the fix when `backend: "none"`.

  Public and safe to open in a browser: booleans, masked ids and non-secret config only — never a certificate, token, or secret value.
- `GET /api/shop/customers[?phone=]`, `GET /api/shop/orders/:id`, `GET /api/shop/tickets?customer_id=` → read-only demo data.

### Handoff summary (`SupportCase.handoff`, v1.md §24)

```json
{ "conversation_id": "conv_…", "mode": "voice", "language": "hinglish", "client_name": "Rahul Sharma", "intent": "cancellation", "summary": "…", "information_collected": [], "actions_taken": [], "reason_for_escalation": "…", "confidence": 0.7, "missing_information": [] }
```

## Event/Data Interfaces

- RTM transcript/state/metrics/errors consumed through `AgoraVoiceAI` event emitter.
- Raw RTM `message` event parsed as fallback for `message.error` and `message.sal_status` payloads.
- `AGENT_METRICS` payloads displayed by `QuickstartPipelineMetrics`.

## Environment Contract

Required:

- `NEXT_PUBLIC_AGORA_APP_ID`
- `NEXT_AGORA_APP_CERTIFICATE`

Voice tools (both required for the engine to call the backend): `AGENT_TOOLS_BASE_URL` (public https origin; falls back to `VERCEL_URL`), `AGENT_TOOLS_SECRET` (≥ 8 chars).

Optional: `AGORA_AREA` (`US`|`EU`|`AP`|`CN`; unknown values warn and fall back to `US`), `AGENT_LANGUAGE` (`en-IN` default; `hi-IN`, `bn-IN`, `ta-IN`, `te-IN`, `gu-IN`, `kn-IN`, `en-US`), `AGENT_STT_LANGUAGE` (`multi`), `AGENT_TTS_VOICE_ID`, `NEXT_LLM_URL` + `NEXT_LLM_API_KEY` (+ `NEXT_LLM_MODEL`) for BYOK LLM (chat agent + custom-LLM voice path).

## Test Coverage for Interfaces

- `scripts/verify-api-contracts.ts` asserts token generation, input validation, env failures, SSE framing, tool guardrails (`CUSTOMER_NOT_VERIFIED`, `CONFIRMATION_REQUIRED`, `HANDED_OFF`, cross-customer isolation, business rules), the REST tool endpoint auth, the agent `toProperties()` wire shape (REST tools, template variables, `asr.params.language = multi`, `enable_tools`/`enable_rtm`), and the chat → escalation → dashboard → accept flow.

## Shared Client-Side Interfaces

From `types/conversation.ts` (high-use):

- `AgoraTokenData`: token bootstrap payload consumed by `VoiceAgentCall` (includes `appId`, `token`, `uid`, `channel`, `expiresAt`, `agentId`, `conversationId`). `appId` comes from the server — the client must not decide the App ID from a build-time env var — and `expiresAt` is the server's view of when the token dies (milliseconds), reported rather than scheduled against.
- `lib/agora.ts`: browser-safe constants (`AGENT_UID = '123456'`, `HUMAN_UID = '654321'`), `resolveAppId()`, and the missing-App-ID message used by both voice surfaces.
- `lib/support/snapshot.ts`: `StoreSnapshot` (`version: 1`) — the only shape the durable mirror carries; every persisted field is listed there.
- `lib/support/types.ts`: `Conversation`, `ConversationMessage`, `SupportCase`, `HandoffSummary`, `ConversationEvent` shared by API routes, dashboard and chat.
- `AgoraRenewalTokens`: renewal callback result (`rtcToken`, `rtmToken`).
- `ConversationComponentProps`: runtime dependencies for in-call component.

## Interface Invariants

- Token payload must always include `token`, `uid`, `channel`.
- Invite route requires both `requester_id` and `channel_name`.
- Stop route requires `agent_id`; missing should never be tolerated silently.
- Token route should always return UID as string for downstream compatibility.
- Tool endpoint never executes a write without `confirmed: true`, never before `verify_customer`, and never after escalation.
- Human agent RTC uid is always `654321` (`DEFAULT_HUMAN_UID`); the customer client uses it to detect a human joining.

## Event Interface Notes

- Metrics stream entries are append-only in component state, capped to recent window.
- Connection issue records carry `source`, `agentUserId`, code/message, timestamp.
- SAL and signaling fallback payloads are parsed defensively because message schema can vary.

## Backward Compatibility Guidance

- If route response shape changes, update both client consumers and contract tests in same change.
- If adding fields, keep existing fields stable to avoid quickstart consumer breakage.
- Reflect interface changes in README and L1 docs to keep sample copyable.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — How route contracts are used in sequence.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Event-level contract mapping.
