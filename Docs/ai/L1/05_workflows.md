# 05 Workflows

> Repeatable task recipes for common quickstart changes and validation loops.

## Run Locally

1. `pnpm install`
2. `agora login`
3. `agora project use <your-project>`
4. `agora project env write .env.local`
5. `pnpm run doctor`
6. `pnpm run dev`

If start fails, run `agora project doctor --deep`.

## Run the NexaVoice demo end to end

0. Database first: `pnpm dev:db` (or any PostgreSQL), `pnpm db:push`, `pnpm seed`.
1. Customer: sign in at `/login` (three demo customers are one click away, or invent one) and shop at `/client` — add products, place an order, watch it go `Placed → On the way → Delivered`.
2. Open the support dock on the same page: **Chat with support** (works fully offline from Agora — LLM-driven when `NEXT_LLM_URL`/`NEXT_LLM_API_KEY` are set, rule-based otherwise) or **Call support** (needs Agora credentials; voice tools need no extra config on an https origin).
3. Ask for the order status, ask to add or remove an item **while the order is still Placed** (the agent proposes, you confirm), or say "talk to a human".
4. Human: open `/support-agent` in another tab — the case appears instantly with the handoff summary and customer details; accept it.
5. Chat: reply from `/support-agent/cases/<id>`; the customer sees `human_agent` messages in the same chat. Voice: click **Join the customer's call** — the AI says the handover line and leaves; talk directly.
6. Mark resolved. The customer UI shows the resolved banner. Closing the customer tab terminates the conversation — the dashboard drops it within ~30s.

For local voice tool calls expose the dev server publicly (e.g. `ngrok http 3000`) and set `AGENT_TOOLS_BASE_URL` to that https URL before starting a call — tools are skipped when the engine would have to reach `localhost`.

To exercise the serverless state path locally, run `pnpm build && pnpm start` against a real `DATABASE_URL`: the support store then round-trips through the `StoreState` row on every request, the way Vercel instances share it. `pnpm run dev` keeps one in-process cache, which is why state bugs do not reproduce there.

## Reset the Data

- `pnpm db:reset` drops and recreates the schema (development only), then `pnpm seed` to reload the catalogue.
- `pnpm seed` alone is idempotent: it upserts the 50 products by SKU and leaves clients, carts and orders untouched.
- The dashboard needs no fixture — it shows live conversations only, so it is empty until somebody actually shops and asks for support.

## Change Agent Behavior

Target files: `lib/agent-prompt.ts` (prompt), `lib/agent-config.ts` (pipeline), `lib/agent-tools.ts` (tools).

Typical edits:

- System prompt / greeting / failure message (`lib/agent-prompt.ts`).
- Shared agent UID (`DEFAULT_AGENT_UID` in `lib/agora.ts`) and human UID (`DEFAULT_HUMAN_UID`).
- VAD (`turnDetection.config.*`), interaction language (`AGENT_LANGUAGE`), STT/TTS vendors and voice (`lib/agent-config.ts`).
- Tools: schema in `lib/agent-tools.ts`, execution + guardrails in `lib/support/tools.ts`, rule-based chat path in `lib/chat-agent.ts`, contract test in `scripts/verify-api-contracts.ts`.
- Catalogue: `lib/shop/catalog-data.ts` (then `pnpm seed`); shop business rules and the order status machine: `lib/shop/service.ts`.

Validation path:

1. `pnpm run lint`
2. `pnpm run typecheck`
3. `pnpm run verify:api`
4. `pnpm run build`

## Change Token or Session Bootstrap

Token behavior:

- Edit `app/api/generate-agora-token/route.ts`.
- Preserve RTM-capable token generation.

Bootstrap behavior:

- Edit `components/VoiceAgentCall.tsx`.
- Keep invite + RTM setup parallelized before conversation mount.

## Change Transcript Rendering

1. Update transforms in `lib/conversation.ts`.
2. Update wiring in `components/ConversationComponent.tsx`.
3. Ensure `IN_PROGRESS` is separated from history, `INTERRUPTED` retained in history.
4. Re-check [transcript_pipeline.md](L2/transcript_pipeline.md) for consistency.

## Ship-Readiness Workflow

1. Run `pnpm run verify`.
2. Confirm docs alignment (`README`, guides, `AGENTS`, `docs/ai`).
3. Use conventional commit and branch naming.

