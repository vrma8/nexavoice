# Multilingual Assistance-Line Agent

## Project Implementation Plan & AI Context Document

> **Status:** Planning / MVP Development
> **Version:** 1.0
> **Primary Languages:** Hindi, English, Hindi-English Code Switching
> **Interaction:** Normal customer-care style phone call (PSTN/telephony)
> **Primary Real-Time Platform:** Agora
> **Backend:** Python + FastAPI
> **Database:** PostgreSQL
> **Human Agent Interface:** Next.js / React
> **Target:** Hackathon Prototype

---

# 1. PROJECT OVERVIEW

## 1.1 Project Name

**Multilingual Assistance-Line Agent**

Working/demo name can be changed later.

---

## 1.2 One-Line Description

A real-time multilingual phone-based assistance agent that understands Hindi, English, and code-switched conversations, collects essential information, confirms critical details, detects uncertainty, and transfers difficult cases to a human with full conversation context.

---

# 2. PROBLEM STATEMENT

Build a real-time multilingual voice AI agent for a customer assistance, public information, or non-clinical support line.

The caller may:

* Be stressed.
* Be speaking from a noisy environment.
* Speak Hindi, English, or both.
* Switch languages during the conversation.
* Provide incomplete information.
* Correct previously provided information.
* Interrupt the agent.
* Be unable to clearly explain the problem.

The AI agent should:

* Understand the caller's intent.
* Communicate naturally in Hindi and English.
* Handle code-switching.
* Handle interruptions.
* Collect only the minimum required information.
* Ask questions in priority order.
* Repeat and confirm critical details.
* Detect when confidence is low.
* Avoid hallucinating uncertain information.
* Escalate to a human when required.
* Preserve conversation context during escalation.
* Create/update a support case.
* Provide the human agent with a concise conversation summary.

---

# 3. CORE PRODUCT IDEA

The system is a **phone-based AI assistance line**.

The caller interacts with the system through a **normal phone call**, just like calling an organization's customer-care/support number.

The caller does NOT need:

* A website.
* A mobile application.
* An Agora SDK.
* A user account.
* A special interface.

The caller simply:

1. Calls the organization's assistance/customer-care phone number.
2. The call is received through a telephony/PSTN provider.
3. The caller speaks naturally over the phone.
4. The AI voice agent listens, processes the speech, and responds through the phone.
5. If required, the AI escalates the call to a human support representative.
6. The human receives the conversation context and continues the call.

The phone call is the **primary user interface**. Agora is used behind the scenes for the real-time audio/voice-agent layer and human handoff; the caller does not directly interact with an Agora application.

The human support representative uses a web dashboard.

---

# 4. PRIMARY USE CASE

For the MVP, use a generic:

## Customer / Citizen Assistance Service

The agent can handle:

1. Application/service status
2. Complaint registration
3. General public-service information
4. Basic customer/service assistance
5. Human-agent escalation

The exact domain can be changed without redesigning the core architecture.

---

# 5. SUPPORTED LANGUAGES

## MVP

* Hindi
* English
* Hindi-English mixed speech

Examples:

### Hindi

> "Mujhe apne application ka status check karna hai."

### English

> "I want to check the status of my application."

### Code-switched

> "Mujhe apne application ka status check karna hai because it hasn't been updated."

The agent should automatically adapt to the caller's language.

Do not repeatedly ask:

> "Which language would you like?"

unless communication is genuinely unclear.

---

# 6. IMPORTANT PRODUCT REQUIREMENTS

## 6.1 Real-Time Voice

The conversation must happen through a normal phone call.

Target flow:

```text
Caller Phone
    ↓
PSTN / Telephony Provider
    ↓
SIP / Media Integration
    ↓
Agora
    ↓
Voice Agent
```

---

## 6.2 Multilingual Interaction

The agent must support:

```text
Hindi
English
Hindi → English
English → Hindi
Hindi + English mixed
```

---

## 6.3 Natural Interruptions

If the AI is speaking and the caller interrupts:

```text
AI:
"Your application is currently being..."

Caller:
"Wait, that's not my application."
```

The AI should stop its current response and process the caller's new information.

The caller should not have to wait for the AI to finish.

---

## 6.4 Information Collection

The agent should collect only information required for the current intent.

Potential information:

```text
Name
Phone number
Application ID
Order ID
Case ID
Location
Date
Problem description
```

Do not ask for unnecessary information.

---

## 6.5 Critical Information Confirmation

Important identifiers must be confirmed.

Example:

```text
Caller:
"My reference number is 5281."

AI:
"Just to confirm, your reference number is 5281, correct?"
```

Only after confirmation should the value be treated as reliable.

---

## 6.6 Low-Confidence Detection

The system must detect situations where it cannot reliably understand the caller.

Possible signals:

* Low ASR confidence.
* Unclear intent.
* Missing required entities.
* Repeated corrections.
* Background noise.
* Multiple speakers.
* Contradictory information.
* Repeated clarification attempts.

Behavior:

```text
High confidence
    ↓
Continue

Medium confidence
    ↓
Clarify / Confirm

Low confidence
    ↓
Escalate
```

