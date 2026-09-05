# 01 Setup

> Environment setup, commands, and safe verification flow for this quickstart.

## Runtime Requirements

- Node.js `>=22` (`package.json` engines field).
- `pnpm` package manager.
- Agora CLI (`agora`) for project binding and environment bootstrap.
- Agora project with Conversational AI enabled.
- PostgreSQL (`DATABASE_URL`). `pnpm dev:db` provides one locally with nothing to install (PGlite over TCP on `127.0.0.1:5433`).

Install the Agora CLI from the root `README.md` instructions. On Windows, use the PowerShell installer first; if it fails, run the shell installer from Git Bash and then verify with `agora --help`.

## Install and Bootstrap

1. Install dependencies.
2. Bind an Agora project.
3. Write `.env.local`.
4. Verify setup before running.

```bash
pnpm install
agora login
agora project use <your-project>
agora project env write .env.local
agora project doctor --deep

# Database (required for the shop and for shared conversation state)
pnpm dev:db        # optional local PostgreSQL; leave running in its own terminal
# DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres → .env.local
pnpm db:push       # create the tables (pnpm db:reset drops and recreates them)
pnpm seed          # upsert the fixed 60-product catalogue
```

## Required Environment Variables

- `NEXT_PUBLIC_AGORA_APP_ID`: Agora project App ID. Alias: `AGORA_APP_ID` (server-side only; the browser then gets the App ID at runtime from `/api/generate-agora-token`).
- `NEXT_AGORA_APP_CERTIFICATE`: Agora App Certificate (server only). Alias: `AGORA_APP_CERTIFICATE`.
- `DATABASE_URL`: PostgreSQL. Holds clients, the 60-product catalogue, carts, orders and the mirrored support store. Without it `/api/shop/*` answers 503 and conversation state is per-instance.

Names that look related but are **never read**: `AGORA_PROJECT_ID`, `AGORA_PROJECT_NAME`, `AGORA_ENABLED_FEATURES`, `AGORA_FEATURE_RTC/RTM/CONVOAI` (Agora CLI / template metadata). Enabling Conversational AI is a console action (`agora project doctor --deep` verifies), not an env var. `/api/health` (`agora.credentialSources`) lists any of these that are set.

## NexaVoice Optional Variables

- `AGENT_TOOLS_BASE_URL` + `AGENT_TOOLS_SECRET` (≥ 8 chars): enable the voice agent's REST tools (order lookup/changes/escalation). The URL must be publicly reachable by Agora (Vercel URL, or a tunnel for local dev).
- `AGORA_AREA`: `US` (default) | `EU` | `AP` | `CN` — the Agora REST gateway region, which
  must match the project's service area (Asia-Pacific, including India, is `AP`). Anything
  else logs a warning once and falls back to `US`, because a wrong region surfaces as an
  agent that never starts rather than a clear error.
- `AGORA_REGION`: fallback for `AGORA_AREA` using the Agora CLI's naming (`US`/`EU`/`AP`/`CN`
  map directly; the CLI's `global` routes through the US gateway). Read only when
  `AGORA_AREA` is unset.
- `AGENT_LANGUAGE` (`en-IN` default), `AGENT_STT_LANGUAGE` (`multi`), `AGENT_TTS_VOICE_ID`.
- `ORDER_PLACED_SECONDS` (120) + `ORDER_TRANSIT_SECONDS` (180): how fast an order walks `placed → on the way → delivered`. The *placed* window is also the window in which the customer or the agent may change its items.
- `NEXAVOICE_STORE` (`memory` | `postgres`, auto-detected) and `NEXAVOICE_STATE_KEY` (mirror row id).
- `NEXT_LLM_URL` + `NEXT_LLM_API_KEY` (+ `NEXT_LLM_MODEL`): BYOK LLM for the chat agent and the custom-LLM voice path. Without them chat falls back to the rule-based agent.

See `env.local.example` for the annotated template.

## Primary Commands

```bash
pnpm dev:db
pnpm db:push
pnpm seed
pnpm run dev
pnpm run lint
pnpm run typecheck
pnpm run verify:api
pnpm run build
pnpm run verify
```

## Verification Safety

Safe without live session:

- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run verify:api` (its shop / tool / escalation checks skip themselves when `DATABASE_URL` is unreachable — start `pnpm dev:db` to run them)
- `pnpm run build`

Requires env/project binding:

- `pnpm run doctor`
- `pnpm run verify`

## Local Run Notes

- App + API routes run at `http://localhost:3000`.
- Session starts from `VoiceAgentCall` (**Call support** in the agent dock on `/client`) and bootstraps token + RTM + invite flow. The `components/LandingPage.tsx` / `QuickstartPreCallCard.tsx` pair from the upstream quickstart was removed: it was an unused second bootstrap path that never registered a conversation, so escalation and transcript mirroring could not work through it.
- If transcript or agent join fails, first run `agora project doctor --deep`.

## CI Expectations

- Build workflow badge exists in root `README.md`.
- Pre-ship expectation: `pnpm run verify` passes.
- Route contract tests are executed by `scripts/verify-api-contracts.ts`.

## Troubleshooting Matrix