## Progressive Disclosure Doc Workflow

- `generate docs`: create `docs/ai/` tree when absent.
- `update docs`: refresh after workflow/interface/security changes.
- `test docs`: execute question-based validation and write `docs/ai/test-results.md`.
- `fix docs`: close findings from `docs/ai/test-results.md` or a docs review.

## Workflow: Implement a Baseline Recipe Repo

1. Treat this repo as the official Agora Next.js quickstart baseline.
2. Do not recreate Agora ConvoAI integration from memory.
3. Follow [from_scratch_bootstrap.md](L2/from_scratch_bootstrap.md) for the implementation map and checklist.
4. Preserve the recipe invariants in `docs/ai/RECIPE.md`.
5. Run the verification commands before publishing a derivative.

## Workflow: Change a Shop Business Rule

1. Rules live in `lib/shop/service.ts` only — status timings (`ORDER_PLACED_SECONDS`, `ORDER_TRANSIT_SECONDS`), the "editable only while `PLACED`" gate, `LAST_ITEM`, cancellation. The catalogue itself is `lib/shop/catalog-data.ts` (re-run `pnpm seed` after editing it).
2. Never duplicate a rule in a route or a component: `app/api/shop/*` (the customer's own clicks) and `lib/support/tools.ts` (the agent) both call these functions, which is what keeps the two paths honest.
3. Shop routes are unbracketed by design — Prisma is already shared between instances — so do not add `withStore()` there; `scripts/verify-api-contracts.ts` only enforces the bracket for routes importing `lib/support/{store,tools}`.
4. A changed rule surfaces in four places: the service result codes, the tool response (`lib/support/tools.ts`), the chat agent's reply copy (`lib/chat-agent.ts`) and the shopping UI (`components/ShoppingPage.tsx`). Extend `verifyOrderLifecycle` in `scripts/verify-api-contracts.ts` to cover it.

## Workflow: Add a Route That Touches Support State

1. Write the handler, then wrap it: `export const GET = withStore(async (request, context) => { … })` (`lib/support/route-store.ts`). It hydrates the durable mirror before the handler and flushes it after; a route that skips the bracket works in `pnpm run dev` and loses state on Vercel.
2. Do not call `flushStore()` yourself, and never from a `setTimeout`/`after()` — a frozen instance drops scheduled writes. Only a best-effort read (dashboard SSE) may call `hydrateStore()` directly.
3. New store fields must be added to `toSnapshot()`/`applySnapshot()` in `lib/support/snapshot.ts`, or they never cross instances.
4. Give the route `export const maxDuration` within the plan's limit, and add a contract test in `scripts/verify-api-contracts.ts` (it asserts the bracket exists and that no handler flushes by hand).

## Workflow: Add a New API Route

1. Add route under `app/api/<route-name>/route.ts`.
2. Define payload types in `types/conversation.ts` if shared with client.
3. Add/update contract verification in `scripts/verify-api-contracts.ts`.
4. Run `pnpm run verify:api` and `pnpm run typecheck`.
5. Update `README.md` and `docs/ai/L1/06_interfaces.md`.

## Workflow: Modify Transcript UX

1. Update transforms in `lib/conversation.ts`.
2. Update render usage in transcript/layout components.
3. Validate edge states (`IN_PROGRESS`, `INTERRUPTED`, empty history).
4. Reconcile guidance in [transcript_pipeline.md](L2/transcript_pipeline.md).
5. Run `pnpm run lint` and `pnpm run build`.

## Workflow: Enable BYOK Provider Path

1. Uncomment relevant provider block in invite route.
2. Add the provider variables shown in the lower README BYOK section to your local environment.
3. Keep default no-key path intact for baseline quickstart behavior.
4. Keep provider variables out of `env.local.example`; they are not part of the base contract.
5. Re-run `pnpm run verify` before shipping.

## Workflow: Docs Refresh After Runtime Changes

1. Update L1 files matching changed subsystem.
2. Update or add L2 deep dives if L1 explanation exceeds concise bounds.
3. Bump `Last Reviewed` in `L0_repo_card.md`.
4. Re-run docs test and append retest notes for any fixes.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Full runtime sequence for bootstrap and teardown tasks.
- [from_scratch_bootstrap.md](L2/from_scratch_bootstrap.md) — Baseline implementation checklist for recipe consumers.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Required checks when editing transcript flow.
