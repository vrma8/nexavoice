# PLAN.md --- Multilingual Assistance-Line Agent

## Agora Conversational AI Engine + Normal Customer-Care Phone Calls

> **Mandatory core:** Agora Conversational AI Engine\
> **Primary agent language:** Python\
> **Human dashboard:** Next.js + React + TypeScript\
> **Database:** Supabase PostgreSQL\
> **User interface:** Normal PSTN/SIP phone call\
> **Languages:** Hindi, English, Hindi-English code switching

------------------------------------------------------------------------

# 1. NON-NEGOTIABLE PROJECT ARCHITECTURE

This project MUST implement the **Agora Conversational AI Engine**.
Agora is not merely being used as a generic WebRTC transport.

The core voice pipeline is:

``` text
Caller
  │
  │ normal customer-care phone call
  ▼
Agora SIP / PSTN connectivity
  │
  ▼
Agora RTC / SD-RTN
  │
  ▼
Agora Conversational AI Engine
  │
  ├── Audio processing / noise suppression
  ├── Echo cancellation
  ├── Turn detection / VAD
  ├── Interruption handling
  ├── STT / ASR
  ├── LLM
  └── TTS
  │
  ▼
Caller hears AI
```

The application layer adds:

``` text
FastAPI
  ├── Agent/business state
  ├── Intent
  ├── Confidence
  ├── Confirmation
  ├── Tools
  ├── Cases
  └── Human escalation
          │
          ▼
    Next.js dashboard
          │
          ▼
    Human joins Agora
```

Agora documents Conversational AI as a real-time voice-AI platform with
cascading ASR → LLM → TTS, model flexibility, interruption handling,
background-noise suppression, echo cancellation and selective attention
locking. citeturn2search0turn2search7

------------------------------------------------------------------------

# 2. OFFICIAL DOCUMENTATION / CODE LINKS

Keep these links in the repository.

### Agora

-   Main docs: https://docs.agora.io/en/
-   Conversational AI:
    https://docs.agora.io/en/conversational-ai/overview
-   LLM configuration:
    https://docs.agora.io/en/conversational-ai/models/llm/overview
-   ASR/STT configuration:
    https://docs.agora.io/en/conversational-ai/models/asr/overview
-   TTS configuration:
    https://docs.agora.io/en/conversational-ai/models/tts/overview
-   Avatar configuration:
    https://docs.agora.io/en/conversational-ai/models/avatar/overview
-   Agora Conversational AI product:
    https://www.agora.io/en/products/conversational-ai-engine/
-   AI Noise Suppression:
    https://www.agora.io/en/products/ai-noise-suppression/

### Official Python SDK

-   Repository: https://github.com/AgoraIO/agora-agents-python
-   README:
    https://github.com/AgoraIO/agora-agents-python/blob/main/README.md
-   Quick start:
    https://github.com/AgoraIO/agora-agents-python/blob/main/docs/getting-started/quick-start.md
-   Vendors:
    https://github.com/AgoraIO/agora-agents-python/blob/main/docs/concepts/vendors.md
-   Reference:
    https://github.com/AgoraIO/agora-agents-python/blob/main/reference.md
-   Changelog:
    https://github.com/AgoraIO/agora-agents-python/blob/main/changelog.md

### Official recipe

-   Python quickstart:
    https://recipes.agora.io/recipes/python-quickstart

### Agora release/support information

-   Conversational AI release notes:
    https://agoraio.zendesk.com/hc/en-us/sections/36826865733012-Conversational-AI-Engine

------------------------------------------------------------------------

# 3. LANGUAGES

Use:

``` text
Python
    → Agora Conversational AI agent
    → FastAPI
    → agent state
    → tools
    → confidence
    → escalation
    → PostgreSQL

TypeScript
    → Next.js
    → React
    → human dashboard
    → Agora Web SDK
```

Go and Rust are not required for this MVP.

The official Agora Python SDK currently requires Python 3.8+ and is
installed with:

``` powershell
pip install agora-agents
```

The SDK provides the `Agent` builder and supports `with_stt()`,
`with_llm()`, `with_tts()`, `with_mllm()` and session creation.
fileciteturn1file0

------------------------------------------------------------------------

# 4. AGORA CONVERSATIONAL AI ENGINE