---

# 7. SAFETY RESTRICTIONS

The prototype MUST NOT:

* Provide medical diagnosis.
* Replace trained emergency responders.
* Provide authoritative emergency instructions.
* Provide legal advice as authoritative guidance.
* Provide financial advice as authoritative guidance.
* Present uncertain AI-generated information as confirmed fact.
* Invent application status.
* Invent customer information.
* Invent ticket numbers.
* Guess missing information.

When uncertain:

> "I don't want to misunderstand your request. I'll connect you with a staff member."

---

# 8. HIGH-LEVEL ARCHITECTURE

```text
                         CALLER
                           │
                           │ Normal Phone Call
                           ▼
                  ┌──────────────────┐
                  │    TELEPHONY     │
                  │     PROVIDER     │
                  │                  │
                  │ Phone Number     │
                  │ Inbound Call     │
                  │ SIP / Media      │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │      AGORA       │
                  │                  │
                  │ Real-Time Audio  │
                  └────────┬─────────┘
                           │
                           ▼
             ┌────────────────────────────┐
             │     AGORA VOICE AGENT     │
             │                            │
             │ Conversation Runtime       │
             │ Turn Taking                │
             │ Interruption Handling      │
             └─────────────┬──────────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
            ASR           LLM           TTS
             │             │             │
             │             ▼             │
             │     ┌───────────────┐     │
             │     │ AGENT LOGIC   │     │
             │     │               │     │
             │     │ Intent        │     │
             │     │ State         │     │
             │     │ Confidence    │     │
             │     │ Confirmation  │     │
             │     │ Escalation    │     │
             │     └───────┬───────┘     │
             │             │             │
             └─────────────┼─────────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │     FASTAPI      │
                  │     BACKEND      │
                  └────────┬─────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          PostgreSQL    Ticketing    External APIs
              │
              ▼
       ┌─────────────────────┐
       │ HUMAN AGENT DASHBOARD│
       │                     │
       │ Transcript          │
       │ Caller information  │
       │ AI summary          │
       │ Confidence          │
       │ Case details        │
       │ JOIN CALL           │
       └──────────┬──────────┘
                  │
                  ▼
                AGORA
                  │
                  ▼
               CALLER
```

---

# 9. TECHNOLOGY STACK

## 9.0 APPLICATION LANGUAGES

Use a simple two-language application stack:

```text
AI Voice Agent + Backend  → Python
Human Agent Dashboard     → TypeScript
```

### Python

Use Python for:

* Agora AI voice-agent runtime.
* FastAPI backend.
* STT/ASR orchestration.
* LLM/conversation processing.
* TTS orchestration.
* Noise/audio-processing integration where applicable.
* Agent state.
* Confidence engine.
* Confirmation logic.
* Escalation logic.
* Telephony integration.
* PostgreSQL/SQLAlchemy.
* Case management.

### TypeScript

Use TypeScript for:

* Next.js human-agent dashboard.
* React UI.
* Agora Web SDK integration for human agents.
* Live transcript and escalation interface.

Go and Rust are **not required for the MVP**.

## 9.1 Real-Time Communication

### Agora

Agora is the primary real-time communication platform for the voice-agent layer.

Use Agora for:

* Real-time audio.
* Voice-agent communication.
* Low-latency transport.
* Agent session.
* Human-agent real-time connection.
* Optional signaling.
* Optional recording.
* Speech-to-text integration where appropriate.

---

# 10. TELEPHONY

The caller reaches the system through a **normal phone call**, similar to a typical organization customer-care number.

A normal PSTN phone call needs a telephony/PSTN layer before it can participate in the Agora real-time environment. Therefore, the system uses a telephony provider to receive the inbound call and connect its media/SIP side to the real-time voice-agent infrastructure.

Potential providers to investigate:

* Exotel
* Twilio
* Plivo
* SIP-compatible providers

Selection criteria:

```text
Inbound phone number
Inbound PSTN calling
SIP/media access
Programmatic call control
Call transfer
Caller ID
India support
Webhook support
```

IMPORTANT:

Do not assume that any provider supports direct Agora integration.

The selected provider's exact SIP/media integration must be verified before implementation.

---

# 11. AI MODEL LAYER

## 11.1 ASR

Speech-to-text converts:

```text
Caller audio
     ↓
Transcript
```

The ASR must perform well with:

* Hindi
* English
* Code-switching
* Noisy speech
* Phone-quality audio

Start with Agora-supported/managed ASR configuration.

If Hindi quality is insufficient, evaluate an external ASR provider.

---

## 11.2 LLM

The LLM handles:

* Intent detection.
* Conversation.
* Information extraction.
* Missing-information detection.
* Next-question selection.
* Confirmation.
* Tool selection.
* Escalation reasoning.
* Summary generation.

The LLM must not directly access the database.

Use a controlled tool/function layer.

---

## 11.3 TTS

Text-to-speech converts:

```text
LLM response
     ↓
Speech
```

Requirements:

* Hindi support.
* English support.
* Natural pronunciation.
* Low latency.
* Streaming if available.

Start with Agora-managed TTS where possible.

---

# 12. AGENT LOGIC

The agent follows:

```text
UNDERSTAND
     ↓
IDENTIFY INTENT
     ↓
COLLECT MINIMUM INFORMATION
     ↓
CONFIRM CRITICAL INFORMATION
     ↓
USE TOOL / PROVIDE INFORMATION
     ↓
EVALUATE RESULT
     ↓
RESOLVE OR ESCALATE
```

---

# 13. AGENT STATE

Each conversation should maintain structured state.

Example:

```json
{
  "language": "hinglish",
  "intent": "application_status",
  "caller_name": "Rahul",
  "phone": "********21",
  "reference_id": "5281",
  "problem": "Application status not updated",
  "confidence": 0.91,
  "missing_information": [],
  "confirmed_information": [
    "reference_id"
  ],
  "escalation_required": false
}
```

---

# 14. CONFIDENCE ENGINE

Do not rely entirely on the LLM's self-reported confidence.

Create an application-level confidence score.

Possible inputs:

```text
ASR confidence
Intent confidence
Entity confidence
Confirmation status
Conversation consistency
Repeated corrections
Background-noise indicators
```

Initial conceptual formula:

```text
confidence =
    0.30 * intent_confidence
  + 0.25 * asr_confidence
  + 0.20 * entity_confidence
  + 0.15 * confirmation_score
  + 0.10 * consistency_score
```

Initial thresholds:

```text
0.80 - 1.00
HIGH
Continue

0.55 - 0.79
MEDIUM
Clarify / Confirm

0.00 - 0.54
LOW
Escalate
```

These thresholds are experimental and should be tuned during testing.

---

# 15. ESCALATION ENGINE

Escalate when:

```text
Caller explicitly asks for human
OR
Confidence remains low
OR
Caller repeatedly corrects AI
OR
Background noise prevents reliable understanding
OR
Issue requires human judgment
OR
Issue is outside permitted capabilities
OR
Medical/legal/financial/emergency situation
OR
AI cannot reliably resolve the request
```

---

# 16. ESCALATION FLOW

```text
AI Conversation
      │
      ▼
Escalation Required?
      │
   ┌──┴──┐
   NO    YES
   │      │
   │      ▼
   │   Generate
   │   Handoff Summary
   │      │
   │      ▼
   │   Create Case
   │      │
   │      ▼
   │ Notify Human
   │      │
   │      ▼
   │ Human Accepts
   │      │
   │      ▼
   │ Human Joins Agora
   │      │
   │      ▼
   │ AI Stops/Mutes
   │      │
   │      ▼
   │ Human Continues
   │
   ▼
Resolve
```

---

# 17. HUMAN HANDOFF SUMMARY

The AI should generate structured context.

Example:

```json
{
  "language": "Hindi-English",
  "caller_name": "Rahul",
  "reference_id": "5281",
  "intent": "application_status",
  "summary": "Caller wants to check application status.",
  "information_collected": [
    "Caller name",
    "Reference number"
  ],
  "actions_taken": [
    "Attempted application status lookup"
  ],
  "reason_for_escalation": "Backend status unavailable",
  "confidence": 0.84,
  "missing_information": []
}
```

The caller should NOT have to repeat all previously provided information.

---

# 18. TICKETING / CASE MANAGEMENT

For the hackathon MVP, implement a simple internal case-management system rather than integrating a large enterprise platform.

Cases contain:

```text
Case ID
Conversation ID
Caller
Language
Intent
Priority
Status
Summary
Confidence
Escalation reason
Assigned human agent
Created time
Updated time
```

Possible statuses:

```text
OPEN
AI_HANDLING
WAITING_FOR_HUMAN
ASSIGNED
IN_PROGRESS
RESOLVED
CLOSED
```

---

# 19. DATABASE DESIGN

## users

```text
id
name
phone
created_at
updated_at
```

## calls

```text
id
caller_number
telephony_call_id
agora_channel
status
started_at
ended_at
```

## conversations

```text
id
call_id
language
intent
confidence
summary
started_at
ended_at
```

## messages

```text
id
conversation_id
speaker
language
transcript
timestamp
```

## cases

```text
id
conversation_id
category
priority
status
summary
confidence
escalation_reason
assigned_agent
created_at
updated_at
```

## case_details

```text
id
case_id
field_name
field_value
confirmed
created_at
```

## human_agents

```text
id
name
status
created_at
```

Possible human-agent statuses:

```text
AVAILABLE
BUSY
OFFLINE
```

---

# 20. BACKEND ARCHITECTURE

Backend responsibilities:

```text
Telephony integration
Agora integration
Voice-agent lifecycle
Conversation state
Confidence engine
Agent tools
Database
Case management
Escalation
Human-agent notifications
Handoff summary
Authentication
API
```

Recommended framework:

```text
Python
FastAPI
SQLAlchemy
PostgreSQL
Pydantic
```

Optional:

```text
Redis
```

for real-time session state / temporary state.

---

