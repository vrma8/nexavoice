# Agent Development Guide

This guide is for coding agents making changes in **NexaVoice** (a NexaMart shopping-support system built on the Agora `agent-quickstart-nextjs` base). Product spec: `Nexavoice Docs/v1.md`.

## How to Load

This repository uses progressive disclosure documentation. Docs live under `docs/ai/` in three levels.

1. Read [docs/ai/L0_repo_card.md](docs/ai/L0_repo_card.md) to identify the repo.
2. Load ALL 8 files in [docs/ai/L1/](docs/ai/L1/). They are small — load all upfront.
3. Follow L2 deep-dive links only when L1 isn't detailed enough. The index is at [docs/ai/L1/L2/_index.md](docs/ai/L1/L2/_index.md).

This repo declares `Recipe Role: base` in L0, so also read [docs/ai/RECIPE.md](docs/ai/RECIPE.md) when evaluating extension points, invariants, or stable contracts.

The sections below (Start Here, Patterns, Anti-Patterns, etc.) remain the canonical contributor handbook for hands-on work; the `docs/ai/` tree is the structured summary used by AI agents.

## Start Here

- Read [README.md](./README.md) for setup, commands, verification, and deployment.
- Use [docs/ai/RECIPE.md](docs/ai/RECIPE.md) for the base quickstart recipe contract.
- Use [docs/ai/L1/L2/from_scratch_bootstrap.md](docs/ai/L1/L2/from_scratch_bootstrap.md) for the baseline implementation map.
- Use [docs/ai/L1/L2/transcript_pipeline.md](docs/ai/L1/L2/transcript_pipeline.md) for transcript and RTM behavior.
- For layout and responsibilities inside `components/`, `app/api/`, and `lib/`, use [docs/ai/L1/03_code_map.md](docs/ai/L1/03_code_map.md) and [docs/ai/L1/02_architecture.md](docs/ai/L1/02_architecture.md).

## Current System Shape

