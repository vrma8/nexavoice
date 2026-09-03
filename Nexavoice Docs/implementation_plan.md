# NexaVoice Implementation Plan

This plan outlines the implementation of the NexaVoice architecture based on the specifications in `v1.md`, leveraging the existing Agora Next.js template.

## User Review Required

> [!WARNING]
> This plan proposes significant architectural changes to convert the current template into a multi-role application (Client & Support Agent) while establishing communication with a new FastAPI backend. Please review the proposed routing, component structure, and backend integration strategy.

## Open Questions

> [!IMPORTANT]
> 1. The documentation mentions a FastAPI backend to manage agent states and handle text-to-agent fallback (via `/api/chat/message`). Should we stub out the backend API calls in this Next.js app first, or should we set up the FastAPI backend in parallel during this phase?
> 2. `v1.md` suggests a monorepo structure with `apps/web/` and `apps/backend/`. Currently, the Next.js app is at the root. Should we move the Next.js app into an `apps/web/` directory and scaffold `apps/backend/`?
> 3. Does the Agora project currently have the Conversational AI API and SIP/PSTN features enabled?

## Proposed Changes

### Application Structure & Routing

We will implement the Next.js App Router structure defined in `v1.md`.

#### [NEW] [app/page.tsx](file:///e:/Projects/nexavoice/app/page.tsx)
- Create a public landing page with options to "Get Support" (routes to `/client`) or "Support Agent Login" (routes to `/support-agent`).

#### [NEW] [app/client/page.tsx](file:///e:/Projects/nexavoice/app/client/page.tsx)
- Create the client landing screen prompting to choose between "Chat with AI" and "Voice Call".

#### [NEW] [app/client/chat/page.tsx](file:///e:/Projects/nexavoice/app/client/chat/page.tsx)
- Implement the chat interface supporting text interaction with the Agora AI and an option to "Talk to a human" which triggers escalation.

#### [NEW] [app/client/voice/page.tsx](file:///e:/Projects/nexavoice/app/client/voice/page.tsx)
- Implement the voice call UI with Agora RTC integration, including microphone controls, connection status, and live AI interaction.

#### [NEW] [app/support-agent/page.tsx](file:///e:/Projects/nexavoice/app/support-agent/page.tsx)
- Implement the support agent dashboard displaying active cases and an option to join a case (Agora channel) to handle human escalations.

### Components

#### [NEW] [components/ClientChat.tsx](file:///e:/Projects/nexavoice/components/ClientChat.tsx)
- Chat component logic handling messages, API calls to the backend (`/api/chat/message`), and escalation flows.

#### [NEW] [components/VoiceAgentCall.tsx](file:///e:/Projects/nexavoice/components/VoiceAgentCall.tsx)
- Wraps the Agora RTC client to handle the WebRTC voice connection to the AI agent.

#### [NEW] [components/SupportDashboard.tsx](file:///e:/Projects/nexavoice/components/SupportDashboard.tsx)
- The main view for support agents to see escalated cases.

### API Integration (Next.js side)

#### [NEW] [lib/api.ts](file:///e:/Projects/nexavoice/lib/api.ts)
- Functions to communicate with the FastAPI backend for session creation, chat messaging, and escalation triggers.

## Verification Plan

### Automated Tests
- Validate UI component rendering.
- Verify TypeScript types match the expected API contracts.

### Manual Verification
- Launch the dev server and verify routing `/`, `/client/`, `/client/chat/`, `/client/voice/`, and `/support-agent/`.
- Test the chat UI state and simulate sending a message.
- Verify that the voice page attempts to initialize the Agora RTC client and prompts for microphone permissions.
