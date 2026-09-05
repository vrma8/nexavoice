# NexaVoice — Multilingual AI Support for NexaMart (Agora Conversational AI)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)

NexaVoice is **NexaMart**, a small Indian online shop with AI-first customer support. A customer signs in, shops a 60-product catalogue priced in rupees, places an order and watches it move **placed → on the way → delivered**. While an order is still *placed* its items can be changed — by the customer on the page, or by the AI agent when they ask.

Support is one click away from the shopping page: **chat** or a **voice call** (Agora Conversational AI Engine — STT → LLM → TTS in Agora Cloud), in **Hindi, English or Hinglish**. The agent reads the customer's real orders from PostgreSQL and — only with explicit confirmation — changes them, and it escalates to a **human agent dashboard** that shows only live calls and chats and receives a handoff summary with the customer's profile, orders and what was already said. For voice, the human joins the *same* Agora channel and the AI hands over and leaves.

Built on the Agora Next.js quickstart (voice visualizer via [Agent UIKit](https://agoraio-conversational-ai.github.io/agent-uikit/), transcripts + `AGENT_METRICS` via [Agent Toolkit](https://github.com/AgoraIO-Conversational-AI/agent-client-toolkit-ts)). Product spec: [`Nexavoice Docs/v1.md`](./Nexavoice%20Docs/v1.md).

## Routes

| Route                        | Who      | What                                                                                     |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `/`                          | —        | Landing: customer vs. support agent                                                      |
| `/login`                     | Both     | Sign in as a customer (name + mobile, optional address) or as a support agent            |
| `/client`                    | Customer | **Shopping page**: catalogue, cart, orders with live status, and a dock to chat or call the agent |
| `/support-agent`             | Human    | Live dashboard: ongoing calls/chats, escalation queue, handoff summary + customer details  |
| `/support-agent/cases/[id]`  | Human    | Case workspace: transcript, join the customer's call (AI leaves), chat reply, resolve      |

Everything the app shows lives in **PostgreSQL**: clients, the fixed 60-product catalogue ([`lib/shop/catalog-data.ts`](lib/shop/catalog-data.ts) → `Product` rows), carts, orders and the support store. Sign-in creates or matches a client by mobile number; the login page offers three ready-made demo customers (Rahul Sharma 9876543210 · Delhi, Priya Nair 9123456780 · Bengaluru, Amit Verma 9988776655 · Lucknow) and any new customer shops the same catalogue.

## Prerequisites

- [Node.js 22+](https://nodejs.org/en/download/)
- [pnpm](https://pnpm.io/installation)
- [Agora CLI](https://github.com/AgoraIO-Community/cli)
- **PostgreSQL** — any instance (Neon, Supabase, Vercel Postgres, local). No database handy? `pnpm dev:db` starts a real PostgreSQL in WASM (PGlite) on `127.0.0.1:5433` with nothing to install.

## Run It

Getting started is quick and easy: install the CLI _(skip if you already have it)_ , scaffold the Next.js quickstart using the Agora CLI, install dependencies, and run.

1. **Install the Agora CLI and sign in**
   _(skip if `agora` is already on your PATH)_:

   macOS and Linux:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/AgoraIO/cli/main/install.sh | sh -s -- --add-to-path
   ```

   Windows PowerShell:

   ```powershell
   irm https://dl.agora.io/cli/install.ps1 | iex
   ```

   If the Windows install command fails in PowerShell, try running the macOS/Linux command from [Git Bash](https://git-scm.com/downloads/win), then open a new terminal and run `agora --help` to confirm the CLI is on your PATH.

   Then verify and sign in:

   ```bash
   agora --help
   agora login
   ```

   If `agora --help` is not found after install, close and reopen your terminal, then try again. If it still fails, check that the installer-added Agora CLI location is on your shell `PATH`.

2. **Scaffold and run**
   `agora init` clones the starter, binds an Agora project, and writes `.env.local`. (replace `my-nextjs-demo` with your own project name):

   ```bash
   agora init my-nextjs-demo --template nextjs
   cd my-nextjs-demo
   pnpm install
   pnpm dev
   ```

3. **Create the schema and load the catalogue**, then open the app:

   ```bash
   pnpm dev:db          # optional: zero-install PostgreSQL on 127.0.0.1:5433 (leave running)
   # DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres  → .env.local
   pnpm db:push         # create the tables (pnpm db:reset drops and recreates them)
   pnpm seed            # insert the 50 NexaMart products
   pnpm dev
   ```

4. Open [http://localhost:3000](http://localhost:3000), sign in as a customer, add a couple of products to the cart and place an order. Then use **Chat with support** / **Call support** on the same page and ask the agent to add or remove an item while the order is still *Placed*.

If the agent does not join or transcripts do not appear, run **`agora project doctor --deep`** to check credentials, feature enablement, network reachability, and local env binding.

### Working from a clone of this repository

Use this path if you already cloned **this** repo (for example to contribute or fork):

```bash
git clone https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs.git
cd agent-quickstart-nextjs
agora login
agora project use <your-project>
pnpm install
agora project env write .env.local
agora project doctor --deep
pnpm dev
```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAgoraIO-Conversational-AI%2Fagent-quickstart-nextjs&project-name=agent-quickstart-nextjs&repository-name=agent-quickstart-nextjs&env=NEXT_PUBLIC_AGORA_APP_ID,NEXT_AGORA_APP_CERTIFICATE&envDescription=Agora%20credentials%20needed%20to%20run%20the%20app&envLink=https%3A%2F%2Fgithub.com%2FAgoraIO-Conversational-AI%2Fagent-quickstart-nextjs%23run-it&demo-title=Agora%20Conversational%20AI%20Next.js%20Quickstart&demo-description=Official%20Next.js%20quickstart%20for%20building%20browser-based%20voice%20AI%20with%20Agora&demo-image=https%3A%2F%2Fraw.githubusercontent.com%2FAgoraIO-Conversational-AI%2Fagent-quickstart-nextjs%2Fmain%2F.github%2Fassets%2FConversation-Ai-Client.gif)

To populate Vercel env vars from your bound Agora project:

```bash
agora project use <your-project>
agora project env write .env.local
rg "^(NEXT_PUBLIC_AGORA_APP_ID|NEXT_AGORA_APP_CERTIFICATE)=" .env.local
```

Copy those two values into Vercel Project Settings → Environment Variables:

| Variable | Type | Environments |
| --- | --- | --- |
| `NEXT_PUBLIC_AGORA_APP_ID` | **Config** | Production + Preview |
| `NEXT_AGORA_APP_CERTIFICATE` | **Secret** | Production + Preview |

Then **redeploy** — Vercel applies environment-variable changes to new deployments only,
and a `NEXT_PUBLIC_*` value is frozen into the browser bundle during the build. A variable
added after the last deploy is therefore readable by the API routes and `undefined` in the
browser, which is exactly the "call never connects, with no error" case. (Type matters too:
`NEXT_PUBLIC_*` values ship to the client regardless of their type, so never put a secret
behind that prefix — the certificate is read server-side only.)

The app no longer hard-depends on the inlined value: the client also accepts the App ID
returned by `GET /api/generate-agora-token`, which the server reads at runtime. Keep the
variable anyway so both sources agree.

### Two things a Vercel deployment needs that local dev does not

1. **A PostgreSQL database (`DATABASE_URL`).** Clients, products, carts and orders
   are rows; the live conversation/case store is mirrored into one JSONB row.
   Vercel runs every route as an independent function instance, so without a
   database a conversation created by `POST /api/conversations` is invisible to
   the next request — the chat answers "Conversation not found" and the dashboard
   stays empty — and the shopping page cannot work at all (`/api/shop/*` answers
   503). **Project → Storage → Create Database → Postgres**, then run
   `pnpm db:push && pnpm seed` against that URL once.
2. **An outbound URL the Agora engine can call back into** for voice tools. This
   is taken from the origin the invite request arrived on, so a Vercel URL or a
   tunnel needs no configuration, and the shared secret is derived from the App
   Certificate when `AGENT_TOOLS_SECRET` is unset.

Then check `https://<your-deployment>/api/health` (safe to open in a browser — it
reports booleans and a masked App ID, never a secret). It says whether the Agora
credentials loaded and *which env names provided them* (`agora.credentialSources`,
including any inert CLI variables that are set), whether the client bundle was built
with the App ID (`agora.publicAppIdInlined`), whether voice tools are wired up, which
LLM the agent is using, and whether state is shared across instances (`store.backend`).
Unless you pass `?deep=0`, it also performs one read-only live round trip to the
Conversational AI control plane and reports it under `agora.convoai` — `ok: true` with
latency and live agent counts is definitive proof the deployment is connected to Agora;
a `401/403` points at the certificate or the Conversational AI feature, `429` at quota,
and a network error at the gateway area:

```bash
curl -s https://<your-deployment>/api/health | jq '{status, agora, tools: .agent.tools, store}'
```

### Environment variables

Defined in [`env.local.example`](env.local.example).

| Variable                     | Required | Notes                                                                                                                                                                   |
| ---------------------------- | :------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_AGORA_APP_ID`   |    ✅    | Agora Console → Project → App ID. Type **Config**, targeted at **Production + Preview**, then **redeploy** — a `NEXT_PUBLIC_*` value is inlined at build time, so an existing deployment keeps the old one. Alias: `AGORA_APP_ID` (server-side only — the browser then gets the App ID at runtime from `/api/generate-agora-token`). |
| `NEXT_AGORA_APP_CERTIFICATE` |    ✅    | Agora Console → Project → App Certificate. **Server-side only.** Alias: `AGORA_APP_CERTIFICATE`.                                                                         |
| `DATABASE_URL`               |    ✅    | PostgreSQL connection string. Holds clients, the 60-product catalogue, carts, orders and the mirrored support store. Without it the shopping page is disabled and conversation state is per-instance (fine for a quick look, broken on Vercel). |
| `NEXAVOICE_STORE`            |    –     | `memory` \| `postgres`. Auto-detected: `postgres` when `DATABASE_URL` exists, otherwise `memory`. |
| `NEXAVOICE_STATE_KEY`        |    –     | Row id of the mirrored support store (default `nexavoice`); override to isolate a test store. |
| `ORDER_PLACED_SECONDS`       |    –     | How long a new order stays **Placed** — and therefore editable — before it goes out for delivery (default `120`). |
| `ORDER_TRANSIT_SECONDS`      |    –     | How long an order stays **On the way** before it is **Delivered** (default `180`). |
| `AGENT_TOOLS_BASE_URL`       |    –     | Override the public **https** URL the Agora engine calls back into (`${URL}/api/agent-tools/*`). Defaults to the request origin, then `VERCEL_URL`. |
| `AGENT_TOOLS_SECRET`         |    –     | Shared secret (≥ 8 chars) the engine sends as `x-nexavoice-tool-token`. Unset → derived from the App Certificate, so tools still work on a fresh deployment. |
| `AGORA_AREA`                 |    –     | Agora REST gateway region: `US` (default), `EU`, `AP` or `CN`. Must match the project's service area (India and other Asia-Pacific projects use `AP`) or the agent starts slowly or not at all. An unrecognised value logs a warning and falls back to `US`. |
| `AGORA_REGION`               |    –     | Fallback for `AGORA_AREA`, using the name the Agora CLI writes: `US`/`EU`/`AP`/`CN` map directly, `global` routes through the US gateway. Takes effect only when `AGORA_AREA` is unset. |
| `AGENT_LANGUAGE`             |    –     | Turn-detection / interaction locale: `en-IN` (default), `hi-IN`, `bn-IN`, `ta-IN`, `te-IN`, `gu-IN`, `kn-IN`, `en-US`.                                                   |
| `AGENT_STT_LANGUAGE`         |    –     | Deepgram language, default `multi` (Hindi/English code-switching).                                                                                                      |
| `AGENT_TTS_VOICE_ID`         |    –     | MiniMax voice id, default `English_captivating_female1`.                                                                                                                |
| `NEXT_LLM_URL` / `NEXT_LLM_API_KEY` | – | OpenAI-compatible LLM. Enables the LLM chat agent and routes the voice agent through `/api/chat/completions` (custom LLM with server-side tools). Without them the chat uses a built-in rule-based agent and the voice agent uses Agora-managed OpenAI. |
| `NEXT_LLM_MODEL`             |    –     | Model for the BYOK LLM (default `gpt-4o-mini`).                                                                                                                         |

Not read by this app (Agora CLI / template metadata — setting them changes nothing here):
`AGORA_PROJECT_ID`, `AGORA_PROJECT_NAME`, `AGORA_ENABLED_FEATURES`, `AGORA_FEATURE_RTC`,
`AGORA_FEATURE_RTM`, `AGORA_FEATURE_CONVOAI`. Enabling Conversational AI is a console
action, not an env var (`agora project doctor --deep` verifies it). `/api/health` lists
any of these it finds set under `agora.credentialSources.inertVarsSet`, next to the names
that actually provided the working credentials.

The agent pipeline in [`lib/agent-config.ts`](lib/agent-config.ts) uses Agora-managed Deepgram STT, OpenAI LLM and MiniMax TTS, so no vendor keys are required. The Conversational AI feature and Agora-managed vendors must be enabled on the Agora project (`agora project doctor --deep`). Without `NEXT_LLM_*`, chat is answered by the deterministic rule-based agent in [`lib/chat-agent.ts`](lib/chat-agent.ts) — it covers the shopping flows (cart add/remove/status, order status → add/remove item → cancel → address → escalation, plus explicit language switches) with fixed copy, so free-form questions get a "what can I do" reply rather than an LLM answer.

### The catalogue and the demo data

The shop is deliberately fixed: **60 products** (electronics, kitchen, grocery,
fashion, beauty, home, sports, stationery, medicine), all priced in rupees, defined
once in [`lib/shop/catalog-data.ts`](lib/shop/catalog-data.ts) and written to the
`Product` table by `pnpm seed`. Every customer — the three demo ones and anybody who
signs up — shops from exactly that list, so an agent tool call can always be matched
to a real product. The 10 medicine products carry a short caution note that is
displayed on their card.

`pnpm seed` is idempotent (products are upserted by SKU) and safe to re-run after a
deploy; it never touches customers, carts or orders. There are no demo orders: the
dashboard fills up when someone actually shops and asks for help, which is also the
only thing it is allowed to show (see below).

### Troubleshooting a deployment

| Symptom | Cause | Fix |
| --- | --- | --- |
| Voice call starts, then nothing; "The AI agent could not join this call" | `invite-agent` error, now surfaced in the banner | Read the message + `/api/health`; run `agora project doctor --deep` |
| Agent never speaks but an `agent_id` came back | Conversational AI not enabled for the App ID | Agora Console → project → All features → **Conversational AI** |
| Call never connects, no error at all | App ID missing from the client bundle (var added or changed after the last build, or targeted only at Development) | Redeploy with `NEXT_PUBLIC_AGORA_APP_ID` targeted at Production/Preview — or rely on the `appId` the token route now serves |
| "Agora doesn't seem connected", but CLI vars (`AGORA_PROJECT_ID`, `AGORA_FEATURE_*`, …) are set in Vercel | Those are CLI/template metadata this app never reads | Set the two names from the table above; check `agora.credentialSources` in `/api/health` to see which names are actually in effect |
| `/api/health` shows `agora.convoai.ok: false` | Live control-plane check failed — the error + hint say which leg (auth / feature / quota / gateway area) | Follow the `hint`; typically fix the certificate, enable Conversational AI, or set `AGORA_AREA` |
| Chat says "Conversation not found" / forgets the customer between turns | No `DATABASE_URL`, so state is per-instance | Add a PostgreSQL database and `pnpm db:push` |
| Shopping page says the shop is unavailable | `DATABASE_URL` missing, or the tables/catalogue were never created | `pnpm db:push && pnpm seed` |
| Agent says an order cannot be changed | It is no longer **Placed** — items are frozen once it is on the way | Expected; raise `ORDER_PLACED_SECONDS` for a longer window |
| Agent talks but never looks up orders | Engine cannot reach `/api/agent-tools/*` | Check `agent.tools` in `/api/health`; needs a public https URL (Vercel URL, ngrok, cloudflared) |
| Chat answers look canned | `NEXT_LLM_*` not set → rule-based agent | Set `NEXT_LLM_URL` / `NEXT_LLM_API_KEY` |
| Dashboard shows nothing while a call is live | State not shared (see above) | Add `DATABASE_URL`; SSE is best-effort — the 3s poll reads the mirror |
| A conversation lingers on the dashboard after the customer left | Nothing — the sweep closes it ~30s after the last heartbeat | Wait for it to disappear, or check the browser tab is really closed |
| `ERR_PNPM_OUTDATED_LOCKFILE` during Vercel build | `package.json` was updated but the lockfile wasn't | Run `pnpm install` locally to synchronize `pnpm-lock.yaml` and push the changes |

## Commands

```bash
# Dev
pnpm dev                # start the Next.js dev server
pnpm dev:db             # zero-install PostgreSQL (PGlite) on 127.0.0.1:5433
pnpm db:push            # create/update the tables from prisma/schema.prisma
pnpm db:reset           # drop and recreate the schema (development only)
pnpm seed               # insert the 50 NexaMart products (.env.local is loaded)
pnpm db:studio          # browse the data

# Quality
pnpm run lint           # eslint
pnpm run typecheck      # tsc --noEmit
pnpm run doctor         # local prereqs + env binding

# CI / pre-ship
pnpm run verify:api     # API contract checks
pnpm run build          # production build
pnpm run verify         # doctor + lint + typecheck + verify:api + build
```

Run `pnpm run verify` before shipping changes — it covers local prerequisites, lint, type safety, the core API route contracts, and the production build.

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./system-architecture-dark.svg">
  <img src="./system-architecture.svg" alt="System architecture">
</picture>

The browser fetches a combined RTC + RTM token (`buildTokenWithRtm`) from this app, joins the channel using a single RTC client, and uses RTM as the data channel for transcript, agent state, metrics, and error events. The Conversational AI Engine joins the same channel as the shared agent UID in [`lib/agora.ts`](lib/agora.ts) and runs the STT → LLM → TTS pipeline in Agora Cloud.

## What You Get

- browser voice client (Next.js App Router) with RTC audio plus RTM transcript/state events
- Agora Conversational AI agent tuned as **Nexa**, a NexaMart shopping-support assistant (Hindi/English/Hinglish)
- a **shopping page**: 60-product catalogue in rupees, cart, checkout, and orders that move `placed → on the way → delivered` on their own
- **controlled backend actions**: read the signed-in customer's orders → add / remove items, change the address, cancel — only after they confirm, only while the order is still *placed*, all rules enforced server-side and audited
- text chat sharing the same tools, conversation state and escalation path
- **human agent dashboard** (SSE + polling) showing only conversations that are still live, an escalation queue, and a handoff summary carrying the customer's profile, their orders and the tail of the transcript
- voice takeover: the human joins the same channel as uid `654321`; the AI announces the handover and leaves
- [`AgentVisualizer`](https://agoraio-conversational-ai.github.io/agent-uikit/), per-stage latency via `AGENT_METRICS`

## How It Works

### Voice (Agora Conversational AI Engine)

1. **Call support** on `/client` opens the agent dock, which requests an RTC + RTM token from `/api/generate-agora-token`.
2. `/api/invite-agent` registers a `VOICE` conversation and starts the agent (`agora-agents` SDK → `POST /v2/projects/{appid}/join`): Deepgram `nova-3` (`multi`), OpenAI `gpt-4o-mini` with the NexaMart system prompt, MiniMax TTS, `turn_detection.language` from `AGENT_LANGUAGE`, `enable_rtm` + `enable_tools`, and **inline REST tools** pointing at `/api/agent-tools/<tool>?conversation_id=…` (authenticated with `AGENT_TOOLS_SECRET` via template variables).
3. The browser joins the channel, publishes mic audio and receives transcript / state / metrics over RTM. It mirrors completed turns and agent state to `PATCH /api/conversations/:id` so the dashboard sees the call live.
4. When the LLM calls a tool, the engine POSTs to this backend; [`lib/support/tools.ts`](lib/support/tools.ts) enforces the guardrails (only the signed-in customer's data, `confirmed: true` for every write, nothing at all after handoff) and [`lib/shop/service.ts`](lib/shop/service.ts) enforces the business rules against PostgreSQL (items and address editable only while the order is *placed*, never empty an order, cancel only before dispatch).
5. `escalate_to_human` (AI tool or the caller's **Talk to a human** button) creates a case with the handoff summary; the dashboard is notified over SSE.
6. A human accepts the case, gets a token for the **same channel** (`/api/cases/:id/accept`) and joins; `/api/cases/:id/takeover` makes the AI say a handover line (`/agents/:id/speak`) and then stops it (`/agents/:id/leave`). Only customer and human remain.
7. On hang-up the client calls `/api/stop-conversation` and the conversation is closed.

If `NEXT_LLM_URL`/`NEXT_LLM_API_KEY` are set, the engine is pointed at this app's `/api/chat/completions` (OpenAI-compatible SSE proxy) which runs the same tools server-side — use this if inline REST tools are not available on your Agora project.

### Chat

`POST /api/conversations` (with the signed-in `clientId`) → `POST /api/conversations/:id/messages`. With an LLM configured, [`lib/chat-agent.ts`](lib/chat-agent.ts) runs `generateText` with the same tool set; otherwise a deterministic EN/HI/Hinglish rule-based agent drives the same `executeTool` layer (cart status/add/remove, order status, add/remove item, address, cancel — each write proposed and confirmed first — language switches via `set_preferred_language`, and human request → escalation). After escalation the AI stays silent and the human replies from the case page.

### State machine

`AI_HANDLING → WAITING_FOR_HUMAN → HUMAN_HANDLING → RESOLVED` (or `CLOSED` when the customer leaves). State is owned by the backend store ([`lib/support/store.ts`](lib/support/store.ts), mirrored to PostgreSQL); the browser never decides it.

**Liveness.** An open chat or call beats `PATCH /api/conversations/:id { heartbeat: true }` every 8 seconds and posts to `/api/conversations/:id/close` (via `sendBeacon`) on unmount, sign-out or `pagehide`. Any conversation whose last heartbeat is older than 30 seconds is swept closed the next time the dashboard is read, so `/support-agent` lists real, ongoing conversations only.

### Order lifecycle

`PLACED → ON_THE_WAY → DELIVERED`, plus `CANCELLED`. Transitions are computed lazily from `placedAt` on every read ([`syncOrderStatuses`](lib/shop/service.ts)), so they need no cron and behave identically on serverless. **Only while an order is `PLACED`** can its items or address change — the customer's own buttons and the agent's tools call the very same service functions, so neither can bypass the rule, and every change is appended to the order's timeline.

## Optional BYOK

The base `.env.local` contract contains only Agora credentials. To bring your own LLM (also used by the chat agent):

```bash
# OpenAI-compatible LLM (enables LLM chat + custom-LLM voice path with server-side tools)
NEXT_LLM_URL=https://api.openai.com/v1/chat/completions
NEXT_LLM_API_KEY=...
NEXT_LLM_MODEL=gpt-4o-mini
```

Other vendors (STT/TTS) can be swapped in [`lib/agent-config.ts`](lib/agent-config.ts) using the `agora-agents` vendor classes.

## Repo Map

- `app/api/generate-agora-token/route.ts` — issues RTC + RTM tokens
- `app/api/invite-agent/route.ts` — registers the VOICE conversation and starts the NexaVoice agent
- `app/api/stop-conversation/route.ts` — stops the agent and closes the conversation
- `app/api/agent-tools/[tool]/route.ts` — REST tool endpoint called by the Agora engine (secret-protected)
- `app/api/chat/completions/route.ts` + `lib/chat-completions.ts` — OpenAI-compatible custom-LLM proxy with server-side tools
- `app/api/conversations/**` — create / read / patch conversations, chat messages (AI turn)
- `app/api/escalation/request/route.ts` — manual "Talk to a human"
- `app/api/cases/**` — list / detail / accept (voice token) / takeover (AI speak + leave) / resolve
- `app/api/dashboard/route.ts`, `app/api/dashboard/events/route.ts` — dashboard snapshot + SSE
- `app/api/shop/**` — catalogue, cart, orders and order edits for the signed-in client (`x-nexavoice-client-id`)
- `lib/agent-config.ts`, `lib/agent-prompt.ts`, `lib/agent-tools.ts` — agent pipeline, system prompt, tool schemas / REST tool wiring
- `lib/agora-server.ts` — server-side Agora client (`stopAgent`, `speakAsAgent`, auth headers)
- `lib/support/{types,store,tools,persist}.ts` — conversation/case model, store + events + heartbeat sweep, guarded `executeTool` + handoff summary, PostgreSQL mirror
- `lib/shop/{catalog-data,service,http}.ts` — the 60 products, the Prisma shop service (catalogue, cart, orders, status machine) and the client-identity helper
- `prisma/schema.prisma`, `scripts/db-push.mjs`, `scripts/seed-catalog.ts`, `scripts/dev-db.mjs` — database schema, offline `db push`, catalogue seed, zero-install PostgreSQL
- `lib/chat-agent.ts` — chat turn (LLM or rule-based)
- `lib/api.ts` — browser API client
- `components/VoiceAgentCall.tsx`, `components/ConversationComponent.tsx` — customer voice call (token, RTM, RTC, transcript sync, escalation)
- `components/ShoppingPage.tsx`, `components/AgentDock.tsx` — the shopping page (catalogue, cart, orders) and the slide-over that hosts chat or the call
- `components/ClientChat.tsx` — customer chat
- `components/SupportDashboard.tsx`, `components/CaseWorkspace.tsx`, `components/HumanVoiceBridge.tsx` — human dashboard, case page, voice takeover
- `scripts/verify-api-contracts.ts` — API + tool-guardrail contract checks (`npm run verify:api`)
- `AGENTS.md` — primary agent-facing guide

## Troubleshooting

- **Agent does not join or transcripts are missing:** run `agora project doctor --deep`.
- **`pnpm run doctor` fails:** run `agora project env write .env.local`, then retry.
- **Manual clone / env values:** `agora project use <your-project>` then `agora project env write .env.local`.
- **RTM login fails:** keep [`app/api/generate-agora-token/route.ts`](app/api/generate-agora-token/route.ts) on `RtcTokenBuilder.buildTokenWithRtm` — RTC-only tokens will not satisfy `rtm.login`.
- **Transcript speakers inverted:** check the `uid === "0"` remap in [`components/ConversationComponent.tsx`](components/ConversationComponent.tsx).
- **Agent never appears in channel:** ensure the shared agent UID in [`lib/agora.ts`](lib/agora.ts) is used by both the client and invite route.
- **Agent talks but never looks up orders:** set `AGENT_TOOLS_BASE_URL` (public https) and `AGENT_TOOLS_SECRET`; check the server log line `[invite-agent] Backend tools disabled`. On localhost use a tunnel (ngrok/cloudflared) for `AGENT_TOOLS_BASE_URL`.
- **`/join` rejects `llm.tools`:** your project may not have inline REST tools enabled — set `NEXT_LLM_URL`/`NEXT_LLM_API_KEY` so the engine uses `/api/chat/completions`, which runs the tools server-side.
- **Human joins but the AI keeps talking:** `/api/cases/:id/takeover` needs the conversation's `agentId`; check the server log for `[takeover]` errors and that the Agora REST region (`AGORA_AREA`) matches your project.

## More Docs

- [docs/ai/L0_repo_card.md](./docs/ai/L0_repo_card.md)
- [docs/ai/RECIPE.md](./docs/ai/RECIPE.md)
- [AGENTS.md](./AGENTS.md)

## Contributing

Pull requests welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and conventions.

## Security

Please do **not** open public issues for security reports. Email security@agora.io with details and reproduction steps.

## License

Released under the [MIT License](./LICENSE).