- App shell: Next.js 16 App Router, React 19, and TypeScript
- Client RTC: `agora-rtc-react` hooks over `agora-rtc-sdk-ng`
- Messaging: `agora-rtm` for transcripts, agent state, metrics, and error events
- Toolkit core: `agora-agent-client-toolkit` for `AgoraVoiceAI`, transcript helpers, and turn status
- UI components: `agora-agent-uikit` for visualizer, transcript, and mic controls
- Server SDK: `agora-agents` for managed agent session startup, `stopAgent`, and `agents.speak` (handover line)
- API routes in `app/api`: token, invite/stop agent, REST tool endpoint for the engine, custom-LLM proxy, conversations/messages (chat), escalation, cases (accept/takeover/resolve), dashboard (+SSE), demo shop, health (deployment self-check)
- Optional demo fixture in `lib/support/seed.ts` (`NEXAVOICE_SEED=demo`), applied through `withStore()`; `pnpm run seed` (`scripts/seed-demo-store.ts`) is the terminal path
- Support domain in `lib/support` (conversation/case store, guarded `executeTool`, handoff summary) and demo shop in `lib/shop` (data + business rules). The store is an in-memory cache on `globalThis`, mirrored to a durable backend (Vercel Blob, or a file for a single container) so state survives across serverless instances — `lib/support/persist.ts` + `snapshot.ts` own that layer.
- Default agent config (`lib/agent-config.ts`): Agora-managed Deepgram STT (`multi`), OpenAI `gpt-4o-mini`, MiniMax TTS; NexaMart system prompt in `lib/agent-prompt.ts`; inline REST tools from `lib/agent-tools.ts`. `/api/health` reports the deployment self-check. `.env.local` needs only Agora credentials — `AGENT_TOOLS_BASE_URL`/`AGENT_TOOLS_SECRET` are optional now (tool origin comes from the request URL, the secret is derived from the App Certificate).
- Chat: `lib/chat-agent.ts` — LLM (`ai` + `@ai-sdk/openai`) when `NEXT_LLM_URL`/`NEXT_LLM_API_KEY` are set, otherwise a rule-based EN/HI/Hinglish agent over the same tools.
- Human dashboard: `components/SupportDashboard.tsx` (SSE + 3s poll of `/api/dashboard`), `components/CaseWorkspace.tsx` (+ `HumanVoiceBridge.tsx` joins the customer's RTC channel as uid `654321`, then `POST /api/cases/:id/takeover` makes the AI hand over and leave).

## Supported Modes

### Local Development

- Run from the repo root with `pnpm run dev`.
- Next.js serves the app and the route handlers at `http://localhost:3000`.
- Local credentials are read from `.env.local`, usually written by `agora project env write .env.local`.

### Vercel Deployment

- Deploy the repository as a single Next.js app.
- Set `NEXT_PUBLIC_AGORA_APP_ID` and `NEXT_AGORA_APP_CERTIFICATE` in the deployment target; keep `NEXT_AGORA_APP_CERTIFICATE` server-side only.
- `NEXT_PUBLIC_AGORA_APP_ID` must be type **Config** and targeted at **Production + Preview**, and the project must be **redeployed** after adding it: a `NEXT_PUBLIC_*` value is inlined at build time, so a variable created afterwards (or targeted only at Development, which is local `vercel env pull`) never reaches the existing bundle. Vercel documents this directly — env changes do not apply to previous deployments.
- The app no longer *fails* on that: `resolveAppId()` prefers the `appId` served by `/api/generate-agora-token`, which the server reads at runtime. Keep both so the fallback and the signed token can never disagree.
- Create a **Vercel Blob store** (Project → Storage → Create Database → Blob) so `BLOB_READ_WRITE_TOKEN` exists and conversation/case state is shared between function instances. Without it, the second chat request lands on an instance that never saw the conversation and answers "Conversation not found".
- Voice tools need the Agora engine to reach `/api/agent-tools/*`; the deployment origin is used automatically and `AGENT_TOOLS_BASE_URL` / `AGENT_TOOLS_SECRET` only override it. A custom `asr.llmTools` object in the `POST /api/invite-agent` body must carry the same `toolsUrl`/`toolsSecret`, because those values are generated server-side.
- Each Vercel function needs a `maxDuration` (exported per route) that fits the plan: without Fluid compute the default is 10s, which cuts `invite-agent` and a streamed LLM turn off mid-flight.
- Check a deployment with `curl https://<deployment>/api/health` — credential state, tool wiring, LLM provider, store backend and what `NEXAVOICE_SEED` did, without leaking secrets.
- Set `AGORA_AREA` to the project's service area: `US` (default) | `EU` | `AP` | `CN`. Agora has no separate India gateway — Asia-Pacific, including India, is `AP`. An unrecognised value warns once and falls back to `US` (`lib/agora-server.ts`), because a wrong region otherwise surfaces as an agent that never starts.
- `NEXAVOICE_SEED=demo` is the opt-in demo fixture; see the Demo Data pattern above before changing it.

## Routing / Ownership

- UI and RTC/RTM client lifecycle live in `components`.
- Browser-facing API routes live in `app/api`.
- Shared constants and transcript normalization live in `lib`.
- Conversation/case **state is owned by the backend store** (`lib/support/store.ts`); the browser only mirrors voice transcript/agent state via `PATCH /api/conversations/:id` and polls for escalation/takeover.
- Every backend mutation by the AI goes through `executeTool` in `lib/support/tools.ts` (verification gate, `confirmed: true` for writes, `HANDED_OFF` after escalation, audit trail). Never let the LLM touch `lib/shop/service.ts` directly.
- If a workflow, request contract, or ownership boundary changes, update `README.md`, `AGENTS.md`, and the relevant `docs/ai/` files in the same change.

## Key Files

- `app/api/generate-agora-token/route.ts`: issues RTC + RTM tokens for the browser user.
- `app/api/invite-agent/route.ts`: registers the VOICE conversation and starts the managed agent session (returns `conversation_id`).
- `lib/agent-config.ts`: agent pipeline (STT/LLM/TTS, turn detection, `turnDetection.language` from `AGENT_LANGUAGE`, RTM + tools flags); `injectRestTools` attaches `llm.tools` because `OpenAI.toConfig()` has no `tools` option yet.
- `lib/agent-prompt.ts`: NexaMart system prompt (voice + chat variants), greeting, failure message.
- `lib/agent-tools.ts`: tool JSON schemas shared by voice/chat + Agora inline REST tool builder (`{{args.x}}`, `{{template_variables.nv_conversation_id|nv_tool_token}}`).
- `app/api/agent-tools/[tool]/route.ts`: engine → backend tool endpoint (`x-nexavoice-tool-token`, `?conversation_id=`).
- `app/api/stop-conversation/route.ts`: stops the agent session and closes the conversation.
- `app/api/chat/completions/route.ts` + `lib/chat-completions.ts`: OpenAI-compatible SSE proxy that runs the tools server-side (custom-LLM path when `NEXT_LLM_URL` is set; header `x-nexavoice-conversation-id`).
- `app/api/conversations/**`, `app/api/escalation/request`, `app/api/cases/**`, `app/api/dashboard/**`, `app/api/shop/**`: support backend (see `docs/ai/L1/06_interfaces.md`).
- `lib/agora-server.ts`: server-side `AgoraClient` factory, `stopAgent` (idempotent), `speakAsAgent`.
- `lib/support/*`, `lib/shop/*`, `lib/chat-agent.ts`, `lib/api.ts`: domain, demo data, chat agent, browser API client.
- `components/VoiceAgentCall.tsx`: session bootstrap, RTM setup, provider wiring, and conversation lifecycle (stores `conversationId`).
- `components/ConversationComponent.tsx`: RTC join, mic publication, `AgoraVoiceAI` init, transcript state, renewals, backend sync (`useConversationSync.ts`), human-join detection (uid `654321`), "Talk to a human".
- `components/ClientChat.tsx`, `components/SupportDashboard.tsx`, `components/CaseWorkspace.tsx`, `components/HumanVoiceBridge.tsx`, `components/HandoffBanner.tsx`: chat, dashboard, case page, voice takeover, caller-side handoff status.
- `components/QuickstartConversationLayout.tsx`: in-call header, transcript rail, and controls dock.
- `components/QuickstartPipelineMetrics.tsx`: per-stage latency chips from `AGENT_METRICS`.
- `components/QuickstartTranscriptPanel.tsx`: live transcript rail.
- `lib/agora.ts`: browser-safe Agora constants — agent UID (`123456`), human agent UID (`654321`), `resolveAppId()`, `MISSING_APP_ID_MESSAGE`.
- `lib/conversation.ts`: transcript normalization and visualizer state mapping.
- `env.local.example`: local environment template.
- `scripts/verify-api-contracts.ts`: route contract verification.

## Patterns

### StrictMode Guard (`isReady`)

Both `useJoin` and `useLocalMicrophoneTrack` are gated by `isReady` to prevent double initialization in React StrictMode dev mode. The cleanup fires synchronously before any `setTimeout`, so only the real second mount's timer fires.

```tsx
const [isReady, setIsReady] = useState(false);
useEffect(() => {
  let cancelled = false;
  const id = setTimeout(() => {
    if (!cancelled) setIsReady(true);
  }, 0);
  return () => {
    cancelled = true;
    clearTimeout(id);
    setIsReady(false);
  };
}, []);
const { isConnected: joinSuccess } = useJoin(config, isReady);
const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);
```

### Hook Ownership

- `useJoin` owns `client.leave()`; never call it manually.
- `useLocalMicrophoneTrack` owns track lifecycle; do not manually call `.close()`.
- `usePublish` owns publish state; mute with `track.setEnabled()` and do not manually unpublish.

### AgoraVoiceAI Init

Initialize `AgoraVoiceAI` from `agora-agent-client-toolkit` inside `ConversationComponent`, gated on `isReady && joinSuccess`.

```tsx
useEffect(() => {
  if (!isReady || !joinSuccess) return;
  // AgoraVoiceAI.init() is called here exactly once.
}, [isReady, joinSuccess]);
```

`isReady` becomes true only after the StrictMode fake-unmount cycle completes. Once `isReady` is true, React does not double invoke the effect for later dependency changes such as `joinSuccess` becoming true.

### Durable Store Bracket (`withStore`)

Any handler that reads or writes `supportDb()` is wrapped in `withStore()`
(`lib/support/route-store.ts`): it hydrates the shared snapshot before the handler
runs and flushes it afterwards. Both halves matter — without the hydration a warm
instance answers from a stale copy, and without the flush the write never leaves the
instance. `flushStore()` must never be called from a handler, a `setTimeout`, or
`after()`: Vercel freezes a function between requests, so scheduled writes are lost;
`scripts/verify-api-contracts.ts` enforces this.

There is deliberately no "hydrated recently, skip the read" cache. Consecutive
requests from one browser land on different instances, so any TTL makes the next turn
see stale state (the customer is asked for their phone number again). `hydrateStore()`
reads on every request and coalesces concurrent reads on one instance instead.
Anything new in the store must round-trip through `toSnapshot()`/`applySnapshot()` in
`lib/support/snapshot.ts` — that list is the contract; unlisted fields work locally
and vanish on Vercel.

**Read-only routes count too.** `/api/shop/*` only reads, but it reads process-local
globals, so an unbracketed GET answers from a stale copy on a warm instance (this was a
real bug: a cancellation made on one instance did not show on another). The bracketing
check in `scripts/verify-api-contracts.ts` walks `app/api/**/route.ts` and fails any
route that imports `lib/shop` or `lib/support` without `withStore()` or an explicit
`hydrateStore()`; keep that list honest when adding routes.

The demo shop is part of the mirror (`snapshot.shop`), with one rule that is easy to get
wrong: `lib/shop/data.ts` tracks the records this process mutated (`markShopTouched`),
and only those win a merge tie — a freshly seeded copy must never overwrite another
instance's cancellation. Any new shop mutation has to call `markShopTouched`.

### Demo Data (`NEXAVOICE_SEED=demo`)

`lib/support/seed.ts` writes a three-record fixture (active chat, escalated HIGH case,
resolved voice call) into the active durable backend so a fresh deployment has a
populated dashboard. It runs from `withStore()` — after hydration, so it sees what other
instances already wrote — once per process, only when the store has **no** conversations,
and never replacing a record that exists. Seeded conversations, messages and events carry
**fixed ids** because two cold instances can seed simultaneously and `mergeSnapshots`
dedupes by id; anything added to the fixture must keep that property or the transcript
doubles. `pnpm run seed` is the explicit terminal path (it reads `.env.local` for
`BLOB_READ_WRITE_TOKEN`). Failures are recorded for `/api/health` and never thrown: demo
data must not be able to break a real conversation.

### Client App ID (`resolveAppId`)

`/api/generate-agora-token` and `/api/cases/[id]/accept` return `appId` next to the
token — the single source of truth for what the browser joins with — resolved by
`resolveAppId()` in `lib/agora.ts`. Client components use that value and only fall
back to `process.env.NEXT_PUBLIC_AGORA_APP_ID`, which is a build-time inlining and
empty on a deployment whose build did not see it. `useJoin`'s `error`, the toolkit's
`joinFromToken` message, and an `invite-agent` non-2xx body are all surfaced in the
UI (`useAgoraError`, `joinFailure`, `lastError`); keep them wired so a failed call
says what failed instead of hanging on "Connecting…".

### Transcript and UI Mapping

- Manage `transcript` and `agentState` through `useState` plus `ai.on(TRANSCRIPT_UPDATED, ...)` and `ai.on(AGENT_STATE_CHANGED, ...)`.
- The toolkit uses `uid="0"` as a sentinel for the local user's speech. Remap that value to `client.uid` before passing messages into `QuickstartTranscriptPanel`, or user speech renders on the agent side.
- Include `INTERRUPTED` turns in `messageList`; filter only `IN_PROGRESS`. If the agent's first turn is interrupted and omitted, `messageList` stays empty and the transcript panel never shows that first turn.

### Tokens and Styling

- RTM token access must come from `RtcTokenBuilder.buildTokenWithRtm`; a standard RTC-only token does not grant RTM access.
- Tailwind must scan uikit classes with `./node_modules/agora-agent-uikit/dist/**/*.{js,mjs}` in `tailwind.config.ts`.

## Working Rules

- Prefer the smallest change that keeps the quickstart copyable and production-style.
- Keep RTC client creation StrictMode-safe with `useRef`, not `useMemo`.
- Keep token generation on `RtcTokenBuilder.buildTokenWithRtm`.
- Keep transcript UID remapping aligned with the toolkit sentinel behavior.
- Do not require third-party vendor API keys unless the code actually introduces a BYOK provider path.
- Keep README, AGENTS, and `docs/ai/` aligned with implementation changes.
- Never invent Agora REST endpoints or fields: use the `agora-agents` SDK or the documented `/v2/projects/{appid}/{join|agents/:id/leave|speak|update}` routes only.
- Writes to demo data require explicit customer confirmation (`confirmed: true` in the tool call); keep that check in `lib/support/tools.ts`, not in the prompt only.
- Never expose `NEXT_AGORA_APP_CERTIFICATE` or `AGENT_TOOLS_SECRET` to the browser; the tool secret only travels engine → server via template variables.

## Commands

From the repo root:

```bash
pnpm install
pnpm run doctor
pnpm run dev
pnpm run verify
```

Useful narrower checks:

```bash
pnpm run lint
pnpm run typecheck
pnpm run verify:api
pnpm run build
```

## Verification Safety

- Safe without live Agora credentials:
  - `pnpm run lint`
  - `pnpm run typecheck`
  - `pnpm run verify:api` (also covers tool guardrails, the REST tool endpoint, agent `toProperties()` wire shape, and the chat → escalation → accept flow)
  - `pnpm run build`
- The full chat/dashboard flow can be exercised locally without Agora (`pnpm run dev`, then `/client/chat` and `/support-agent`). Live voice + tool calls + human takeover need real Agora credentials and a public `AGENT_TOOLS_BASE_URL`.
- Requires local env setup but not a live Agora session:
  - `pnpm run doctor`
  - `pnpm run verify`
- Often blocked inside restricted sandboxes because of port binding or process spawning:
  - `pnpm run dev`

## Anti-Patterns / What NOT To Do

- Do not call `client.leave()` manually; it breaks `useJoin` cleanup.
- Do not call `localMicrophoneTrack.close()` manually; it breaks hook ownership.
- Do not remove the `isReady` guard.
- Do not set `reactStrictMode: false` as a workaround.
- Do not use the deprecated `turnDetection.type: 'agora_vad'` flat API; use `turnDetection.config.start_of_speech` and `turnDetection.config.end_of_speech`.
- Do not replace `RtcTokenBuilder.buildTokenWithRtm` with an RTC-only token builder.
- Do not hide SDK requirements only in `CLAUDE.md`; all agent-facing guidance belongs in `AGENTS.md`.
- Do not read `supportDb()` in a route handler outside `withStore()`, and do not call
  `flushStore()` from a timer, `after()`, or a handler — the write only survives on a
  serverless platform when it is awaited inside the request.
- Do not add a store field to `lib/support/` without mirroring it in
  `toSnapshot()`/`applySnapshot()`.
- Do not decide the browser's App ID from `process.env.NEXT_PUBLIC_AGORA_APP_ID` in a
  client component; take `appId` from the token/accept response via `resolveAppId()`.
- Do not swallow `useJoin`/`joinFromToken`/`invite-agent` errors into a console warning.

## Done Criteria

Before finishing a change:

1. Run the narrowest relevant verification command.
2. For shipped app/runtime changes, ensure `pnpm run verify` passes.
3. If you changed files in `components/` or `app/api/`, verify that `README.md`, this file, and the relevant `docs/ai/` files still match the implementation.
4. Update root README and affected docs when workflow, request contracts, architecture, or environment guidance changes.
5. If the change touches workflows, interfaces, gotchas, or security details, update the matching file under [docs/ai/L1/](docs/ai/L1/) and bump `Last Reviewed` in [docs/ai/L0_repo_card.md](docs/ai/L0_repo_card.md).

## Git Conventions

### Commit messages — conventional commits

- **Format:** `type: description` or `type(scope): description`
- **Types:** `feat:` (new feature), `fix:` (bug fix), `chore:` (maintenance, version bumps), `test:` (test additions/changes), `docs:` (documentation)
- **Scoped variant:** `feat(scope):`, `fix(scope):` — e.g. `feat(api): add stop-conversation status flag`
- **Lowercase after prefix** — `feat: add feature`, not `feat: Add feature`
- **Present tense** — "add feature", not "added feature"
- **PR number appended** — `feat: add feature (#123)`

### Branch names

- **Format:** `type/short-description` — lowercase, hyphen-separated
- **Types match commit types:** `feat/`, `fix/`, `chore/`, `test/`, `docs/`
- **Examples:** `feat/agent-metrics`, `fix/transcript-uid`, `docs/progressive-disclosure`

### General rules

- **No AI tool names** — never mention claude, cursor, copilot, cody, aider, gemini, codex, chatgpt, or gpt-3/4 in commit messages or PR descriptions.
- **No Co-Authored-By trailers** — omit AI attribution lines.
- **No `--no-verify`** — let git hooks run normally.
- **No git config changes** — do not modify `user.name` or `user.email`.

## Doc Commands

| Command         | When to use                                                  |
| --------------- | ------------------------------------------------------------ |
| generate docs   | No `docs/ai/` directory exists yet                           |
| update docs     | Code changed since the `Last Reviewed` date in L0            |
| test docs       | Verify docs give agents the right context (writes `docs/ai/test-results.md`) |
| fix docs        | Close findings from a docs review or test run                |

The generator and tester live in the [AgoraIO-Community/ai-devkit](https://github.com/AgoraIO-Community/ai-devkit) skill set. See the [progressive disclosure standard](https://github.com/AgoraIO-Community/ai-devkit/blob/main/docs/progressive-disclosure-standard.md) for the full specification.