# 21. BACKEND FOLDER STRUCTURE

```text
backend/
│
├── app/
│   ├── main.py
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── calls.py
│   │   │   ├── cases.py
│   │   │   ├── tickets.py
│   │   │   ├── escalation.py
│   │   │   └── health.py
│   │   └── dependencies.py
│   │
│   ├── agora/
│   │   ├── client.py
│   │   ├── voice_agent.py
│   │   ├── tokens.py
│   │   └── events.py
│   │
│   ├── telephony/
│   │   ├── provider.py
│   │   ├── webhooks.py
│   │   └── call_router.py
│   │
│   ├── agent/
│   │   ├── system_prompt.py
│   │   ├── orchestrator.py
│   │   ├── state.py
│   │   ├── intent.py
│   │   ├── confidence.py
│   │   ├── confirmation.py
│   │   ├── escalation.py
│   │   └── summarizer.py
│   │
│   ├── tools/
│   │   ├── application.py
│   │   ├── customer.py
│   │   ├── ticket.py
│   │   └── escalation.py
│   │
│   ├── models/
│   │   ├── user.py
│   │   ├── call.py
│   │   ├── conversation.py
│   │   ├── message.py
│   │   ├── case.py
│   │   └── human_agent.py
│   │
│   ├── schemas/
│   │   ├── call.py
│   │   ├── case.py
│   │   ├── agent.py
│   │   └── escalation.py
│   │
│   ├── database/
│   │   ├── connection.py
│   │   ├── migrations/
│   │   └── seed.py
│   │
│   └── services/
│       ├── call_service.py
│       ├── case_service.py
│       ├── ticket_service.py
│       └── summary_service.py
│
├── tests/
├── requirements.txt
└── Dockerfile
```

---

# 22. HUMAN DASHBOARD

The dashboard is for support staff.

The caller does NOT use this interface.

Recommended stack:

```text
Next.js
React
TypeScript
Tailwind CSS
Agora Web SDK
```

Dashboard sections:

```text
Active Calls
Escalations
Cases
Call History
Human Agent Status
```

---

# 23. HUMAN CALL SCREEN

Example:

```text
┌─────────────────────────────────────────────┐
│ INCOMING ESCALATION                         │
├─────────────────────────────────────────────┤
│ Caller: Rahul                               │
│ Phone: +91 XXXXXXXX21                       │
│ Language: Hindi + English                   │
│                                             │
│ Intent: Application Status                  │
│ Confidence: 38%                             │
│                                             │
│ SUMMARY                                     │
│ Caller wants to check application status.  │
│ Reference number could not be confirmed.   │
│ Background noise affected understanding.   │
│                                             │
│ REASON                                     │
│ Low confidence                              │
│                                             │
│ [ JOIN CALL ]                               │
└─────────────────────────────────────────────┘
```

---

# 24. LIVE TRANSCRIPT

The human dashboard should display:

```text
[16:21:04] Caller:
Mujhe apne application ka status check karna tha.

[16:21:07] AI:
Sure. Aapka reference number kya hai?

[16:21:11] Caller:
It's 5281.

[16:21:14] AI:
Just to confirm, 5281?

[16:21:16] Caller:
Yes.
```

---

# 25. HUMAN TAKEOVER

Preferred MVP architecture:

```text
Caller
   │
   │ Normal phone call
   ▼
Telephony / PSTN
   │
   ▼
Agora
   │
   ├── AI Voice Agent
   │
   └── Human Agent (Web Dashboard)
```

When escalation occurs:

```text
AI
 ↓
Create Case
 ↓
Human notified
 ↓
Human clicks JOIN CALL
 ↓
Human joins Agora session
 ↓
AI stops speaking / leaves
 ↓
Human continues conversation
```

This means:

```text
Caller = Normal Phone
Human = Web Dashboard + Headset
```

A phone-to-phone human transfer is a separate, more complicated telephony requirement and is not necessary for the MVP unless explicitly required.

---

# 26. AGORA RESPONSIBILITIES

Use Agora for:

* Real-time audio transport.
* Voice Agent runtime.
* Agent session.
* Low-latency communication.
* Audio interruption/turn-taking support.
* Human agent real-time connection.
* Optional signaling.
* Optional recording.
* Speech-to-text integrations.

Do not put business logic inside Agora-specific code.

---

# 27. TELEPHONY RESPONSIBILITIES

Telephony provider handles:

```text
Phone number
Inbound PSTN call
Caller ID
Call routing
SIP/media
Call transfer where supported
Call lifecycle
```

Potential providers:

```text
Exotel
Twilio
Plivo
SIP providers
```

Provider selection must be based on confirmed support for:

```text
India
Inbound calls
SIP/media integration
Programmatic call control
```

## 10.1 END-TO-END PHONE CALL FLOW

```text
Caller
  │
  │ Normal phone call
  ▼
Telephony / PSTN Provider
  │
  │ SIP / Media
  ▼
Agora Real-Time Layer
  │
  ▼
AI Voice Agent
  │
  ├── Speech-to-Text (STT / ASR)
  │
  ├── Conversation / LLM processing
  │
  ├── Intent + state + confidence
  │
  ├── Noise suppression / audio processing
  │
  └── Text-to-Speech (TTS)
  │
  ▼
Agora
  │
  ▼
Caller hears AI response
```

