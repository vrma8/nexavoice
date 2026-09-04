# 07 Gotchas

> High-impact pitfalls that regularly break session startup, transcript rendering, or lifecycle cleanup.

## Critical Runtime Pitfalls

- Using RTC-only token generation breaks RTM login and transcript/state events.
- Removing `isReady` guard can trigger StrictMode double-initialization and duplicate/missing tracks.
- Manual `client.leave()` conflicts with `useJoin` cleanup contract.
- Manual `localMicrophoneTrack.close()` conflicts with hook-owned lifecycle.
- **The store is per process.** `globalThis.supportDb` is shared by every route under
  `pnpm dev`, so cross-instance state bugs never reproduce locally. Wrap every support
  handler in `withStore()` (`lib/support/route-store.ts`); never write state from a
  `setTimeout` or `after()` — Vercel freezes a function between requests, so the write
  is lost.
- **No hydration TTL.** Consecutive requests from one browser land on different
  instances; skipping a read because "we just synced" answers the next turn from stale
  state (the customer is asked for their phone number again).
- **Demo records need fixed ids.** `NEXAVOICE_SEED=demo` data is written by whichever
  instance cold-starts first, and two at once is normal on Vercel. The seeded
  conversations, messages and events in `lib/support/seed.ts` therefore use deterministic
  ids so `mergeSnapshots` dedupes them — random ids double the seeded transcript.
- **Anything added to `lib/support/types.ts` must be mirrored** in
  `lib/support/snapshot.ts`'s `toSnapshot()`/`applySnapshot()`, or it works locally and
  vanishes on a serverless deployment.
- **`NEXT_PUBLIC_*` is a build-time value.** If `NEXT_PUBLIC_AGORA_APP_ID` was added after
  the last build — or targets only Development — the client bundle holds `undefined` and a
  join with an empty App ID fails without a message. Vercel never retro-applies env changes
  to an existing deployment, so redeploy; `resolveAppId()` also takes the `appId` served by
  `/api/generate-agora-token`, which the server reads at runtime.
- **`maxDuration` is per route** and must fit the plan (non-Fluid default 10 s, Hobby
  cap 300 s). A value above the plan cap builds fine and fails at runtime, which is why
  `chat/completions` is 60 s, not 300 s.
- **SSE needs `dynamic = 'force-dynamic'`** and a finite lifetime, or the prerenderer
  tries to run the never-ending stream at build time.

## Transcript Pitfalls

- Not remapping toolkit `uid="0"` causes user turns to render as agent turns.
- Dropping `INTERRUPTED` from message history can keep transcript panel from auto-opening on first interrupted turn.
- Skipping punctuation/timestamp normalization creates inconsistent transcript readability and issue time ordering.

## Agent Startup Pitfalls

- Missing `NEXT_PUBLIC_AGORA_APP_ID`/`NEXT_AGORA_APP_CERTIFICATE` yields hard 500s on token/invite/stop routes.
- Changing the agent UID outside `lib/agora.ts` can desynchronize the browser and invite route.
- RTM subscription failures may only surface through SAL status or raw signaling fallback events.

## Frontend Lifecycle Pitfalls

- Initializing toolkit before `joinSuccess` often causes missing subscriptions.
- Tying mic track creation directly to mute state can break visualizer audio graph.
- Failing to teardown RTM client on session end leaks subscriptions and stale events.

## Docs/Process Pitfalls

- Changing `components/` or `app/api/` without syncing README/GUIDE/TEXT_STREAMING/AGENTS leads to stale operator guidance.
- Updating workflows/contracts without updating `docs/ai/L1` and L0 `Last Reviewed` breaks progressive disclosure trust.
- Base recipe contracts also require `docs/ai/RECIPE.md` updates when extension points, invariants, or stable APIs change.

## Fast Triage Checklist

1. Run `agora project doctor --deep`.
2. Verify token route still uses `buildTokenWithRtm`.
3. Check `uid="0"` remap path.
4. Check `isReady` guard and hook ownership constraints.
5. Inspect connection issues panel for RTM/SAL/agent error signals.

## Frequent Regression Patterns

- Refactoring token route and accidentally removing RTM capability.
- Simplifying transcript list logic and unintentionally dropping interrupted turns.
- Moving toolkit init into mount-only effect and reintroducing StrictMode double-init.
- Replacing `useRef` RTC client storage with recreated client object per render.

## Symptom-to-File Debug Guide

| Symptom | First Files to Inspect |
| --- | --- |
| RTM login fails | `app/api/generate-agora-token/route.ts`, `components/VoiceAgentCall.tsx` |
| Agent starts but no transcript | `components/ConversationComponent.tsx`, `lib/conversation.ts` |
| Conversation hangs on end | `components/VoiceAgentCall.tsx`, `app/api/stop-conversation/route.ts` |
| Metrics panel empty | `components/ConversationComponent.tsx`, `components/QuickstartPipelineMetrics.tsx` |
| Agent talks but never looks up orders | server log `[invite-agent] Backend tools disabled` → `AGENT_TOOLS_BASE_URL`/`AGENT_TOOLS_SECRET`; `lib/agent-tools.ts` |
| `/join` rejected (`InvalidRequestBody` on `llm.tools`) | project lacks inline REST tools → set `NEXT_LLM_URL`/`NEXT_LLM_API_KEY` (custom-LLM path); `lib/agent-config.ts` |
| Agent ignores Hindi / transcribes as English | `AGENT_LANGUAGE` (turn detection) and `AGENT_STT_LANGUAGE` (`multi`) in `lib/agent-config.ts`; SDK forces `asr.language = turnDetection.language` |
| Human joins but AI keeps talking | `app/api/cases/[id]/takeover/route.ts` needs `conversation.agentId`; check `[takeover]` logs, `AGORA_AREA` |
| Dashboard empty after redeploy | store is in-memory (`globalThis`); restarts drop conversations/cases |
| Chat case opened for wrong customer | rule-based agent extracts 10-digit phones from free text; see `extractPhone` in `lib/chat-agent.ts` |

## Sandbox and Local Dev Caveats

- `pnpm run dev` can fail in restricted environments due to port/process limits.
- Route contract checks are better suited for restricted CI/sandbox contexts.
- Some failures are environment-binding issues, not code regressions.

## Pre-merge Gotcha Checklist

- Confirm no manual `leave()` or `close()` lifecycle calls were introduced.
- Confirm transcript mapping still remaps sentinel local UID.
- Confirm token renewal still returns both RTC and RTM tokens.
- Confirm every write tool still requires `confirmed: true` and verification (`npm run verify:api` covers it).
- Confirm the human agent uid stays `654321` on both `accept` route and `ConversationComponent`.
- Confirm docs were updated when workflow/interface behavior changed.

## Incident Learning Notes

- Connection issue deduplication intentionally uses a small time window to avoid noisy cascades.
- Invite failures are intentionally non-fatal to allow UI fallback state visibility.
- Raw RTM fallback parsing exists because higher-level hooks may miss some signaling payloads in edge conditions.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Start/stop race and lifecycle ownership details.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Transcript edge cases and failure surfaces.