## 4.1 Mandatory implementation

Use:

``` text
Agora Conversational AI Engine
```

with the cascading flow:

``` text
ASR
 ↓
LLM
 ↓
TTS
```

Agora handles the real-time orchestration around the pipeline.
citeturn2search0turn4search3

Do NOT replace it with a custom:

``` text
WebSocket → custom STT → custom LLM → custom TTS
```

pipeline for the main implementation.

------------------------------------------------------------------------

# 5. AGORA PYTHON AGENT

Install:

``` powershell
pip install agora-agents
```

Minimal starting point:

``` python
import os
import time

from agora_agent import (
    Agent,
    Agora,
    Area,
    AresSTT,
    OpenAI,
)

client = Agora(
    area=Area.US,
    app_id=os.environ["AGORA_APP_ID"],
    app_certificate=os.environ["AGORA_APP_CERTIFICATE"],
)

agent = (
    Agent(
        client=client,
        turn_detection={"language": "en-US"},
    )
    .with_stt(
        AresSTT(
            language="en",
        )
    )
    .with_llm(
        OpenAI(
            model="gpt-4o-mini",
            system_messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a multilingual customer assistance "
                        "voice agent. Support Hindi, English and Hinglish. "
                        "Keep responses concise. Never guess critical "
                        "information. Escalate when uncertain."
                    ),
                }
            ],
        )
    )
)

session = agent.create_session(
    channel=f"assistance-{int(time.time())}",
    agent_uid="1",
    remote_uids=["*"],
    name=f"conversation-{int(time.time())}",
    idle_timeout=30,
)

session.start()
```

This is a starting configuration, not a final provider configuration.
Verify the exact provider/language combination available to the Agora
project before deployment.

The official SDK uses this same client → Agent → STT/LLM/TTS → session
pattern. fileciteturn1file0

------------------------------------------------------------------------

# 6. AGORA CREDENTIALS

Create an Agora project and configure:

``` env
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
```

Never commit these values.

The current Python SDK can generate the required Conversational AI REST
authentication and RTC join tokens when supplied with App ID and App
Certificate. fileciteturn1file0

------------------------------------------------------------------------

# 7. REGION

The SDK binds an `Area` to the Agora client:

``` python
client = Agora(
    area=Area.US,
    app_id=os.environ["AGORA_APP_ID"],
    app_certificate=os.environ["AGORA_APP_CERTIFICATE"],
)
```

Select the actual region according to the current Agora project/account
configuration and deployment requirements.

Do not copy an old region setting blindly.

------------------------------------------------------------------------

# 8. PHONE CALL / PSTN / SIP

The caller interacts through a **normal phone call**, exactly like
calling an organization's customer-care number.

Target flow:

``` text
Caller phone
    ↓
PSTN
    ↓
Agora SIP / PSTN
    ↓
Agora RTC
    ↓
Conversational AI Engine
```

Agora's current materials explicitly identify SIP/PSTN support as part
of its conversational-AI architecture and state that its platform
supports phone calls. citeturn4search46turn4search0

## IMPORTANT

Before implementation, verify that the Agora account has access to the
required SIP/PSTN functionality.

Required items:

``` text
Phone number
SIP/PSTN access
Inbound routing
SIP trunk/configuration if required
Agora channel/session mapping
```

Do not invent SIP URLs, undocumented endpoints, or unsupported account
capabilities.

If the feature is not enabled on the hackathon account, request access
from Agora/support or use a supported SIP-compatible telephony provider
as the telephony edge.

Agora's current privacy documentation also references SIP Call Center
configuration, phone numbers and SIP trunk configuration.
citeturn4search2

------------------------------------------------------------------------

# 9. COMPLETE PHONE CALL FLOW

``` text
1. Caller dials customer-care number
                ↓
2. PSTN/SIP receives call
                ↓
3. Call enters Agora
                ↓
4. Agora Conversational AI agent joins
                ↓
5. Caller audio is processed
                ↓
6. Noise suppression / echo cancellation
                ↓
7. STT/ASR
                ↓
8. Agent logic + LLM
                ↓
9. TTS
                ↓
10. Audio returned to caller
                ↓
11. Conversation continues
```

If escalation happens:

``` text
AI
 ↓
Create case
 ↓
Generate handoff summary
 ↓
Notify human dashboard
 ↓
Human clicks JOIN CALL
 ↓
Human joins Agora session
 ↓
AI mutes/stops
 ↓
Human continues call
```

------------------------------------------------------------------------

# 10. NOISE SUPPRESSION

Noise handling is a core requirement.

Test:

``` text
Fan
Traffic
Crowd
TV
Keyboard
Outdoor noise
People speaking nearby
Echo
Phone speaker
Poor phone audio
```

Agora provides built-in background-noise suppression and echo
cancellation for conversational AI. Its AI Noise Suppression product
describes real-time removal of background noise and echo.
citeturn2search0turn2search1

Therefore:

``` text
Phone audio
 ↓
Agora audio processing
 ↓
Noise suppression
 ↓
Echo cancellation
 ↓
STT
```

Do not create a second custom noise-suppression stack unless testing
proves it necessary.

------------------------------------------------------------------------

# 11. INTERRUPTION HANDLING

This MUST be demonstrated.

Example:

``` text
AI:
"Your application is currently being..."

Caller:
"No, wait! That's wrong."
```

Expected:

``` text
AI speech stops
       ↓
Caller turn detected
       ↓
New STT result
       ↓
LLM processes correction
       ↓
AI responds
```

Agora specifically provides intelligent interruption handling for voice
AI. citeturn2search0turn2search7

------------------------------------------------------------------------

# 12. TURN DETECTION / VAD

The agent must correctly determine when the caller has finished
speaking.

Test:

``` text
Short answer
Long answer
Mid-sentence pause
Numbers
Reference IDs
"Actually..."
"Hmm..."
Language switching
Interruption
```

Agora's current voice-agent materials describe VAD, turn detection and
interruption handling in the conversational stack. citeturn4search3

------------------------------------------------------------------------

# 13. STT / ASR

The official Agora product documentation currently lists:

``` text
ARES
Microsoft Azure
Deepgram
```

The current Python SDK also exposes additional wrappers such as:

``` text
SarvamSTT
```

The SDK reference documents `SarvamSTT` with:

``` python
SarvamSTT(
    api_key="...",
    language="hi",
)
```

Provider availability must be verified against the current Agora
account/API configuration. citeturn2search0turn5search0

## Hindi/Hinglish requirement

Benchmark at least:

``` text
Hindi
English
Hinglish
Hindi → English
English → Hindi
```

For domain-specific words, consider ARES keywords. Conversational AI
Engine v2.11 added ARES keyword support for improving recognition of
domain-specific terms. citeturn2search8

Concept:

``` python
AresSTT(
    keywords=[
        "application",
        "reference",
        "complaint",
        "case",
    ]
)
```

Verify the installed SDK's exact constructor/API before using this.

------------------------------------------------------------------------

# 14. LLM

Agora is model-agnostic.

Current product documentation lists integrations including:

``` text
OpenAI
OpenAI Realtime API
Azure OpenAI
Google Gemini
Google Vertex AI
Anthropic Claude
Dify
Custom LLM
```

citeturn2search0turn2search13

Recommended MVP:

``` text
Agora Conversational AI
        ↓
OpenAI LLM
```

The LLM handles:

``` text
Intent
Conversation
Information extraction
Question selection
Confirmation
Tool selection
Escalation reasoning
Summary
```

The LLM must NOT directly execute SQL.

------------------------------------------------------------------------

# 15. TTS

Current Agora product documentation lists:

``` text
Microsoft Azure
ElevenLabs
Cartesia (Beta)
OpenAI (Beta)
Hume AI (Beta)
```

The current Python SDK also contains wrappers such as:

``` text
SarvamTTS
```

`SarvamTTS` accepts parameters including:

``` python
SarvamTTS(
    key="...",
    speaker="...",
    target_language_code="hi-IN",
)
```

Verify current provider availability and supported voices/languages
before final selection. citeturn2search0turn5search0

------------------------------------------------------------------------

# 16. RECOMMENDED INDIAN-LANGUAGE TEST PATH

For Hindi/Hinglish, benchmark:

``` text
STT:
ARES
Sarvam
Azure
Deepgram

TTS:
Sarvam
Azure
ElevenLabs
```

Choose based on:

``` text
Hindi recognition
Hinglish recognition
Phone-quality audio
Latency
Naturalness
Cost
Reliability
Availability
```

Do not assume the SDK wrapper means the provider is automatically
enabled in the account.

------------------------------------------------------------------------

# 17. OPTIONAL MLLM PATH

Agora's Python SDK supports:

``` python
agent.with_mllm(...)
```

The current SDK documents MLLM flows such as OpenAI Realtime and other
supported real-time models. fileciteturn1file0

For the MVP:

``` text
PRIMARY:
Agora Conversational AI
STT → LLM → TTS
```

MLLM is optional/experimental.

Do not replace the mandatory Conversational AI implementation with MLLM
unless benchmarking proves it is better for the project.

------------------------------------------------------------------------

# 18. FASTAPI BACKEND

Use:

``` text
Python
FastAPI
SQLAlchemy
Alembic
Pydantic
httpx
```

Install:

``` powershell
pip install fastapi "uvicorn[standard]"
pip install sqlalchemy psycopg2-binary
pip install alembic pydantic python-dotenv httpx
pip install pytest
```

Responsibilities:

``` text
Call lifecycle
Agent lifecycle
Conversation state
Business logic
Tools
Confidence
Escalation
Cases
Database
Dashboard API
```

------------------------------------------------------------------------

# 19. BACKEND STRUCTURE

``` text
backend/
├── app/
│   ├── main.py
│   ├── api/
│   │   └── routes/
│   │       ├── calls.py
│   │       ├── cases.py
│   │       ├── escalation.py
│   │       ├── transcripts.py
│   │       └── health.py
│   │
│   ├── agora/
│   │   ├── client.py
│   │   ├── agent.py
│   │   ├── sessions.py
│   │   ├── tokens.py
│   │   └── events.py
│   │
│   ├── telephony/
│   │   ├── provider.py
│   │   ├── sip.py
│   │   ├── webhooks.py
│   │   └── routing.py
│   │
│   ├── agent/
│   │   ├── prompt.py
│   │   ├── state.py
│   │   ├── orchestrator.py
│   │   ├── confidence.py
│   │   ├── confirmation.py
│   │   ├── escalation.py
│   │   └── summary.py
│   │
│   ├── tools/
│   │   ├── application.py
│   │   ├── customer.py
│   │   ├── ticket.py
│   │   └── escalation.py
│   │
│   ├── models/
│   ├── schemas/
│   ├── database/
│   └── services/
│
├── tests/
├── requirements.txt
└── Dockerfile
```

------------------------------------------------------------------------

# 20. HUMAN DASHBOARD

Use:

``` text
Next.js
React
TypeScript
Tailwind CSS
Agora Web SDK
```

Install:

``` powershell
npx create-next-app@latest dashboard --typescript --tailwind --eslint --app --src-dir
cd dashboard
npm install
npm install agora-rtc-sdk-ng
```

The human dashboard is NOT the caller interface.

Caller:

``` text
Normal phone
```

Human:

``` text
Web dashboard + headset
```

------------------------------------------------------------------------

# 21. HUMAN DASHBOARD FLOW

``` text
Escalation arrives
       ↓
Dashboard displays
       ↓
Caller details
Intent
Confidence
Summary
Transcript
Reason
       ↓
Human clicks JOIN CALL
       ↓
Agora Web SDK
       ↓
Human joins session
       ↓
AI stops/mutes
       ↓
Human continues
```

------------------------------------------------------------------------

# 22. DATABASE

Use Supabase PostgreSQL.

Recommended tables:

``` text
users
calls
conversations
messages
cases
case_details
human_agents
```

Connection:

``` env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

Python:

``` python
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine(
    os.environ["DATABASE_URL"]
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)
```

Never expose `DATABASE_URL` to Next.js/browser code.

------------------------------------------------------------------------

# 23. AGENT STATE

``` python
from dataclasses import dataclass, field


@dataclass
class ConversationState:
    language: str = "unknown"
    intent: str | None = None

    caller_name: str | None = None
    phone: str | None = None
    reference_id: str | None = None
    problem: str | None = None

    confidence: float = 0.0

    missing_information: list[str] = field(default_factory=list)
    confirmed_information: set[str] = field(default_factory=set)

    escalation_required: bool = False
    escalation_reason: str | None = None