| Symptom | Probable Cause | First Check | Fix Path |
| --- | --- | --- | --- |
| Agent never joins | Invite route or env mismatch | `pnpm run doctor` and invite route logs | Verify the shared agent UID and invite payload |
| Transcript missing | RTM token capability missing | Token route implementation | Ensure `buildTokenWithRtm` remains unchanged |
| `verify` fails at doctor | Project not bound | `agora project use` output | Re-bind project and rewrite `.env.local` |
| Mic publishes but no agent response | Agent start failed | UI warning (`agentJoinError`) | Inspect `/api/invite-agent` response |
| Chat "Conversation not found", or the agent forgets the customer every turn | Each Vercel function got its own in-memory store | `GET /api/health` → `store.backend` is `memory` | Set `DATABASE_URL` (Vercel → Storage → Postgres) and run `pnpm db:push` |
| Shopping page says the shop is unavailable (503) | No `DATABASE_URL`, or the schema/catalogue was never created | `GET /api/shop/products` | `pnpm db:push && pnpm seed` |
| Voice banner stays on "Connecting…" / call never joins with no error | App ID absent from the client bundle (`NEXT_PUBLIC_*` is inlined at build time, so a variable added after the last deploy never reaches it) or the join error was swallowed | `GET /api/health` → `agora.publicAppIdInlined`; the banner now renders the `useJoin` error | Target `NEXT_PUBLIC_AGORA_APP_ID` at Production/Preview and **redeploy**; the `appId` served by `/api/generate-agora-token` also carries it |
| Agent answers without looking up orders | Engine could not reach the tool URL | `GET /api/health` → `agent.tools` (`enabled`, `baseUrl`, `secretSource`) | Expose the app over https (Vercel URL / ngrok) and set `AGENT_TOOLS_BASE_URL` |
| Dashboard is empty | Nothing is live — by design it shows ongoing conversations only | Shop in another tab and open the support dock | Nothing to fix; a conversation is swept 30s after the customer's last heartbeat |
| Chat answers look canned, no free discussion | No LLM configured — the rule-based agent is active | `GET /api/health` → `agent.llm` is `agora-managed` | Set `NEXT_LLM_URL` + `NEXT_LLM_API_KEY` (and `NEXT_LLM_MODEL`) |
| `Agent invite failed: fetch failed` | Region mismatch with the Agora project | `AGORA_AREA`, `agora project doctor --deep` | Set `AGORA_AREA` to the project region (`US`/`EU`/`AP`/`CN`) |

## Local-Only vs Deploy-Specific

Local:

- Uses `.env.local` created by `agora project env write`.
- Uses `next dev --webpack`.
- Best for flow debugging and transcript behavior checks.

Vercel:

- Target every variable at **Production** and **Preview**, then **redeploy**. Vercel applies
  environment-variable changes to new deployments only, and a `NEXT_PUBLIC_*` value is
  frozen into the client bundle at build time — so a variable added after the last build
  is present at runtime but `undefined` in the browser, which is the classic "the call
  never connects, with no error" case here.
- Use type **Config** for `NEXT_PUBLIC_AGORA_APP_ID` (Vercel's guidance for public framework
  prefixes; the value is readable in the dashboard and never grants anything by itself) and
  **Secret** for `NEXT_AGORA_APP_CERTIFICATE`. A Secret is still available to the build —
  Vercel only redacts its value from build logs — and this app never sends the certificate
  to the browser.
- Do not rely on a **Development** target for a deployed app: that one feeds a local
  `vercel env pull` / `vercel dev`, not a Production deployment.
- Create a PostgreSQL database (Project → Storage → Create Database → Postgres) so
  `DATABASE_URL` is injected: it holds the shop (clients, products, carts, orders) and the
  mirrored conversation/case state that lets a second chat turn find its conversation.
  Check the variable covers Production, then run `pnpm db:push && pnpm seed` against it once.
- Tune `ORDER_PLACED_SECONDS` / `ORDER_TRANSIT_SECONDS` if the demo should show a longer
  (or shorter) editable window before an order ships.
- Set `AGORA_AREA` when the project is not in the `US` area (`AP` covers India; `AGORA_REGION`
  with the CLI's `global` value routes through `US`), and
  `NEXT_LLM_URL` + `NEXT_LLM_API_KEY` to replace the rule-based chat agent with the LLM one.
- Check the deployment with `curl https://<deployment>/api/health` — it reports credential
  presence, which env names provided them (`agora.credentialSources`, including inert Agora
  CLI variables that are set), whether the bundle was built with the App ID, tool wiring,
  the LLM provider and the store backend, and never a secret value. By default it also runs
  one read-only live round trip to the Conversational AI control plane (`agora.convoai`;
  skip with `?deep=0`): `ok: true` proves credentials, feature enablement, gateway area and
  quota in a single shot, and a failure names the broken leg (auth / feature / quota / area)
  in its `hint`.

## Setup Change Checklist

When setup docs/config change:

1. Update `README.md` environment/commands sections.
2. Update `env.local.example` if variable set changes.
3. Update `docs/ai/L1/01_setup.md` and `L0_repo_card.md` `Last Reviewed`.
4. Run at least `pnpm run typecheck` and `pnpm run verify:api`.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Full start/join/teardown sequence.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — RTM transcript/event pipeline internals.