The caller experiences this as a single normal phone conversation. The STT, AI processing, noise suppression, TTS, confidence evaluation, and escalation logic operate behind the phone interface.

If human escalation is required:

```text
AI Voice Agent
      │
      ▼
Create Case + Handoff Summary
      │
      ▼
Human Agent Dashboard
      │
      ▼
Human Agent Joins Agora Session
      │
      ▼
AI Stops / Mutes
      │
      ▼
Human Continues With Caller
```


---

# 28. EXTERNAL SERVICES

Expected external dependencies:

## Required

```text
Agora
Telephony/PSTN provider
LLM provider
ASR provider OR Agora-managed ASR
TTS provider OR Agora-managed TTS
PostgreSQL
```

## Optional

```text
Redis
External ticketing system
Cloud storage
Monitoring service
Cloud Recording
```

---

# 29. ENVIRONMENT VARIABLES

Never commit actual secrets.

Required configuration will approximately include:

```env
# Agora
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=

# AI
OPENAI_API_KEY=

# Telephony
TELEPHONY_API_KEY=
TELEPHONY_API_SECRET=
TELEPHONY_PHONE_NUMBER=

# Database
DATABASE_URL=

# Redis - optional
REDIS_URL=

# Application
ENVIRONMENT=development
LOG_LEVEL=INFO
```

Actual variables depend on the selected providers.

---

# 30. API DESIGN

## Call APIs

```http
POST /api/calls/incoming
```

Handle inbound telephony webhook.

---

```http
POST /api/calls/{call_id}/start-agent
```

Start AI agent.

---

```http
POST /api/calls/{call_id}/end
```

End call/session.

---

## Case APIs

```http
POST /api/cases
```

Create case.

---

```http
GET /api/cases
```

List cases.

---

```http
GET /api/cases/{case_id}
```

Get case.

---

```http
PATCH /api/cases/{case_id}
```

Update case.

---

## Escalation APIs

```http
POST /api/cases/{case_id}/escalate
```

Escalate case.

---

```http
POST /api/cases/{case_id}/accept
```

Human accepts case.

---

```http
POST /api/calls/{call_id}/transfer
```

Trigger human handoff.

---

## Transcript

```http
GET /api/calls/{call_id}/transcript
```

Get transcript.

---

# 31. AGENT TOOLS

The LLM should interact with controlled tools.

Example:

```text
check_application_status(reference_id)
```

```text
create_ticket(category, summary)
```

```text
get_customer(phone)
```

```text
update_case(case_id, data)
```

```text
escalate_to_human(reason)
```

```text
generate_handoff_summary(conversation)
```

The LLM should never directly execute SQL.

---

# 32. SYSTEM PROMPT BEHAVIOR

The agent must follow:

```text
Be calm.
Be concise.
Speak naturally.
Use Hindi/English according to caller.
Handle code switching.
Ask one question at a time.
Collect minimum information.
Confirm critical information.
Never guess.
Never hallucinate.
Escalate when uncertain.
Preserve context.
```

Detailed system prompt should be maintained in:

```text
backend/app/agent/system_prompt.py
```

---

# 33. EXAMPLE END-TO-END CALL

## Step 1

Caller:

> "Hello, mujhe apne application ka status check karna tha."

Agent:

> "Sure. Aapka application reference number kya hai?"

---

## Step 2

Caller:

> "5281."

Agent:

> "Just to confirm, your reference number is 5281, correct?"

---

## Step 3

Caller:

> "Yes."

Agent calls:

```text
check_application_status("5281")
```

---

## Step 4

Backend returns:

```json
{
  "status": "processing",
  "last_updated": "2026-08-27"
}
```

Agent:

> "Your application is still being processed and was last updated on August 27."

---

# 34. LOW-CONFIDENCE EXAMPLE

Caller:

> "Mera woh application... jo office mein... actually..."

Background noise is present.

Agent:

> "I'm having a little trouble understanding. Could you briefly tell me what you need help with?"

Caller remains unclear.

Agent:

> "I don't want to misunderstand your request. I'll connect you with a staff member."

System:

```text
confidence = 0.38
escalation_reason = low_confidence
```

Case is created.

Human dashboard receives summary.

---

# 35. INTERRUPTION EXAMPLE

AI:

> "Your application is currently being processed and—"

Caller:

> "No, wait! That's the wrong application."

AI immediately stops.

AI:

> "Understood. Let's verify the reference number again."

---

# 36. CORRECTION EXAMPLE

Caller:

> "Reference number is 5281."

Agent:

> "Just to confirm, 5281?"

Caller:

> "No, sorry. It's 5821."

Agent:

> "Got it. I'll use 5821."

State is updated:

```text
reference_id = 5821
confirmed = false
```

Agent should reconfirm if necessary.

---

# 37. BACKGROUND NOISE EXAMPLE

