# 01 Setup

> Environment setup, commands, and safe verification flow for this quickstart.

## Runtime Requirements

- Node.js `>=22` (`package.json` engines field).
- `pnpm` package manager.
- Agora CLI (`agora`) for project binding and environment bootstrap.
- Agora project with Conversational AI enabled.

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
```

## Required Environment Variables

- `NEXT_PUBLIC_AGORA_APP_ID`: Agora project App ID.
- `NEXT_AGORA_APP_CERTIFICATE`: Agora App Certificate (server only).

The base `.env.local` contract contains only these Agora credentials; chat, dashboard and the voice agent (without backend tools) work with them alone.

## NexaVoice Optional Variables

- `AGENT_TOOLS_BASE_URL` + `AGENT_TOOLS_SECRET` (≥ 8 chars): enable the voice agent's REST tools (order lookup/changes/escalation). The URL must be publicly reachable by Agora (Vercel URL, or a tunnel for local dev).
- `AGORA_AREA`: `US` (default) | `EU` | `AP`.
- `AGENT_LANGUAGE` (`en-IN` default), `AGENT_STT_LANGUAGE` (`multi`), `AGENT_TTS_VOICE_ID`.
- `NEXT_LLM_URL` + `NEXT_LLM_API_KEY` (+ `NEXT_LLM_MODEL`): BYOK LLM for the chat agent and the custom-LLM voice path. Without them chat falls back to the rule-based agent.

See `env.local.example` for the annotated template.

## Primary Commands

```bash
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
- `pnpm run verify:api`
- `pnpm run build`

Requires env/project binding:

- `pnpm run doctor`
- `pnpm run verify`

## Local Run Notes

- App + API routes run at `http://localhost:3000`.
- Session starts from `VoiceAgentCall` (`Start Call` on `/client/voice`) and bootstraps token + RTM + invite flow. The `components/LandingPage.tsx` / `QuickstartPreCallCard.tsx` pair from the upstream quickstart was removed: it was an unused second bootstrap path that never registered a conversation, so escalation and transcript mirroring could not work through it.
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
| Chat "Conversation not found", or the agent re-asks for the phone number every turn | Each Vercel function got its own in-memory store | `GET /api/health` → `store.backend` is `memory` | Create a Vercel Blob store (sets `BLOB_READ_WRITE_TOKEN`), or `NEXAVOICE_STORE=file` for one container |
| Voice banner stays on "Connecting…" / call never joins with no error | App ID absent from the client bundle (`NEXT_PUBLIC_*` inlined at build time) or the join error was swallowed | `GET /api/health` → `agora.appId`; the banner now renders the `useJoin` error | Tick **Build** for `NEXT_PUBLIC_AGORA_APP_ID`, or rely on the `appId` served by `/api/generate-agora-token` |
| Agent answers without looking up orders | Engine could not reach the tool URL | `GET /api/health` → `agent.tools` (`enabled`, `baseUrl`, `secretSource`) | Expose the app over https (Vercel URL / ngrok) and set `AGENT_TOOLS_BASE_URL` |
| Chat answers look canned, no free discussion | No LLM configured — the rule-based agent is active | `GET /api/health` → `agent.llm` is `agora-managed` | Set `NEXT_LLM_URL` + `NEXT_LLM_API_KEY` (and `NEXT_LLM_MODEL`) |
| `Agent invite failed: fetch failed` | Region mismatch with the Agora project | `AGORA_AREA`, `agora project doctor --deep` | Set `AGORA_AREA` to the project region (`US`/`EU`/`AP`) |

## Local-Only vs Deploy-Specific

Local:

- Uses `.env.local` created by `agora project env write`.
- Uses `next dev --webpack`.
- Best for flow debugging and transcript behavior checks.

Vercel:

- Requires environment vars configured per environment scope.
- Keep `NEXT_AGORA_APP_CERTIFICATE` private server variable.
- Tick **Build** for `NEXT_PUBLIC_AGORA_APP_ID` as well as Development/Preview/Production:
  it is inlined into the client bundle, and a Runtime-only value leaves the browser with
  `undefined`. The client then joins with the `appId` returned by
  `/api/generate-agora-token` (which the server reads at runtime), so calls still connect —
  keep both environments set so the fallback and the signed token agree.
- Create a Blob store (Project → Storage → Create Database → Blob) so conversation and
  case state are shared between function instances; `BLOB_READ_WRITE_TOKEN` is injected
  and `lib/support/persist.ts` picks it up automatically. Without it the chat cannot
  complete a second turn.
- Set `AGORA_AREA` when the project is not in the `US` area, and `NEXT_LLM_URL` +
  `NEXT_LLM_API_KEY` to replace the rule-based chat agent with the LLM one.
- Check the deployment with `curl https://<deployment>/api/health` — it reports
  credential presence, tool wiring, LLM provider and the store backend, never a secret.
- Use `pnpm run build` locally before pushing deployment changes.

## Setup Change Checklist

When setup docs/config change:

1. Update `README.md` environment/commands sections.
2. Update `env.local.example` if variable set changes.
3. Update `docs/ai/L1/01_setup.md` and `L0_repo_card.md` `Last Reviewed`.
4. Run at least `pnpm run typecheck` and `pnpm run verify:api`.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Full start/join/teardown sequence.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — RTM transcript/event pipeline internals.
