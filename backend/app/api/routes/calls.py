import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.connection import get_db
from app.models import Call, Conversation, Message, Case
from app.schemas import (
    IncomingCallRequest,
    CallResponse,
    ProcessTurnRequest,
    ProcessTurnResponse,
    MessageSchema,
)
from app.agent.orchestrator import orchestrator
from app.agora.tokens import generate_agora_rtc_token
from app.agora.voice_agent import agora_session_manager
from app.telephony.provider import get_telephony_provider
from app.services.live_events import live_event_manager
from app.config import settings

router = APIRouter(prefix="/calls", tags=["Calls"])


@router.post("/incoming", response_model=CallResponse)
async def handle_incoming_call(
    request: IncomingCallRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle inbound phone call webhook from telephony provider (or simulator).
    Creates Call and initial Conversation records.
    """
    provider = get_telephony_provider(settings.TELEPHONY_PROVIDER)
    tel_res = await provider.handle_inbound_call(request.model_dump())

    call = Call(
        caller_number=tel_res["caller_number"],
        telephony_call_id=tel_res["telephony_call_id"],
        agora_channel=tel_res["agora_channel"],
        status="AI_HANDLING",
    )
    db.add(call)
    await db.flush()

    conv = Conversation(
        call_id=call.id,
        language="hinglish",
        confidence=1.0,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(call)

    # Initialize Agora voice agent session
    agora_session_manager.get_or_create(call.agora_channel, call.id)

    # Broadcast event to human agent dashboard
    await live_event_manager.broadcast("CALL_STARTED", {
        "call_id": call.id,
        "caller_number": call.caller_number,
        "agora_channel": call.agora_channel,
        "status": call.status,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    })

    return CallResponse(
        id=call.id,
        caller_number=call.caller_number,
        telephony_call_id=call.telephony_call_id,
        agora_channel=call.agora_channel,
        status=call.status,
        started_at=call.started_at,
        ended_at=call.ended_at,
        current_conversation_id=conv.id,
        latest_confidence=conv.confidence,
    )


@router.get("/active", response_model=List[CallResponse])
async def list_active_calls(db: AsyncSession = Depends(get_db)):
    """
    Get all active/ongoing calls for live dashboard monitoring.
    """
    res = await db.execute(
        select(Call).where(Call.status.in_(["IN_PROGRESS", "AI_HANDLING", "WAITING_FOR_HUMAN", "HUMAN_IN_CALL"])).order_by(Call.started_at.desc())
    )
    calls = res.scalars().all()
    results = []
    for c in calls:
        conv_res = await db.execute(
            select(Conversation).where(Conversation.call_id == c.id).order_by(Conversation.started_at.desc())
        )
        conv = conv_res.scalars().first()
        results.append(
            CallResponse(
                id=c.id,
                caller_number=c.caller_number,
                telephony_call_id=c.telephony_call_id,
                agora_channel=c.agora_channel,
                status=c.status,
                started_at=c.started_at,
                ended_at=c.ended_at,
                current_conversation_id=conv.id if conv else None,
                latest_confidence=conv.confidence if conv else 1.0,
                latest_intent=conv.intent if conv else None,
            )
        )
    return results


@router.post("/process-turn", response_model=ProcessTurnResponse)
async def process_turn(
    request: ProcessTurnRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Process a single speech turn from the caller or simulator.
    """
    response = await orchestrator.process_turn(
        db=db,
        call_id=request.call_id,
        user_transcript=request.user_transcript,
        language_override=request.language,
        asr_confidence=request.asr_confidence,
        has_background_noise=request.has_background_noise,
        is_interruption=request.is_interruption,
    )

    # Broadcast turn and transcript to human dashboard
    await live_event_manager.broadcast("TRANSCRIPT_UPDATE", {
        "call_id": request.call_id,
        "caller_transcript": request.user_transcript,
        "ai_response": response.ai_response_text,
        "language": response.language_used,
        "intent": response.intent_detected,
        "confidence": response.confidence_breakdown.dict(),
        "escalation_triggered": response.escalation_triggered,
        "escalation_reason": response.escalation_reason,
        "case_id": response.created_case_id,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    })

    if response.escalation_triggered:
        await live_event_manager.broadcast("ESCALATION_TRIGGERED", {
            "call_id": request.call_id,
            "case_id": response.created_case_id,
            "reason": response.escalation_reason,
            "handoff_summary": response.handoff_summary.dict() if response.handoff_summary else None,
            "timestamp": datetime.datetime.utcnow().isoformat(),
        })

    return response


@router.get("/{call_id}/transcript")
async def get_call_transcript(
    call_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve full transcript of messages for a call.
    """
    call_res = await db.execute(select(Call).where(Call.id == call_id))
    call = call_res.scalars().first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    conv_res = await db.execute(
        select(Conversation).where(Conversation.call_id == call_id).order_by(Conversation.started_at.desc())
    )
    conv = conv_res.scalars().first()
    if not conv:
        return {"call_id": call_id, "messages": [], "conversation": None}

    msg_res = await db.execute(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.timestamp.asc())
    )
    messages = msg_res.scalars().all()

    return {
        "call_id": call.id,
        "caller_number": call.caller_number,
        "agora_channel": call.agora_channel,
        "status": call.status,
        "conversation": {
            "id": conv.id,
            "language": conv.language,
            "intent": conv.intent,
            "confidence": conv.confidence,
            "summary": conv.summary,
            "collected_entities": conv.collected_entities,
            "confirmed_entities": conv.confirmed_entities,
        },
        "messages": [
            {
                "id": m.id,
                "speaker": m.speaker,
                "language": m.language,
                "transcript": m.transcript,
                "timestamp": m.timestamp.isoformat(),
            }
            for m in messages
        ],
    }


@router.post("/{call_id}/transfer")
async def transfer_call_to_human(
    call_id: str,
    human_agent_id: Optional[str] = "agent_human_1",
    db: AsyncSession = Depends(get_db),
):
    """
    Take over call: human support agent joins Agora audio bridge.
    AI voice is automatically muted and stops speaking (Section 25).
    """
    call_res = await db.execute(select(Call).where(Call.id == call_id))
    call = call_res.scalars().first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    call.status = "HUMAN_IN_CALL"

    # Mute AI in Agora session
    session = agora_session_manager.get_or_create(call.agora_channel, call.id)
    session.human_join(human_agent_id or "agent_human_1")

    # Generate Agora RTC join token for the human agent
    token = generate_agora_rtc_token(call.agora_channel, uid=999, role="publisher")

    # Add handoff system message
    conv_res = await db.execute(
        select(Conversation).where(Conversation.call_id == call_id).order_by(Conversation.started_at.desc())
    )
    conv = conv_res.scalars().first()
    if conv:
        handoff_msg = Message(
            conversation_id=conv.id,
            speaker="HUMAN",
            language="english",
            transcript="[Human Support Officer joined the call. AI Voice Agent muted.]",
        )
        db.add(handoff_msg)

    await db.commit()

    # Broadcast takeover event to all connected dashboard clients
    await live_event_manager.broadcast("HUMAN_TAKEOVER", {
        "call_id": call.id,
        "agora_channel": call.agora_channel,
        "human_agent_id": human_agent_id,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    })

    return {
        "status": "success",
        "call_id": call.id,
        "agora_channel": call.agora_channel,
        "token": token,
        "uid": 999,
        "app_id": settings.AGORA_APP_ID,
        "message": "Human agent successfully bridged into call. AI muted.",
    }


@router.post("/{call_id}/end")
async def end_call(
    call_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    End the active call session and finalize records.
    """
    call_res = await db.execute(select(Call).where(Call.id == call_id))
    call = call_res.scalars().first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    call.status = "COMPLETED"
    call.ended_at = datetime.datetime.utcnow()
    await db.commit()

    await live_event_manager.broadcast("CALL_ENDED", {
        "call_id": call.id,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    })

    return {"status": "success", "call_id": call.id, "message": "Call ended successfully"}