Caller:

> "My application number is..."

ASR is uncertain.

Agent:

> "I'm having trouble hearing the reference number. Could you repeat just the number?"

If successful:

Continue.

If unsuccessful:

Escalate.

---

# 38. MEDICAL SAFETY EXAMPLE

Caller:

> "Mujhe chest pain ho raha hai, kya medicine loon?"

Agent must NOT diagnose or prescribe.

Response:

> "I can't diagnose or provide medical treatment advice. I'll connect you with qualified human support."

The exact emergency response must be defined by the deployment environment and must not be fabricated by the AI.

---

# 39. LEGAL SAFETY EXAMPLE

Caller:

> "Can I legally file this complaint?"

Agent:

> "I can't provide legal advice. I'll connect you with someone qualified to assist."

---

# 40. FINANCIAL SAFETY EXAMPLE

Caller:

> "Should I invest my money in this?"

Agent:

> "I can't provide financial advice. I can connect you with someone who can assist."

---

# 41. DEVELOPMENT PHASES

# Phase 0 — Requirements

Tasks:

* Finalize use case.
* Finalize supported languages.
* Select telephony provider.
* Verify telephony → SIP/media compatibility.
* Create Agora project.
* Create AI provider accounts.
* Define MVP features.

Deliverable:

```text
Confirmed architecture
```

---

# Phase 1 — Agora Voice Agent

Goal:

Get a basic voice agent working.

```text
Audio
 ↓
Agora
 ↓
Voice Agent
 ↓
ASR
 ↓
LLM
 ↓
TTS
 ↓
Audio
```

Do not implement ticketing yet.

Success criteria:

* Agent can hear caller.
* Agent can respond.
* Conversation is real-time.

---

# Phase 2 — Phone Integration

Goal:

Caller can dial a real phone number.

```text
Phone
 ↓
Telephony
 ↓
Agora
 ↓
Voice Agent
```

Success criteria:

* Incoming call works.
* Caller audio reaches agent.
* Agent audio reaches caller.

This phase is a critical technical milestone.

---

# Phase 3 — Hindi / English

Implement:

* Hindi speech.
* English speech.
* Code switching.
* Language-aware responses.

Test:

```text
Hindi
English
Hinglish
Hindi → English
English → Hindi
```

---

# Phase 4 — Agent State

Implement:

```text
intent
language
entities
missing_information
confirmed_information
conversation_state
```

---

# Phase 5 — Agent Tools

Implement:

```text
application status
customer lookup
ticket creation
case update
```

Initially use mock database data.

---

# Phase 6 — Confidence Engine

Implement:

```text
ASR confidence
intent confidence
entity confidence
confirmation
consistency
```

Create thresholds.

Test with:

* Clear speech.
* Ambiguous speech.
* Noise.
* Corrections.
* Missing data.

---

# Phase 7 — Case Management

Implement PostgreSQL models.

Create:

```text
users
calls
conversations
messages
cases
case_details
human_agents
```

---

# Phase 8 — Human Dashboard

Build:

```text
Login
Active Calls
Escalations
Case List
Call Details
Live Transcript
Summary
Confidence
Join Call
```

---

# Phase 9 — Human Escalation

Implement:

```text
AI
 ↓
Escalation
 ↓
Case
 ↓
Human notification
 ↓
Human joins
 ↓
AI stops
```

---

# Phase 10 — Context Preservation

Human should receive:

```text
Caller
Language
Intent
Reference ID
Collected information
Summary
Actions taken
Reason for escalation
Transcript
```

---

# Phase 11 — Testing

Test:

```text
Normal call
Hindi call
English call
Hinglish call
Language switching
Noise
Interruptions
Corrections
Missing information
Repeated information
Low confidence
Human escalation
Human takeover
Ticket creation
Backend failure
ASR failure
LLM failure
TTS failure
Telephony failure
```

---

# Phase 12 — Performance Optimization

Measure:

```text
ASR latency
LLM latency
TTS latency
Total response latency
Time to first response
Escalation rate
Confidence
```

Optimize for natural conversation.

---

# 42. MVP DEFINITION

The MVP is complete when:

* [ ] Caller can dial a real phone number.
* [ ] Call reaches the AI.
* [ ] AI responds through phone audio.
* [ ] Hindi works.
* [ ] English works.
* [ ] Hindi-English code switching works.
* [ ] AI handles interruptions.
* [ ] AI asks prioritized questions.
* [ ] AI confirms critical information.
* [ ] AI detects low-confidence scenarios.
* [ ] AI does not hallucinate missing information.
* [ ] AI creates a case.
* [ ] Human dashboard receives escalation.
* [ ] Human sees summary.
* [ ] Human can join the call.
* [ ] AI stops/mutes during human takeover.
* [ ] Conversation context is preserved.

---

# 43. POST-MVP FEATURES

Do NOT prioritize these until MVP works:

```text
More Indian languages
Voice biometrics
Advanced sentiment analysis
Automatic priority scoring
External CRM integrations
WhatsApp integration
SMS follow-up
Analytics dashboard
Call recording
Automatic QA
Agent performance analytics
Multilingual translation
Multiple human departments
AI-generated case categorization
```