```

------------------------------------------------------------------------

# 24. CONTROLLED AGENT TOOLS

Use:

``` text
check_application_status(reference_id)
get_customer(phone)
create_ticket(category, summary)
update_case(case_id, data)
escalate_to_human(reason)
generate_handoff_summary(conversation)
```

Architecture:

``` text
LLM
 ↓
Tool
 ↓
FastAPI service
 ↓
SQLAlchemy
 ↓
PostgreSQL
```

Never:

``` text
LLM
 ↓
raw SQL
```

------------------------------------------------------------------------

# 25. TOOL RESULT FLOW

``` text
Caller
 ↓
AI
 ↓
Tool call
 ↓
FastAPI
 ↓
Database/API
 ↓
Tool result
 ↓
Conversation context
 ↓
LLM
 ↓
TTS
 ↓
Caller
```

Tool output must be added back into conversational context before the
spoken response is generated.

------------------------------------------------------------------------

# 26. CONFIDENCE ENGINE

Use an application-level score.

Initial model:

``` text
confidence =
    0.30 * intent_confidence
  + 0.25 * asr_confidence
  + 0.20 * entity_confidence
  + 0.15 * confirmation_score
  + 0.10 * consistency_score
```

Initial thresholds:

``` text
0.80–1.00 → HIGH
0.55–0.79 → MEDIUM
0.00–0.54 → LOW
```

These are experimental values.

Signals:

``` text
ASR confidence
Intent confidence
Entity extraction
Repeated corrections
Confirmation
Contradictions
Noise
Unclear speech
```

------------------------------------------------------------------------

# 27. ESCALATION ENGINE

Escalate when:

``` text
Caller asks for human
OR
Low confidence remains
OR
Caller repeatedly corrects AI
OR
Critical information cannot be confirmed
OR
Noise prevents reliable understanding
OR
Issue needs human judgment
OR
Issue is outside scope
OR
Medical/legal/financial issue
OR
Backend result cannot be verified
```

------------------------------------------------------------------------

# 28. HANDOFF SUMMARY

Example:

``` json
{
  "language": "Hindi-English",
  "intent": "application_status",
  "caller_name": "Rahul",
  "reference_id": "5281",
  "confirmed_information": [
    "reference_id"
  ],
  "summary": "Caller wants to check application status.",
  "actions_taken": [
    "Application status lookup attempted"
  ],
  "reason_for_escalation": "Backend status unavailable",
  "confidence": 0.84
}
```

The human should not need to ask the caller for information already
collected and confirmed.

------------------------------------------------------------------------

# 29. ENVIRONMENT

`.env.example`:

``` env
# Agora
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
AGORA_AREA=

# LLM
OPENAI_API_KEY=

# Optional/provider-specific
SARVAM_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# Database
DATABASE_URL=

# Optional
REDIS_URL=

# SIP/PSTN values depend on the enabled Agora/telephony setup
SIP_TRUNK_ID=
SIP_PHONE_NUMBER=

# App
ENVIRONMENT=development
LOG_LEVEL=INFO
```

Only include variables actually used by the selected configuration.

------------------------------------------------------------------------

# 30. SECURITY

Never commit:

``` text
.env
Agora App Certificate
LLM keys
STT keys
TTS keys
Database passwords
SIP credentials
Long-lived RTC tokens
```

Use:

``` text
.env.example
```

The official Agora SDK examples keep credentials in environment
variables rather than source code. fileciteturn1file0

------------------------------------------------------------------------

# 31. SESSION DATA / PRIVACY

Agora's current Conversational AI Engine supports:

``` text
properties.parameters.opt_out = true
```

for session-level data-retention control.

The v2.8 release documentation states that interaction text/audio can
otherwise be temporarily retained for service operation, agent
optimization and troubleshooting. citeturn2search11

For the hackathon:

``` text
Store minimum required data.
Avoid unnecessary recordings.
Define transcript retention.
Restrict dashboard access.
Mask phone numbers where possible.
```

------------------------------------------------------------------------

# 32. TOKEN EXPIRY

Current Conversational AI Engine documentation includes an agent RTC
token expiry event:

``` text
104 agent expire
```

The documented response is to update the agent with a fresh token rather
than restarting the session. citeturn2search11

Production implementation must account for:

``` text
Token expiry
Token refresh
Long calls
Reconnects
Agent failure
```

------------------------------------------------------------------------

# 33. OBSERVABILITY

Log events such as:

``` text
CALL_STARTED
CALL_CONNECTED
AGENT_STARTED
AGENT_STOPPED
STT_EVENT
TURN_STARTED
TURN_ENDED
LLM_REQUEST
LLM_RESPONSE
TTS_STARTED
TTS_COMPLETED
TOOL_CALLED
CONFIDENCE_CHANGED
ESCALATION_TRIGGERED
CASE_CREATED
HUMAN_NOTIFIED
HUMAN_JOINED
AI_HANDOFF
CALL_ENDED
```

Never log secrets or unnecessary sensitive caller information.

------------------------------------------------------------------------

# 34. API

Recommended FastAPI endpoints:

``` http
POST /api/calls/incoming
POST /api/calls/{call_id}/start-agent
POST /api/calls/{call_id}/end

