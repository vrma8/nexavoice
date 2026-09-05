# 03 Code Map

> Directory-level ownership map and where to change behavior safely.

## Top-Level Layout

```text
app/                 Next.js routes + API handlers
components/          Client UI and RTC/RTM lifecycle
lib/                 Shared constants, shop/support domains, transcript helpers
prisma/              PostgreSQL schema (clients, products, carts, orders, store mirror)
scripts/             Database, seed, verification and doctor helpers
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
- `conversations/`, `conversations/[id]/`, `conversations/[id]/messages/`, `conversations/[id]/close/`: conversation CRUD, voice transcript mirror, chat turns, browser heartbeat (`PATCH … { heartbeat: true }`) and the idempotent `sendBeacon` close.
- `auth/login/route.ts`, `auth/me/route.ts`: client / support-agent sign-in against the `Client` and `Agent` tables.
- `escalation/request/route.ts`: manual escalation.
- `cases/`, `cases/[id]/`, `cases/[id]/{accept,takeover,resolve}/`: human agent case lifecycle (accept issues the human's channel token; takeover makes the AI speak + leave).
- `dashboard/route.ts`, `dashboard/events/route.ts`: dashboard snapshot + SSE feed.
- `shop/products/route.ts`, `shop/cart/route.ts`, `shop/orders/route.ts`, `shop/orders/[id]/route.ts`: the shopping API for the signed-in client (identified by the `x-nexavoice-client-id` header) — catalogue, cart CRUD, checkout, and `PATCH` order edits (`add_item`, `remove_item`, `set_qty`, `address`, `cancel`). These talk to PostgreSQL directly and are the only API routes that are not `withStore()`-bracketed.

## Client Ownership (`components`)

- `VoiceAgentCall.tsx`: pre-call shell, token/invite/RTM bootstrap, conversation mount/unmount, `conversationId` plumbing.
- `ConversationComponent.tsx`: RTC join, mic publish, toolkit init, transcript/metrics/issues state, backend sync (`useConversationSync.ts`), human-join detection, "Talk to a human"; `HandoffBanner.tsx` shows escalation/takeover status.
- `ShoppingPage.tsx`: the `/client` shopping experience — catalogue, cart, checkout, orders with live status and in-place editing while an order is `PLACED`.
- `AgentDock.tsx`: the slide-over launched from the shopping page that hosts either `ClientChat` or `VoiceAgentCall`, so support never navigates the customer away from their cart.
- `ClientChat.tsx`: customer chat (create conversation bound to the signed-in client, send, heartbeat, poll for human replies, escalate, close on leave).
- `SupportDashboard.tsx`: human dashboard (SSE + poll, live calls/chats, queue, handoff summary, customer details, accept).
- `CaseWorkspace.tsx` + `HumanVoiceBridge.tsx`: case page (transcript, join call as uid `654321` → takeover, chat reply, resolve).
- `QuickstartConversationLayout.tsx`: in-call framing and slots.
- `QuickstartTranscriptPanel.tsx`: live transcript panel.
- `QuickstartPipelineMetrics.tsx`: latency chips from metrics stream.
- `ConnectionStatusPanel.tsx` + `ConversationErrorCard.tsx`: issue rendering/severity.

## Shared Logic (`lib`)

- `agora.ts`: default constants (`DEFAULT_AGENT_UID` = 123456, `DEFAULT_HUMAN_UID` = 654321).
- `agora-server.ts`: server-side `AgoraClient` factory (`AGORA_AREA`), `stopAgent`, `speakAsAgent`, ConvoAI auth headers.
- `agent-config.ts` / `agent-prompt.ts` / `agent-tools.ts`: agent pipeline, NexaMart system prompt + language-aware greetings (the greeting confirms the customer's saved `preferredLanguage`), tool schemas + Agora inline REST tool wiring.
- `conversation.ts`: transcript normalization, spacing cleanup, spoken-number → digit conversion (`normalizeTranscriptText`), timestamp normalization, visualizer state mapping.
- `numbers.ts`: `spokenNumbersToDigits()` — renders spoken numbers (English / Hindi / Hinglish words, Devanagari digits) as digits in transcripts and chat, so phone numbers, PIN codes and amounts always look like numbers; lone romanised words ("kar do") are deliberately left alone.
- `chat-completions.ts`: dependency-injected custom-LLM SSE handler with tool loop; keeping it outside the route module preserves Next.js route-export constraints.
- `chat-agent.ts`: chat turn — LLM (`ai` SDK) when configured, else rule-based EN/HI/Hinglish agent over `executeTool` (cart add/remove/status, order status/edits, cancel, address, explicit language switches via `set_preferred_language`, escalation).
- `support/types.ts`, `support/store.ts`, `support/tools.ts`: conversation/case model, in-memory store + event bus + dashboard snapshot, guarded tool execution + handoff summary.
- `support/persist.ts`, `support/snapshot.ts`, `support/route-store.ts`: durable mirror — PostgreSQL (`StoreState` JSONB row) or memory, the versioned snapshot + merge rules, and the `withStore()` hydrate/flush bracket every support route uses.
- `support/store.ts` also owns liveness: `heartbeatConversation()`, `STALE_AFTER_MS` (30s) and `sweepStaleConversations()`, called from `getDashboardSnapshot()`/`hydrateStore()` so the dashboard can only ever show live conversations.
- `agora.ts`: browser-safe Agora constants (`AGENT_UID`, `HUMAN_UID`, fallback App ID) and `resolveAppId()`.
- `shop/catalog-data.ts`: the fixed 60-product NexaMart catalogue (INR prices, categories, SKUs) — the single source every client shops from.
- `shop/service.ts`: every shop read/write through Prisma — catalogue, cart, checkout, order edits — plus `syncOrderStatuses()`, the lazy `PLACED → ON_THE_WAY → DELIVERED` machine and the "editable only while placed" rule shared by the UI and the agent tools.
- `shop/http.ts`: `x-nexavoice-client-id` parsing and `requireClient()` (503 without `DATABASE_URL`, 401 without a known client).
- `db.ts`: the Prisma client singleton.
- `auth.ts`, `session.ts`: client/agent records and the browser-side session.
- `api.ts`: browser API client for the shop, chat, conversations, escalation, dashboard, cases.

## Validation and Tooling

- `scripts/verify-api-contracts.ts`: imports route handlers and validates contract behavior (tool schemas, guards, token/agent/health contracts, tool URL + secret derivation, snapshot round-trip, store bracketing).
- `scripts/seed-catalog.ts`: `pnpm seed` — upserts the 60 products by SKU (idempotent; never touches clients, carts or orders).
- `scripts/db-push.mjs`: `pnpm db:push` / `pnpm db:reset --force` — offline `prisma db push` using the WASM schema engine.
- `scripts/dev-db.mjs`: `pnpm dev:db` — PGlite over TCP on `127.0.0.1:5433`, a real PostgreSQL with nothing to install.
- `scripts/doctor.mjs`: local setup checks consumed by `pnpm run doctor`.
- `tailwind.config.ts`: includes `agora-agent-uikit` dist classes in content scan.

## Fast File Lookup

- Change agent prompt -> `lib/agent-prompt.ts`; model/VAD/voice/language -> `lib/agent-config.ts`.
- Add or change a tool -> `lib/agent-tools.ts` (schema) + `lib/support/tools.ts` (execution/guardrails) + `lib/chat-agent.ts` (rule-based path) + `scripts/verify-api-contracts.ts`.
- Change the catalogue -> `lib/shop/catalog-data.ts`, then `pnpm seed`.
- Change shop business rules (edit window, status timings, cancel rules) -> `lib/shop/service.ts` only; the shopping page and the agent tools both call it.
- Change the shopping UI -> `components/ShoppingPage.tsx`, `components/AgentDock.tsx`.
- Change escalation / handoff summary -> `lib/support/tools.ts` (`buildHandoffSummary`), `lib/support/store.ts` (`createCase`).
- Change token policy/channel naming/App ID serving -> `app/api/generate-agora-token/route.ts` + `lib/agora.ts`.
- Change durable state (backend, snapshot fields, merge) -> `lib/support/persist.ts`, `lib/support/snapshot.ts`; bracket new routes with `withStore()` from `lib/support/route-store.ts`.
- Change transcript mapping behavior -> `lib/conversation.ts` + `components/ConversationComponent.tsx`.
- Change session bootstrap UX -> `components/VoiceAgentCall.tsx`.
- Change dashboard -> `components/SupportDashboard.tsx`, `components/CaseWorkspace.tsx`.

## Additional Component Roles

- `LoadingSkeleton.tsx` / `ErrorBoundary.tsx`: fallback and crash containment for the lazily mounted call UI.
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