---

# 44. POSSIBLE FUTURE LANGUAGES

Architecture should eventually support:

```text
Hindi
English
Bengali
Tamil
Telugu
Marathi
Gujarati
Kannada
Malayalam
Punjabi
Odia
Assamese
```

Do not implement all of these during MVP.

---

# 45. SECURITY REQUIREMENTS

Never expose:

```text
Agora App Certificate
API keys
Database credentials
Telephony credentials
LLM credentials
Private tokens
```

Use:

```text
.env
```

and commit:

```text
.env.example
```

Use short-lived Agora tokens where applicable.

---

# 46. PRIVACY

Only collect information necessary for the service.

Avoid storing unnecessary:

* Personal information.
* Sensitive information.
* Raw audio.
* Full call recordings.

If recordings/transcripts are stored:

* Define retention.
* Restrict access.
* Protect database.
* Inform users according to the deployment's privacy requirements.

---

# 47. OBSERVABILITY

Log important events:

```text
CALL_STARTED
CALL_ENDED
AGENT_STARTED
AGENT_STOPPED
TRANSCRIPT_RECEIVED
INTENT_DETECTED
TOOL_CALLED
CONFIDENCE_CHANGED
ESCALATION_TRIGGERED
CASE_CREATED
HUMAN_JOINED
HUMAN_TAKEOVER
```

Never log secrets.

Avoid unnecessarily logging sensitive caller information.

---

# 48. FAILURE HANDLING

## ASR Failure

Response:

> "I'm having trouble hearing you. I'll connect you with a staff member."

---

## LLM Failure

Fallback:

```text
Escalate to human
```

---

## TTS Failure

Fallback:

```text
Escalate / terminate gracefully
```

---

## Backend Failure

Do not fabricate results.

Response:

> "I'm unable to confirm that information right now. I'll connect you with a staff member."

---

## Telephony Failure

Log failure and provide appropriate fallback according to provider capabilities.

---

# 49. TESTING STRATEGY

## Unit Tests

Test:

```text
confidence.py
intent.py
state.py
confirmation.py
escalation.py
summarizer.py
```

---

## Integration Tests

Test:

```text
Telephony → Agora
Agora → Agent
Agent → Backend
Backend → Database
Escalation → Dashboard
Dashboard → Agora
```

---

## Voice Tests

Test:

```text
Hindi
English
Hinglish
Noise
Fast speech
Slow speech
Interruptions
Corrections
Multiple speakers
Incomplete sentences
```

---

# 50. DEMO SCRIPT

The final hackathon demo should intentionally demonstrate the problem.

## Demo 1 — Normal call

Caller:

> "Mujhe apne application ka status check karna tha."

AI identifies intent and asks for reference number.

---

## Demo 2 — Code switching

Caller:

> "Actually status update nahi hua, and I submitted it last week."

AI naturally continues in Hinglish/English.

---

## Demo 3 — Confirmation

Caller gives reference number.

AI repeats and confirms it.

---

## Demo 4 — Interruption

AI starts speaking.

Caller interrupts.

AI stops and listens.

---

## Demo 5 — Background noise

Caller provides unclear information.

AI requests a focused repetition.

---

## Demo 6 — Low confidence

Information remains unclear.

AI escalates.

---

## Demo 7 — Human handoff

Dashboard immediately shows:

```text
Caller
Language
Intent
Confidence
Summary
Collected information
Missing information
Escalation reason
```

Human clicks:

```text
JOIN CALL
```

Human continues the conversation.

Caller does not need to repeat everything.

---

# 51. JUDGING / PRESENTATION POINTS

The project should emphasize:

## Real-time

Agora provides low-latency voice communication.

## Multilingual

Hindi + English + code switching.

## Natural interaction

No DTMF menu.

## Robustness

Works with:

* Noise.
* Interruptions.
* Corrections.
* Incomplete information.

## Safety

AI does not guess.

## Confidence-aware

AI knows when it is uncertain.

## Human-in-the-loop

AI escalates rather than pretending.

## Context preservation

Human receives the conversation summary.

## Practicality

The caller only needs a phone.

---

# 52. CORE DIFFERENTIATOR

The project is NOT simply:

```text
Phone
 ↓
Chatbot
```

It is:

```text
Phone
 ↓
Real-Time Multilingual Agent
 ↓
Understands
 ↓
Collects
 ↓
Confirms
 ↓
Evaluates Confidence
 ↓
Resolves
       OR
Escalates
 ↓
Human Receives Context
```

The key product principle is:

> **The AI should know when it should stop being the AI.**

---

# 53. REPOSITORY STRUCTURE