GET  /api/cases
POST /api/cases
GET  /api/cases/{case_id}
PATCH /api/cases/{case_id}

POST /api/cases/{case_id}/escalate
POST /api/cases/{case_id}/accept

GET /api/calls/{call_id}/transcript

POST /api/calls/{call_id}/takeover
```

Telephony webhook:

``` http
POST /api/calls/incoming
```

must validate the provider's webhook/authentication mechanism.

------------------------------------------------------------------------

# 35. FAILURE HANDLING

## STT failure

``` text
Clarify
    ↓
If still unavailable
    ↓
Escalate
```

## LLM failure

``` text
Escalate
```

## TTS failure

``` text
Escalate / terminate gracefully
```

## Backend failure

``` text
Never fabricate result.
Escalate.
```

## SIP failure

``` text
Log
Recover where supported
Escalate/fail gracefully
```

------------------------------------------------------------------------

# 36. SAFETY

The agent MUST NOT:

``` text
Diagnose medical conditions
Prescribe medication
Give authoritative legal advice
Give financial investment advice
Invent official status
Invent case IDs
Invent customer information
Guess critical identifiers
```

When uncertain:

``` text
Clarify
 ↓
Confirm
 ↓
Escalate
```

------------------------------------------------------------------------

# 37. TEST PLAN

## Phone

``` text
Inbound call
Call answer
Call hangup
Caller ID
SIP/PSTN routing
Long call
Reconnect
```

## Language

``` text
Hindi
English
Hinglish
Hindi → English
English → Hindi
```

## Audio

``` text
Quiet
Fan
Traffic
Crowd
TV
Keyboard
Echo
Poor phone quality
```

## Conversation

``` text
Interruption
Correction
Incomplete answer
Repeated answer
Contradiction
Numbers
Reference IDs
```

## Escalation

``` text
Explicit human request
Low confidence
Repeated correction
Noise
Unsupported request
Backend failure
Safety scenario
```

## Human takeover

``` text
Case created
Summary generated
Dashboard notified
Human joins
AI stops/mutes
Human speaks
Context preserved
```

------------------------------------------------------------------------

# 38. DEMO

The final hackathon demo should use an actual phone.

### Demo 1

Caller:

``` text
"Mujhe apne application ka status check karna hai."
```

### Demo 2

Caller switches:

``` text
"Actually status update nahi hua and I submitted it last week."
```

### Demo 3

Caller gives ID:

``` text
"5281."
```

AI confirms it.

### Demo 4

Caller interrupts:

``` text
"No, wait! That's the wrong application."
```

AI stops speaking and handles the correction.

### Demo 5

Create background noise.

Show Agora's audio processing handling the environment.

### Demo 6

Cause low confidence.

AI says it does not want to misunderstand and escalates.

### Demo 7

Human dashboard displays:

``` text
Caller
Language
Intent
Confidence
Summary
Transcript
Escalation reason
```

Human clicks:

``` text
JOIN CALL
```

Human takes over.

------------------------------------------------------------------------

# 39. DEVELOPMENT ORDER

Do NOT start with the dashboard.

Implement in this order:

``` text
1. Agora project
       ↓
2. Conversational AI Engine enabled
       ↓
3. Python Agora SDK
       ↓
4. Basic Agent
       ↓
5. STT
       ↓
6. LLM
       ↓
