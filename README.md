# NexaVoice — Multilingual AI Support for NexaMart (Agora Conversational AI)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)

NexaVoice is a web-first customer-support system for **NexaMart**, a demo Indian online shopping service. Customers talk to an AI agent by **voice** (Agora Conversational AI Engine: STT → LLM → TTS in Agora Cloud) or by **chat**, in **Hindi, English or Hinglish**. The agent looks up and — only with explicit confirmation — changes orders in a demo backend, and escalates to a **human agent dashboard** that shows live calls/chats and receives a handoff summary with customer details. For voice, the human joins the *same* Agora channel and the AI hands over and leaves.

Built on the Agora Next.js quickstart (voice visualizer via [Agent UIKit](https://agoraio-conversational-ai.github.io/agent-uikit/), transcripts + `AGENT_METRICS` via [Agent Toolkit](https://github.com/AgoraIO-Conversational-AI/agent-client-toolkit-ts)). Product spec: [`Nexavoice Docs/v1.md`](./Nexavoice%20Docs/v1.md).

## Routes

| Route                        | Who      | What                                                                                     |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `/`                          | —        | Landing: customer vs. support agent                                                      |
| `/client`                    | Customer | Choose chat or voice                                                                     |
| `/client/chat`               | Customer | Text chat with the AI; "Talk to a human" button; human agent replies land in the same chat |
| `/client/voice`              | Customer | Voice call with the Agora agent; live transcript; "Talk to a human"; human takeover banner |
| `/support-agent`             | Human    | Live dashboard: ongoing calls/chats, escalation queue, handoff summary + customer details  |
| `/support-agent/cases/[id]`  | Human    | Case workspace: transcript, join the customer's call (AI leaves), chat reply, resolve      |

Demo customers (verify by mobile number): **9876543210** Rahul Sharma (Delhi), **9123456780** Priya Nair (Bengaluru), **9988776655** Amit Verma (Lucknow). Data lives in memory ([`lib/shop/data.ts`](lib/shop/data.ts)) and resets on server restart.

## Prerequisites

- [Node.js 22+](https://nodejs.org/en/download/)
- [pnpm](https://pnpm.io/installation)
- [Agora CLI](https://github.com/AgoraIO-Community/cli)

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

3. Open [http://localhost:3000](http://localhost:3000) and click **Start conversation**.

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

Copy those two values into Vercel Project Settings → Environment Variables. Mark
`NEXT_PUBLIC_AGORA_APP_ID` for **both** Build and Runtime environments — the browser
bundle reads it at build time, while the API routes read it at runtime. (The app now
also serves the App ID from `GET /api/generate-agora-token`, so a Runtime-only value
still lets voice calls connect.)

### Two things a Vercel deployment needs that local dev does not

1. **Shared conversation state.** `lib/support/store.ts` is a per-process memory
   cache. Vercel runs every route as an independent function instance, so a
   conversation created by `POST /api/conversations` is invisible to the next
   request — the chat answers "Conversation not found", forgets the verified
   customer, and the dashboard stays empty. Create a store so state is mirrored:
   **Project → Storage → Create Database → Blob**. `BLOB_READ_WRITE_TOKEN` is
   injected automatically and the app detects it; no other setting is needed.
   (`NEXAVOICE_STORE=file` covers a single Docker container instead.)
2. **An outbound URL the Agora engine can call back into** for voice tools. This
   is taken from the origin the invite request arrived on, so a Vercel URL or a
   tunnel needs no configuration, and the shared secret is derived from the App
   Certificate when `AGENT_TOOLS_SECRET` is unset.

Then check `https://<your-deployment>/api/health` (safe to open in a browser — it
reports booleans and a masked App ID, never a secret). It says whether the Agora
credentials loaded, whether the client bundle was built with the App ID
(`agora.publicAppIdInlined`), whether voice tools are wired up, which LLM the agent is
using, and whether state is shared across instances (`store.backend`):

```bash
curl -s https://<your-deployment>/api/health | jq '{status, agora, tools: .agent.tools, store}'
```

### Environment variables

Defined in [`env.local.example`](env.local.example).

| Variable                     | Required | Notes                                                                                                                                                                   |
| ---------------------------- | :------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_AGORA_APP_ID`   |    ✅    | Agora Console → Project → App ID. Needs the **Build** environment enabled, not just Runtime.                                                                           |
| `NEXT_AGORA_APP_CERTIFICATE` |    ✅    | Agora Console → Project → App Certificate. **Server-side only.**                                                                                                        |
| `BLOB_READ_WRITE_TOKEN`      | serverless state | Set automatically by a Vercel Blob store. Without it conversation state lives per instance (fine for `pnpm dev`, broken on Vercel). |
| `NEXAVOICE_STORE`            |    –     | `memory` \| `file` \| `blob`. Auto-detected: `blob` when `BLOB_READ_WRITE_TOKEN` exists, otherwise `memory`. |
| `NEXAVOICE_BLOB_ACCESS`      |    –     | `public` (default) or `private`, matching how the Blob store was created. |
| `AGENT_TOOLS_BASE_URL`       |    –     | Override the public **https** URL the Agora engine calls back into (`${URL}/api/agent-tools/*`). Defaults to the request origin, then `VERCEL_URL`. |
| `AGENT_TOOLS_SECRET`         |    –     | Shared secret (≥ 8 chars) the engine sends as `x-nexavoice-tool-token`. Unset → derived from the App Certificate, so tools still work on a fresh deployment. |
| `AGORA_AREA`                 |    –     | `US` (default), `EU` or `AP` — Agora REST region. Must match the project's region or the agent never starts.                                                           |
| `AGENT_LANGUAGE`             |    –     | Turn-detection / interaction locale: `en-IN` (default), `hi-IN`, `bn-IN`, `ta-IN`, `te-IN`, `gu-IN`, `kn-IN`, `en-US`.                                                   |
| `AGENT_STT_LANGUAGE`         |    –     | Deepgram language, default `multi` (Hindi/English code-switching).                                                                                                      |
| `AGENT_TTS_VOICE_ID`         |    –     | MiniMax voice id, default `English_captivating_female1`.                                                                                                                |
| `NEXT_LLM_URL` / `NEXT_LLM_API_KEY` | – | OpenAI-compatible LLM. Enables the LLM chat agent and routes the voice agent through `/api/chat/completions` (custom LLM with server-side tools). Without them the chat uses a built-in rule-based agent and the voice agent uses Agora-managed OpenAI. |
| `NEXT_LLM_MODEL`             |    –     | Model for the BYOK LLM (default `gpt-4o-mini`).                                                                                                                         |

The agent pipeline in [`lib/agent-config.ts`](lib/agent-config.ts) uses Agora-managed Deepgram STT, OpenAI LLM and MiniMax TTS, so no vendor keys are required. The Conversational AI feature and Agora-managed vendors must be enabled on the Agora project (`agora project doctor --deep`). Without `NEXT_LLM_*`, chat is answered by the deterministic rule-based agent in [`lib/chat-agent.ts`](lib/chat-agent.ts) — it covers the demo flows (verify → orders → cancel/return/address → ticket → escalation) with fixed copy, so free-form questions get a "what can I do" reply rather than an LLM answer.

### Troubleshooting a deployment

| Symptom | Cause | Fix |
| --- | --- | --- |
| Voice call starts, then nothing; "The AI agent could not join this call" | `invite-agent` error, now surfaced in the banner | Read the message + `/api/health`; run `agora project doctor --deep` |
| Agent never speaks but an `agent_id` came back | Conversational AI not enabled for the App ID | Agora Console → project → All features → **Conversational AI** |
| Call never connects, no error at all | App ID missing from the client bundle | Enable `NEXT_PUBLIC_AGORA_APP_ID` for **Build** and redeploy (the token route now also serves it) |
| Chat says "Conversation not found" / forgets the phone number between turns | No shared state backend | Create a Vercel Blob store |
| Agent talks but never looks up orders | Engine cannot reach `/api/agent-tools/*` | Check `agent.tools` in `/api/health`; needs a public https URL (Vercel URL, ngrok, cloudflared) |
| Chat answers look canned | `NEXT_LLM_*` not set → rule-based agent | Set `NEXT_LLM_URL` / `NEXT_LLM_API_KEY` |
| Dashboard shows nothing while a call is live | State not shared (see above) | Blob store; SSE is best-effort — the 3s poll reads the mirror |

## Commands

```bash
# Dev
pnpm dev                # start the Next.js dev server

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
- **controlled backend actions**: verify customer → read orders → cancel / return / change address only after the customer confirms, all business rules enforced server-side and audited
- text chat sharing the same tools, conversation state and escalation path
- **human agent dashboard** (SSE + polling) with live calls/chats, escalation queue, §24 handoff summary and customer details
- voice takeover: the human joins the same channel as uid `654321`; the AI announces the handover and leaves
- [`AgentVisualizer`](https://agoraio-conversational-ai.github.io/agent-uikit/), per-stage latency via `AGENT_METRICS`

## How It Works

### Voice (Agora Conversational AI Engine)

1. `/client/voice` requests an RTC + RTM token from `/api/generate-agora-token`.
2. `/api/invite-agent` registers a `VOICE` conversation and starts the agent (`agora-agents` SDK → `POST /v2/projects/{appid}/join`): Deepgram `nova-3` (`multi`), OpenAI `gpt-4o-mini` with the NexaMart system prompt, MiniMax TTS, `turn_detection.language` from `AGENT_LANGUAGE`, `enable_rtm` + `enable_tools`, and **inline REST tools** pointing at `/api/agent-tools/<tool>?conversation_id=…` (authenticated with `AGENT_TOOLS_SECRET` via template variables).
3. The browser joins the channel, publishes mic audio and receives transcript / state / metrics over RTM. It mirrors completed turns and agent state to `PATCH /api/conversations/:id` so the dashboard sees the call live.
4. When the LLM calls a tool, the engine POSTs to this backend; [`lib/support/tools.ts`](lib/support/tools.ts) enforces the guardrails (verification first, `confirmed: true` for every write, no actions after handoff) and [`lib/shop/service.ts`](lib/shop/service.ts) enforces business rules (no cancel after shipping, address locked once packed, 10-day return window…).
5. `escalate_to_human` (AI tool or the caller's **Talk to a human** button) creates a case with the handoff summary; the dashboard is notified over SSE.
6. A human accepts the case, gets a token for the **same channel** (`/api/cases/:id/accept`) and joins; `/api/cases/:id/takeover` makes the AI say a handover line (`/agents/:id/speak`) and then stops it (`/agents/:id/leave`). Only customer and human remain.
7. On hang-up the client calls `/api/stop-conversation` and the conversation is closed.

If `NEXT_LLM_URL`/`NEXT_LLM_API_KEY` are set, the engine is pointed at this app's `/api/chat/completions` (OpenAI-compatible SSE proxy) which runs the same tools server-side — use this if inline REST tools are not available on your Agora project.

### Chat

`POST /api/conversations` → `POST /api/conversations/:id/messages`. With an LLM configured, [`lib/chat-agent.ts`](lib/chat-agent.ts) runs `generateText` with the same tool set; otherwise a deterministic EN/HI/Hinglish rule-based agent drives the same `executeTool` layer (verification, status, two-step confirmation for writes, complaints → ticket, human request → escalation). After escalation the AI stays silent and the human replies from the case page.

### State machine

`AI_HANDLING → WAITING_FOR_HUMAN → HUMAN_HANDLING → RESOLVED` (or `CLOSED` when the customer leaves). State is owned by the backend store ([`lib/support/store.ts`](lib/support/store.ts), in-memory for the demo); the browser never decides it.

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
- `app/api/shop/**` — read-only demo shop endpoints
- `lib/agent-config.ts`, `lib/agent-prompt.ts`, `lib/agent-tools.ts` — agent pipeline, system prompt, tool schemas / REST tool wiring
- `lib/agora-server.ts` — server-side Agora client (`stopAgent`, `speakAsAgent`, auth headers)
- `lib/support/{types,store,tools}.ts` — conversation/case model, in-memory store + events, guarded `executeTool` + handoff summary
- `lib/shop/{data,service}.ts` — NexaMart demo data and business rules
- `lib/chat-agent.ts` — chat turn (LLM or rule-based)
- `lib/api.ts` — browser API client
- `components/VoiceAgentCall.tsx`, `components/ConversationComponent.tsx` — customer voice call (token, RTM, RTC, transcript sync, escalation)
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