```text
multilingual-assistance-agent/
│
├── README.md
├── PLAN.md
├── LICENSE
├── .gitignore
├── .env.example
├── docker-compose.yml
│
├── docs/
│   ├── architecture.md
│   ├── call-flow.md
│   ├── escalation-flow.md
│   ├── api.md
│   └── demo-script.md
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── agora/
│   │   ├── telephony/
│   │   ├── agent/
│   │   ├── tools/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── database/
│   │   └── services/
│   │
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── dashboard/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── Dockerfile
│
├── shared/
│   ├── schemas/
│   └── constants/
│
├── scripts/
│   ├── start-dev.sh
│   ├── seed-db.py
│   └── test-call.py
│
└── infrastructure/
    ├── docker/
    └── nginx/
```

---

# 54. GIT / DEVELOPMENT WORKFLOW

Recommended branches:

```text
main
develop

feature/agora-integration
feature/telephony
feature/agent-logic
feature/confidence
feature/dashboard
feature/escalation
feature/database
```

Use pull requests.

Each feature should include:

```text
Implementation
Tests
Documentation
```

Do not commit directly to `main` during team development.

---

# 55. AI DEVELOPMENT RULES

Any AI coding assistant working on this repository MUST:

1. Read `PLAN.md` before modifying architecture.
2. Preserve existing architecture unless explicitly asked to change it.
3. Avoid introducing unnecessary dependencies.
4. Never hardcode API keys.
5. Never expose secrets.
6. Never modify the telephony provider without checking its integration assumptions.
7. Keep Agora-specific code inside `backend/app/agora/`.
8. Keep telephony-specific code inside `backend/app/telephony/`.
9. Keep business logic outside provider-specific modules.
10. Use controlled tools for database/API operations.
11. Never allow the LLM to execute raw SQL.
12. Add tests for non-trivial logic.
13. Update documentation when architecture changes.
14. Do not remove safety restrictions.
15. Do not invent unsupported Agora APIs.
16. Verify external API behavior against current documentation before implementation.
17. Prefer small incremental changes over large rewrites.

---

# 56. AI TASK EXECUTION PROTOCOL

Before implementing a feature:

```text
1. Read PLAN.md
2. Identify affected components
3. Check existing implementation
4. Check relevant provider/API documentation
5. Propose implementation
6. Implement smallest working change
7. Add/update tests
8. Run tests
9. Update documentation
10. Report what changed
```

---

# 57. CURRENT IMPLEMENTATION STATUS

Update this section continuously.

```text
[ ] Project repository created
[ ] Environment configuration
[ ] Agora project configured
[ ] Telephony provider selected
[ ] Telephony number obtained
[ ] PSTN → SIP/media integration verified
[ ] Basic Agora Voice Agent working
[ ] Phone → Agora working
[ ] Hindi ASR working
[ ] English ASR working
[ ] Code switching working
[ ] TTS working
[ ] System prompt implemented
[ ] Agent state implemented
[ ] Intent detection implemented
[ ] Confidence engine implemented
[ ] Confirmation logic implemented
[ ] Application lookup tool implemented
[ ] Ticket creation implemented
[ ] PostgreSQL implemented
[ ] Case management implemented
[ ] Escalation implemented
[ ] Human dashboard implemented
[ ] Live transcript implemented
[ ] Human joins call
[ ] AI takeover → human takeover working
[ ] Context preservation working
[ ] Noise testing completed
[ ] Interruption testing completed
[ ] Safety testing completed
[ ] End-to-end demo completed
```

---

# 58. MVP PRIORITY

When time is limited, implement in this order:

```text
P0 — MUST HAVE

1. Phone call
2. Agora real-time audio
3. Voice Agent
4. Hindi/English
5. Basic conversation
6. Information collection
7. Confirmation
8. Low-confidence escalation
9. Human dashboard
10. Human takeover
11. Context summary
```

Then:

```text
P1 — IMPORTANT

12. Ticketing
13. PostgreSQL
14. Live transcript
15. Noise robustness
16. Interruption optimization
17. Metrics
```

Then:

```text
P2 — NICE TO HAVE

18. More languages
19. External CRM
20. Recording
21. Analytics
22. SMS/WhatsApp follow-up
23. Advanced sentiment analysis
```

---

# 59. DEFINITION OF DONE

The project is considered complete for the hackathon when a judge can:

```text
1. Call the phone number.
2. Speak Hindi.
3. Switch to English.
4. Ask for assistance.
5. Provide incomplete information.
6. Correct information.
7. Interrupt the AI.
8. Create a noisy environment.
9. Cause the AI to become uncertain.
10. See the AI escalate.
11. See the case appear on the dashboard.
12. See the conversation summary.
13. Click JOIN CALL.
14. Continue speaking with a human.
15. Verify that the caller does not need to repeat the entire problem.
```

---

# 60. FINAL SYSTEM PRINCIPLE

The system should optimize for:

```text
SAFETY
   >
ACCURACY
   >
CONTEXT
   >
USER EXPERIENCE
   >
SPEED
```

When uncertain:

```text
DO NOT GUESS
       ↓
CLARIFY
       ↓
IF STILL UNCERTAIN
       ↓
ESCALATE
```

The ultimate goal is not to replace human support.

The goal is to make the first interaction faster, more accessible, multilingual, and more reliable while ensuring that humans can take over whenever AI confidence or capability is insufficient.
