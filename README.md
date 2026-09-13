# NexaVoice

[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange)](https://pnpm.io/)
[![Agora](https://img.shields.io/badge/Agora-Conversational%20AI-blue)](https://www.agora.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma%207-336791)](https://www.postgresql.org/)

> **NexaVoice** is an AI-first customer-support platform for the NexaMart demo store, built around a shared AI support agent that works over **text chat and real-time voice** and can hand conversations to a human support agent without losing context.

The project combines **Next.js 16, React 19, Agora Conversational AI, Agora RTC/RTM, OpenAI, Deepgram, MiniMax TTS, Prisma 7 and PostgreSQL** into one customer-support workflow.

---

## What makes NexaVoice different

NexaVoice is designed as a **customer-service agent, not just a chat UI**. The same support model, tool layer, conversation state and escalation workflow are shared between chat and voice.

### Core capabilities

- **Text + voice support from the same customer experience**
  - Chat mode uses the shared Nexa support logic and tool layer.
  - Voice mode uses **Agora Conversational AI Engine** over Agora RTC/RTM.
  - Customers can move from AI support to human support without restarting the case.

- **Intent-aware support workflow**
  - Conversation state stores the active `intent`, language, order references, confidence, collected information and missing information.
  - Escalation captures an intent such as `order_edit`, `cancellation`, `delivery_delay`, `payment_issue`, `complaint`, or `other`.
  - Handoff data is preserved so the human can continue with the existing context.

- **Context-rich human handoff**
  - The handoff summary can contain client identity/profile, intent, issue summary, collected information, actions already taken, escalation reason, confidence, missing information, live order information and a transcript excerpt.
  - This is designed to prevent the customer from having to repeat the full issue to the human agent.

- **Real human takeover for voice**
  - A human agent accepts the case and receives a token for the **same Agora channel**.
  - The AI speaks a handover announcement, waits briefly for the announcement to play, then stops.
  - The conversation transitions to `HUMAN_HANDLING` while the customer and human remain on the voice session.

- **Critical-topic guardrails (voice and chat)**
  - Medical: the agent never recommends which medicine to take, compares medicines or suggests dosages — it refuses and directs the customer to a doctor; emergencies are pointed at 112/108 (India). Buying a specifically named medicine stays allowed.
  - Self-harm or abuse: the agent stays calm, shares India's emergency numbers (112, Tele-MANAS 14416) and escalates to a human immediately with intent `safety`.
  - Money: the agent never asks for card numbers, CVVs, OTPs, UPI PINs or passwords, and never promises refunds or timelines — fraud/dispute cases escalate with `payment_issue`.
  - Safety and medical escalations are automatically flagged HIGH priority in the human queue (`isCriticalHandoff` in `lib/support/store.ts`).

- **Server-side action guardrails**
  - Read-only actions can inspect customer, cart and order state.
  - Mutating actions require `confirmed: true`.
  - The shared backend tool layer enforces the confirmation rule independently of the LLM prompt.
  - Order changes and cancellation are only allowed while an order is `PLACED`.
  - The model does not choose an arbitrary customer ID; tool execution is scoped to the signed-in customer attached to the conversation.
  - Tool calls are recorded in an audit trail.

- **Multilingual conversational support**
  - Customer support is designed for **English, Hindi and Hinglish**.
  - Voice turn detection supports Indian locales and Deepgram multilingual transcription.
  - The customer's language choice can be stored on the account.

- **Live voice telemetry**
  - Agora RTM delivers transcript updates, agent state and `AGENT_METRICS` events to the browser.
  - The client uses the Agora Agent Client Toolkit for transcript, state and metrics, with a purpose-built call dialog (orb, transcript, mute/unmute, human escalation).
  - RTC/RTM failures are surfaced through connection diagnostics.

- **Deployment-aware backend state**
  - Conversation/case state is backend-owned.
  - With `DATABASE_URL`, the support store is mirrored into PostgreSQL as a durable JSONB document so serverless instances can share conversations and cases.
  - Heartbeats and stale-session cleanup prevent abandoned sessions from remaining live on the dashboard.

- **Operational diagnostics**
  - `/api/health` performs an Agora Conversational AI control-plane self-check.
  - `pnpm doctor` validates environment/configuration.
  - Voice startup failures include actionable error hints.

---

## Architecture

```text
                          ┌──────────────────────┐
                          │      NexaMart UI     │
                          │  Next.js / React     │
                          └──────────┬───────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
             Text / Chat                         Voice Call
                    │                                 │
                    ▼                                 ▼
          Shared Nexa Agent Logic             Agora RTC + RTM
                    │                                 │
                    └────────────────┬────────────────┘
                                     ▼
                         Shared Conversation State
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
               Tool Layer      Audit / Events   Human Escalation
                    │                                 │
                    ▼                                 ▼
              PostgreSQL /                  Same Agora channel
              Prisma 7                         for takeover
```

### Voice pipeline

```text
Customer microphone
      │
      ▼
Agora RTC
      │
      ▼
Agora Conversational AI Engine
      │
      ├── Deepgram STT (nova-3, multilingual)
      │
      ├── OpenAI LLM (gpt-4o-mini by default)
      │      │
      │      └── Inline REST tools → NexaVoice backend
      │
      └── MiniMax TTS (speech_2_6_turbo)
      │
      ▼
Agora RTC audio back to customer

Agora RTM → transcript + agent state + metrics → browser
```

---

## Conversation lifecycle

```text
AI_HANDLING
    │
    ├── customer resolved
    │
    └── escalation requested
             │
             ▼
     WAITING_FOR_HUMAN
             │
             ▼
      HUMAN_HANDLING
             │
        ┌────┴────┐
        ▼         ▼
     RESOLVED   customer leaves
                  │
                  ▼
                CLOSED
```

The backend also records events such as conversation creation, agent startup/shutdown, tool calls, escalation requests, case acceptance, human join/leave, resolution and closure.

---

## AI agent behavior and safety boundaries

The system prompt in `lib/agent-prompt.ts` is shared by the voice and chat paths so the interfaces follow the same operational rules.

### Customer identity and data access

The agent operates on the signed-in customer's context. The shared tool executor resolves the customer through the conversation rather than allowing the model to provide an arbitrary customer ID.

### Confirmation before writes

Mutating actions follow this sequence:

```text
1. Read current state
2. Preview the exact change
3. Tell the customer what will change
4. Ask for explicit yes/no confirmation
5. Execute only with confirmed=true
6. Report the result
```

The backend tool executor also enforces `confirmed`, so prompt behavior is not the only protection.

### Order lifecycle restriction

Orders move through:

```text
PLACED → ON_THE_WAY → DELIVERED
```

Order items, delivery address and cancellation are only editable while the order is still `PLACED`. The shared shop/service layer enforces the rule for both UI and agent operations.

While the customer is actively editing a `PLACED` order ("Change items" on the shopping page), the automatic status timer is **paused** so the order cannot move to `ON_THE_WAY` mid-edit. The pause is stored on the order (`pausedSince`), resumed when the customer finishes (with a fresh countdown), and auto-expires server-side if the "done" signal is ever lost.

### NexaCash wallet

Every client has a database-backed NexaCash wallet (`Client.walletBalanceInr` plus a `WalletTransaction` ledger):

- New clients receive a ₹500 welcome gift; the wallet dropdown shows the live balance and ledger.
- **Add money** tops the wallet up through `POST /api/shop/wallet`.
- Choosing **NexaCash** at checkout deducts the order total the moment the order is placed.
- Editing a wallet-paid order while it is `PLACED` charges or refunds the difference atomically — an edit the balance cannot cover is refused and rolled back.
- Cancelling a wallet-paid order refunds the full amount straight back to the wallet.

### Medical boundary

NexaVoice deliberately does **not** act as a medical adviser. Symptom-based requests for medicines or medical recommendations are refused and redirected to a doctor. This is a safety boundary in the Nexa system prompt, not clinical decision support.

> **Demo disclaimer:** NexaVoice is a customer-support demo/reference implementation. It should not be treated as a medical device or deployed with real clinical workflows without appropriate safety, privacy, compliance and medical review.

---

## Human escalation and handoff

Escalation is a first-class support workflow rather than simply redirecting the user to a different page.

### Escalation triggers

The agent is instructed to escalate when the customer:

- explicitly asks for a human/person/agent
- is upset or reports fraud/legal escalation
- experiences repeated failures
- requests something outside the available tool capabilities
- remains unclear after repeated clarification attempts

### Handoff package

The `HandoffSummary` model is designed around the information a human needs to take over immediately. It includes fields for:

- client profile
- intent
- summary
- information collected
- actions taken
- reason for escalation
- confidence
- missing information
- live orders and their status
- recent transcript turns

### Voice takeover sequence

```text
Customer + AI in Agora channel
          │
          ▼
Human accepts support case
          │
          ▼
Human joins SAME Agora channel
          │
          ▼
AI speaks handover announcement
          │
          ▼
AI stops/leaves
          │
          ▼
Customer + human continue
```

The implementation is in `app/api/cases/[id]/accept/route.ts` and `app/api/cases/[id]/takeover/route.ts`.

---

## Agora Conversational AI integration — important code locations

These are the files to inspect first when evaluating the Agora implementation.

### Server side

| File | What it implements |
| --- | --- |
| [`lib/agent-config.ts`](./lib/agent-config.ts) | Creates the `agora-agents` Conversational AI agent; configures turn detection, RTM, metrics, Deepgram STT, OpenAI LLM, MiniMax TTS and inline REST tools. |
| [`lib/agora-server.ts`](./lib/agora-server.ts) | Agora credentials/client setup plus control-plane operations such as agent stop/speak and health probing. |
| [`lib/agent-tools.ts`](./lib/agent-tools.ts) | Builds Agora `properties.llm.tools[]` inline REST definitions, injects per-session template variables and resolves public tool access. |
| [`app/api/invite-agent/route.ts`](./app/api/invite-agent/route.ts) | Starts the Agora agent with `agent.createSession(...).start()`, binds it to the caller's channel and registers the conversation. |
| [`app/api/generate-agora-token/route.ts`](./app/api/generate-agora-token/route.ts) | Creates combined RTC + RTM tokens using `RtcTokenBuilder.buildTokenWithRtm`. |
| [`app/api/agent-tools/[tool]/route.ts`](./app/api/agent-tools/%5Btool%5D/route.ts) | Receives Agora inline REST tool calls, verifies the server-side tool token and dispatches to `executeTool()`. |
| [`app/api/cases/[id]/accept/route.ts`](./app/api/cases/%5Bid%5D/accept/route.ts) | Accepts a human case and, for voice, returns credentials for the same Agora channel. |
| [`app/api/cases/[id]/takeover/route.ts`](./app/api/cases/%5Bid%5D/takeover/route.ts) | Speaks the handover line, stops the AI and changes the conversation to `HUMAN_HANDLING`. |

### Browser side

| File | What it implements |
| --- | --- |
| [`components/VoiceAgentCall.tsx`](./components/VoiceAgentCall.tsx) | Voice-call startup, token request, `/api/invite-agent`, RTM setup, token renewal and heartbeat lifecycle. |
| [`components/AgoraProvider.tsx`](./components/AgoraProvider.tsx) | Agora RTC client provider for React. |
| [`components/HumanVoiceBridge.tsx`](./components/HumanVoiceBridge.tsx) | Human support agent joining the same Agora RTC channel during takeover. |
| [`components/ConversationComponent.tsx`](./components/ConversationComponent.tsx) | The live voice call dialog: orb + status, transcript, mute/unmute, latency pill, human escalation. |
| [`components/HandoffBanner.tsx`](./components/HandoffBanner.tsx) | Shows the AI-to-human transition in the UI. |

See [`Docs/agora-conversational-ai.md`](./Docs/agora-conversational-ai.md) for the deeper project-specific integration notes.

---

## Shared agent tool layer

`lib/support/tools.ts` is the central action layer shared across voice and chat.

The same `executeTool()` path supports:

- Agora Conversational AI voice sessions through inline REST tools
- custom-LLM/chat execution
- rule-based fallback behavior

Important tools include:

```text
get_customer_context
search_products
get_cart_status
list_recent_orders
get_order_status
add_item_to_cart
remove_item_from_cart
set_cart_item_quantity
replace_cart_item
clear_cart
place_order
add_item_to_order
remove_item_from_order
replace_item_in_order
cancel_order
update_shipping_address
set_preferred_language
escalate_to_human
```

The key design point is that **business rules are enforced below the UI and below the LLM prompt**.

---

## Multi-store shopping engine (Amazon India & Flipkart)

NexaVoice can check **live marketplace prices** in the middle of a conversation — "Find me the Sony WH-1000XM5 and compare prices" searches both stores, matches the offers variant-safely, and the agent speaks the cheapest option while the on-screen panel shows the links.

### Environment variables

```bash
RETAIL_INTEL_PROXY=               # optional scraper proxy, e.g. http://user:pass@host:8000
RETAIL_INTEL_PROXY_HEADER=        # e.g. "Authorization: Bearer X" — preferred over embedding secrets in the URL
RETAIL_INTEL_TIMEOUT_MS=9000      # per-store fetch budget; the voice tool layer times out at 15 s
RETAIL_INTEL_STORES=amazon,flipkart   # narrow the default store set (optional)
SHOPPING_TOOLS_ENABLED=true       # "false" hides the four marketplace tools entirely
```

All of these are **server-side only** — the browser never reaches the stores and never sees a credential.

### Agent tools

| Tool | Purpose | When the agent uses it |
|---|---|---|
| `search_online_stores` | Live search on Amazon India + Flipkart | "how much is a Samsung Galaxy S24 online", "any deals on keurig?" |
| `compare_store_prices` | Same product across stores, cheapest first | "compare X on Amazon and Flipkart", "which store is cheaper?" |
| `get_online_product_details` | Full details of ONE product page (price, MRP, rating, specs) | "tell me more about the Flipkart one" |
| `find_cheaper_alternatives` | (a) SAME product cheaper elsewhere, (b) cheaper different-brand alternatives — clearly separated | "is this cheaper anywhere?" |

These are **read-only**. NexaMart never claims to stock marketplace items and never adds them to the cart — the comparison panel's *View Product* links open the store pages.

### Architecture

```text
lib/shopping/
  types.ts                      NormalizedProduct schema + UI payloads (one shape for every store)
  http.ts                       fetch with timeout/retries, bot-check detection, RETAIL_INTEL_PROXY routing
  normalize/                    Amazon/Flipkart titled prices, ratings, INR, availability → Product
  matching/productMatcher.ts   identity extraction (brand/model/storage/RAM/size/colour/generation) + constrained scoring
  compare.ts                    same-product grouping, cheapest-first, alternatives split (SAME vs ALTERNATIVE)
  providers/                    one file per store (search + product page → NormalizedProduct), registry
  service.ts                    orchestration: concurrent stores, per-store failure isolation, report types
lib/support/shopping-tools.ts   agent-tool glue: writes conversation.context.shopping for the UI
components/ShoppingComparisonPanel.tsx   the on-screen panel (loading → results → "You save ₹X")
mcp-server/shopping/server.js   the same engine as a standalone stdio MCP server (5 tools)
```

**Matching safety** (the spec's hard requirement): the matcher explicitly names variants — storage (128 GB ≠ 256 GB), RAM (8 GB ≠ 12 GB), generation (AirPods Pro 1st vs 2nd gen), screen size, colour, model number (S24 ≠ S24 Ultra), bundles and quantities. `iPhone 15 128GB` and `iPhone 15 256GB` never merge into one comparison row; instead they appear as separate products with the variant spelled out.

**Failure behaviour**: stores answer concurrently and each failure is typed (`STORE_BLOCKED`, `STORE_TIMEOUT`, `STORE_UNAVAILABLE`, `STORE_RATE_LIMITED`, `NO_RESULTS`). One store failing degrades the result to *partial* — the agent says which side is missing — and both failing produces an honest "I couldn't reach the stores right now," never a memorised price.

### Testing (deterministic, no live network)

```bash
# 60 tests: normalization, matching (20 cases), comparison, providers (recorded
# store pages), service failure matrix, MCP server smoke test over real stdio
node --import tsx --test tests/shopping/*.test.ts
```

The stores' live pages are NOT hit in tests — recorded page fragments in `tests/shopping/fixtures.ts` pin the parsers, and an injected fetcher pins the failure matrix. The MCP server can be pinned the same way for demos:

```bash
RETAIL_INTEL_FIXTURE_FILE=/path/to/fixtures.json node --import tsx mcp-server/shopping/server.js
```

(The sandbox used for development blocks direct egress to amazon.in / flipkart.com — that is expected; the engine treats those failures exactly like "store unreachable" and the tests verify it.)

---

## Data model

The Prisma schema contains the core shop and support entities:

```text
Client
 ├── CartItem[]
 └── Order[]
       └── OrderItem[]

Agent

Product

StoreState
 └── durable JSON snapshot of support conversations/cases/events
```

See [`prisma/schema.prisma`](./prisma/schema.prisma).

With `DATABASE_URL` configured, the current support store uses its synchronous in-memory representation and mirrors the support snapshot into the PostgreSQL `StoreState` row. This is the mechanism used to share support state between serverless instances.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 App Router, React 19, Tailwind CSS, Radix/shadcn-style UI |
| Conversational AI | **Agora Conversational AI Engine** via `agora-agents` |
| Voice transport | Agora RTC + RTM |
| Voice STT | Deepgram `nova-3` |
| LLM | OpenAI `gpt-4o-mini` by default; optional OpenAI-compatible custom endpoint |
| TTS | MiniMax `speech_2_6_turbo` |
| Browser voice tooling | `agora-agent-client-toolkit`, `agora-rtc-react` |
| Backend | Next.js API routes / TypeScript |
| Database | PostgreSQL + Prisma 7 |
| Local database | PGlite/WASM helper via `pnpm dev:db` |
| Package manager | pnpm 10 |
| Deployment target | Vercel-friendly Next.js application |

---

## Run locally

### Prerequisites

- Node.js **22+** (`.nvmrc` is included)
- pnpm **10**
- An Agora project with App ID + App Certificate and **Conversational AI enabled**
- PostgreSQL, or use the included PGlite database helper

### 1. Clone

```bash
git clone https://github.com/vrma8/djikstra-NexaVoice.git
cd djikstra-NexaVoice
```

### 2. Install dependencies

```bash
pnpm install
```

The repository runs `prisma generate` automatically via `postinstall`.

### 3. Create `.env.local`

macOS/Linux/Git Bash:

```bash
cp env.local.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item env.local.example .env.local
```

At minimum for voice, set:

```env
NEXT_PUBLIC_AGORA_APP_ID=YOUR_AGORA_APP_ID
NEXT_AGORA_APP_CERTIFICATE=YOUR_AGORA_APP_CERTIFICATE
```

For the included local database helper:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
```

Optional agent configuration:

```env
AGENT_LANGUAGE=en-IN
AGENT_STT_LANGUAGE=multi
AGENT_TTS_VOICE_ID=English_captivating_female1
```

For full voice + backend-tool callbacks, a public HTTPS URL is required:

```env
AGENT_TOOLS_BASE_URL=https://your-public-deployment.example.com
AGENT_TOOLS_SECRET=your-secret
```

The tool secret can also be derived from the Agora App Certificate when the explicit secret is omitted.

### 4. Start the local database

Terminal 1:

```bash
pnpm dev:db
```

This launches the included PGlite/WASM PostgreSQL-compatible server at `127.0.0.1:5433`.

### 5. Create schema and seed data

Terminal 2:

```bash
pnpm db:push
pnpm seed
```

### 6. Start NexaVoice

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

### 7. Verify

Health check:

```text
http://localhost:3000/api/health
```

CLI checks:

```bash
pnpm doctor
pnpm lint
pnpm typecheck
pnpm verify:api
pnpm build
```

Or run everything:

```bash
pnpm verify
```

---

## Deploy to Vercel

The app is a standard Next.js 16 project and needs **no build-time environment variables**: every integration degrades gracefully and reports itself at `/api/health`. Full voice + database functionality only needs the variables below.

### 1. Create the Vercel project

1. Push the repo to GitHub. The committed `pnpm-lock.yaml`, `.nvmrc` (Node 24) and `packageManager` field mean Vercel's detected defaults — Next.js framework, pnpm via corepack, Node runtime — are already correct. (Node 22 also works; `engines` allows `>=22`.)
2. On Vercel: **Add New → Project → Import** the repository. Vercel auto-detects Next.js; `vercel.json` pins `pnpm install --frozen-lockfile` and `pnpm build`, and `postinstall` runs `prisma generate` during install. Leave the build settings as they are and deploy.

### 2. Provision PostgreSQL

Create a PostgreSQL database — Vercel Postgres (Storage tab), Neon or Supabase all work — and copy the connection string (keep `?sslmode=require`).

### 3. Set environment variables

In **Vercel → Project → Settings → Environment Variables**, add these for **Production and Preview**:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_AGORA_APP_ID` | Agora Console → project → App ID (exactly 32 characters) |
| `NEXT_AGORA_APP_CERTIFICATE` | Agora Console → project → App Certificate (server-only secret) |
| `AGORA_AREA` | `US` \| `EU` \| `AP` \| `CN` — must match the Agora project's region (India → `AP`); a mismatch makes calls fail to start |
| `DATABASE_URL` | PostgreSQL connection string from step 2 |

Optional: `AGENT_TOOLS_BASE_URL` (fixed public URL for Agora's tool callbacks — by default it is derived from each incoming request, which is usually what you want on Vercel), `AGENT_TOOLS_SECRET`, `AGENT_LANGUAGE`, `AGENT_STT_LANGUAGE`, `AGENT_TTS_VOICE_ID`, and `NEXT_LLM_URL` / `NEXT_LLM_API_KEY` / `NEXT_LLM_MODEL` for a custom LLM.

> `NEXT_PUBLIC_*` values are inlined into the browser bundle at **build** time — after changing one, redeploy (Deployments → ⋯ → Redeploy). A missing inline is the #1 "server works but voice never connects" cause; `/api/health` reports `publicAppIdInlined` for exactly this reason, and a wrong-length App ID is reported as `degraded` with `agora.appIdShapeError`.

### 4. Bootstrap the database (once, from your machine)

```bash
DATABASE_URL="postgres://…?sslmode=require" pnpm db:push
DATABASE_URL="postgres://…?sslmode=require" pnpm seed
```

`db:push` creates the schema, `seed` loads the 60-product NexaMart catalogue. Without `DATABASE_URL` the deployment runs in-memory only — fine for a quick look, but state resets per serverless instance.

### 5. Verify the deployment

Open:

```text
https://<your-deployment>.vercel.app/api/health
```

`status: "ok"` with `agora.appIdConfigured: true` and `store.backend: "postgres"` means voice, database and tool callbacks are all wired up. The route also performs one live, read-only round trip to the Conversational AI control plane, so a wrong `AGORA_AREA` or a project without Conversational AI enabled shows up here as `degraded` — instead of as a call that never connects.

Notes:

- Pick the Vercel function region closest to your users (e.g. `bom1` Mumbai for India). It does not need to match `AGORA_AREA`, which selects the Agora gateway region of the project.
- API routes declare `maxDuration` of 30–60 s, within Hobby-plan limits; the SSE stream self-closes after 5 minutes and the browser reconnects.

---

## Demo workflow

### Customer

```text
http://localhost:3000/login?role=client
```

Use the demo login, shop normally, place an order, then open the support dock.

Example requests:

```text
What is my order status?
Add one more headphones to my order.
Cancel my order.
Mujhe Hindi mein baat karni hai.
Talk to a human.
```

### Human support agent

Open a second browser/session:

```text
http://localhost:3000/login?role=agent
```

The support dashboard shows active cases and the handoff context. For a voice case, accepting the case provides same-channel Agora credentials; takeover then stops the AI after the handoff line.

---

## Local voice limitation

The browser can connect to Agora from a local development URL, but **Agora Cloud cannot reach `http://localhost` for the backend inline REST tools**.

Therefore:

- Local text chat can exercise backend tools directly.
- Local voice can run as a conversational agent, but backend voice tool callbacks need a publicly reachable HTTPS URL.
- For full voice + backend-tool functionality, use Vercel or an HTTPS tunnel such as ngrok/Cloudflare Tunnel and configure `AGENT_TOOLS_BASE_URL` when needed.

---

## Configuration reference

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_AGORA_APP_ID` / `AGORA_APP_ID` | Voice | Agora App ID |
| `NEXT_AGORA_APP_CERTIFICATE` / `AGORA_APP_CERTIFICATE` | Voice | Server-side Agora App Certificate |
| `AGORA_AREA` / `AGORA_REGION` | Optional | Conversational AI gateway area (`US`, `EU`, `AP`, `CN`) |
| `DATABASE_URL` | Recommended | PostgreSQL connection for shop/support persistence |
| `NEXAVOICE_STORE` | Optional | Force `memory`/`none` or `postgres` support store |
| `NEXAVOICE_STATE_KEY` | Optional | PostgreSQL `StoreState` row key |
| `AGENT_TOOLS_BASE_URL` | Optional | Public HTTPS URL used by Agora cloud callbacks |
| `AGENT_TOOLS_SECRET` | Optional | Shared secret for tool callback authentication |
| `AGENT_LANGUAGE` | Optional | Voice interaction locale such as `en-IN` or `hi-IN` |
| `AGENT_STT_LANGUAGE` | Optional | Deepgram language; `multi` supports Hindi/English code-switching |
| `AGENT_TTS_VOICE_ID` | Optional | MiniMax voice ID |
| `NEXT_LLM_URL` | Optional | OpenAI-compatible custom endpoint |
| `NEXT_LLM_API_KEY` | Optional | API key for custom LLM endpoint |
| `NEXT_LLM_MODEL` | Optional | Custom LLM model; default `gpt-4o-mini` |
| `ORDER_PLACED_SECONDS` | Optional | Demo `PLACED` timing |
| `ORDER_TRANSIT_SECONDS` | Optional | Demo `ON_THE_WAY` timing |
| `ORDER_EDIT_SECONDS` | Optional | Demo timing after order edits |
| `ORDER_EDIT_PAUSE_MAX_SECONDS` | Optional | Max time an edit pause is held before the server resumes the order |

See [`env.local.example`](./env.local.example) for the full configuration notes.

---

## Important API routes

| Route | Purpose |
| --- | --- |
| `GET /api/generate-agora-token` | Generate RTC + RTM token data |
| `POST /api/invite-agent` | Start an Agora Conversational AI session |
| `POST /api/agent-tools/:tool` | Agora inline REST tool callback |
| `POST /api/stop-conversation` | Stop the active AI conversation |
| `GET /api/cases` | List support cases |
| `POST /api/cases/:id/accept` | Accept a human support case |
| `POST /api/cases/:id/takeover` | Perform AI → human voice takeover |
| `POST /api/chat/completions` | OpenAI-compatible chat path with shared tools |
| `GET /api/health` | App + Agora deployment self-check |

---

## Project structure

```text
app/
  api/
    agent-tools/              Agora inline REST tool callbacks
    cases/                    Human escalation / accept / takeover / resolution
    chat/                     Text chat + custom LLM endpoint
    generate-agora-token/     RTC + RTM token generation
    invite-agent/             Agora Conversational AI session startup
    health/                   Deployment self-check
    stop-conversation/        AI session shutdown

components/
  AgoraProvider.tsx           Agora RTC React provider
  VoiceAgentCall.tsx          Voice call orchestration
  ConversationComponent.tsx   Voice call dialog: orb, transcript, mute, escalation
  HumanVoiceBridge.tsx        Human takeover RTC bridge
  ...

lib/
  agent-config.ts             Agora agent construction
  agent-prompt.ts             Shared agent policy/language/safety rules
  agent-tools.ts              Agora tool declaration + callback routing
  agora-server.ts             Agora server-side control-plane helpers
  conversation.ts              Transcript normalization + agent state mapping
  support/
    tools.ts                  Shared tool execution + guardrails
    store.ts                  Conversation/case state + audit/event recording
    types.ts                  Conversation + handoff data model
    persist.ts                PostgreSQL durable mirror
    ...
  shop/                      Catalogue, cart and order business logic

prisma/
  schema.prisma               PostgreSQL/Prisma data model

Docs/
  agora-conversational-ai.md  Agora integration deep dive
```

---

## Implementation details worth reviewing

### Conversation ID and authorization boundary

Agora tool URLs carry the conversation ID through per-session `template_variables`. The model does not choose the customer or conversation context used for execution.

### Tool authentication

The Agora callback endpoint expects a server-side tool token. `lib/agent-tools.ts` can derive a stable secret from the Agora App Certificate when an explicit `AGENT_TOOLS_SECRET` is not configured. `app/api/agent-tools/[tool]/route.ts` verifies the token with a timing-safe comparison before executing a tool.

### RTC vs RTM

RTC transports the live audio. RTM is used for the transcript/state signaling consumed by the browser, including `AGENT_METRICS` events.

### Stale conversation cleanup

The client sends heartbeats while a support session is active. The support store closes sessions that stop heartbeating, which keeps the agent dashboard aligned with real client presence.

---

## Security and privacy

- Never commit the Agora App Certificate.
- Keep `AGENT_TOOLS_SECRET` server-side.
- Keep `.env.local` out of Git.
- Customer/order tool access is conversation-scoped.
- Tool audit entries are sanitized and do not intentionally store secrets.

For real production customer or medical workflows, add production-grade authentication/authorization, secret management, privacy controls, compliance, durable concurrency/locking where required, rate limiting, monitoring and appropriate medical/legal review.

---

## Development commands

```bash
pnpm dev             # Next.js development server
pnpm dev:db          # Local PGlite/WASM PostgreSQL-compatible server
pnpm db:push         # Push Prisma schema
pnpm db:reset        # Reset schema (development only)
pnpm seed            # Seed demo catalogue
pnpm db:studio       # Open Prisma Studio
pnpm doctor          # Environment/configuration diagnostics
pnpm lint            # ESLint
pnpm typecheck       # TypeScript check
pnpm verify:api      # API contract checks
pnpm build           # Production build
pnpm verify          # Full verification suite
```

---

## License

See [`LICENSE`](./LICENSE).