7. TTS
       ↓
8. Test RTC conversation
       ↓
9. SIP/PSTN phone call
       ↓
10. Hindi/English/Hinglish
       ↓
11. Noise suppression tests
       ↓
12. Interruption tests
       ↓
13. Agent state
       ↓
14. Tools
       ↓
15. PostgreSQL
       ↓
16. Confidence engine
       ↓
17. Case management
       ↓
18. Dashboard
       ↓
19. Human Agora takeover
       ↓
20. End-to-end test
```

------------------------------------------------------------------------

# 40. DEFINITION OF DONE

``` text
[ ] Agora project created
[ ] Conversational AI Engine enabled
[ ] Official Python SDK installed
[ ] AI agent starts
[ ] STT works
[ ] LLM works
[ ] TTS works
[ ] Normal phone call reaches AI
[ ] Hindi works
[ ] English works
[ ] Hinglish works
[ ] Language switching works
[ ] Noise suppression works
[ ] Echo handling works
[ ] Interruption works
[ ] VAD/turn detection works
[ ] Critical information is confirmed
[ ] Tools work
[ ] Agent state works
[ ] Confidence engine works
[ ] Low confidence escalates
[ ] Human request escalates
[ ] Case is created
[ ] Summary is generated
[ ] Dashboard shows escalation
[ ] Human joins Agora session
[ ] AI stops/mutes
[ ] Human continues
[ ] Context is preserved
[ ] Caller does not repeat the whole problem
```

------------------------------------------------------------------------

# 41. CURRENT AGORA NOTES

The Conversational AI Engine is changing rapidly.

The current v2.11 release added:

``` text
ARES ASR keywords
Typecast TTS
Azure OpenAI Realtime MLLM
long-form audio stability improvements
```

The v2.8 release added:

``` text
session data-retention control
RTC token lifecycle handling
xAI ASR
xAI Grok LLM
```

Therefore, before implementing an exact vendor parameter/API field:

``` text
1. Check current Agora documentation.
2. Check current SDK reference.
3. Check current release notes.
4. Test against the actual Agora project.
```

citeturn2search8turn2search11

------------------------------------------------------------------------

# 42. AI CODING RULES

Any coding assistant working on this repository MUST:

1.  Read `PLAN.md` first.
2.  Use Agora Conversational AI Engine for the AI voice pipeline.
3.  Prefer the official Agora Python SDK.
4.  Verify current Agora documentation before using an API.
5.  Never invent Agora APIs.
6.  Never hardcode secrets.
7.  Keep Agora-specific code under `backend/app/agora/`.
8.  Keep SIP/PSTN code under `backend/app/telephony/`.
9.  Keep business logic independent from provider-specific code.
10. Never allow the LLM to execute raw SQL.
11. Preserve Hindi/English/Hinglish.
12. Preserve interruption handling.
13. Preserve noise suppression.
14. Preserve confidence-based escalation.
15. Preserve human takeover.
16. Preserve context during handoff.
17. Add tests for non-trivial state/confidence/escalation logic.
18. Update this plan when architecture changes.

------------------------------------------------------------------------

# 43. FINAL SYSTEM PRINCIPLE

The project is:

``` text
NORMAL CUSTOMER-CARE PHONE CALL
             ↓
        AGORA SIP/PSTN
             ↓
      AGORA RTC / SD-RTN
             ↓
AGORA CONVERSATIONAL AI ENGINE
             ↓
 ┌─────────────────────────────┐
 │ Noise Suppression           │
 │ Echo Cancellation           │
 │ Turn Detection / VAD        │
 │ Interruption Handling       │
 │ STT                         │
 │ LLM                         │
 │ TTS                         │
 └──────────────┬──────────────┘
                ↓
      Python Agent Logic
                ↓
     Intent / State / Tools
                ↓
       Confidence Engine
          ↙          ↘
       RESOLVE      ESCALATE
                      ↓
                Case + Summary
                      ↓
                Human Dashboard
                      ↓
               Agora Web SDK
                      ↓
                HUMAN AGENT
                      ↓
                   CALLER
```

The project must demonstrate **Agora Conversational AI Engine as the
actual AI voice-agent layer**, not merely Agora RTC.

The core product principle remains:

> **The AI should know when it should stop being the AI.**
