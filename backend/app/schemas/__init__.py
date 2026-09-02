import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class MessageSchema(BaseModel):
    id: Optional[str] = None
    speaker: str  # CALLER, AI, HUMAN
    language: str = "hinglish"
    transcript: str
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)


class ConfidenceBreakdownSchema(BaseModel):
    intent_confidence: float = 1.0
    asr_confidence: float = 1.0
    entity_confidence: float = 1.0
    confirmation_score: float = 1.0
    consistency_score: float = 1.0
    overall_confidence: float = 1.0
    confidence_level: str = "HIGH"  # HIGH, MEDIUM, LOW


class AgentStateSchema(BaseModel):
    language: str = "hinglish"
    intent: Optional[str] = None
    caller_name: Optional[str] = None
    phone: Optional[str] = None
    reference_id: Optional[str] = None
    problem_description: Optional[str] = None
    confidence_breakdown: ConfidenceBreakdownSchema = Field(default_factory=ConfidenceBreakdownSchema)
    collected_entities: Dict[str, Any] = Field(default_factory=dict)
    missing_entities: List[str] = Field(default_factory=list)
    confirmed_entities: List[str] = Field(default_factory=list)
    escalation_required: bool = False
    escalation_reason: Optional[str] = None
    turns_count: int = 0
    correction_count: int = 0


class CaseDetailSchema(BaseModel):
    field_name: str
    field_value: str
    confirmed: bool = False


class HandoffSummary(BaseModel):
    language: str
    caller_name: Optional[str] = None
    phone: Optional[str] = None
    reference_id: Optional[str] = None
    intent: Optional[str] = None
    summary: str
    information_collected: List[str] = Field(default_factory=list)
    missing_information: List[str] = Field(default_factory=list)
    actions_taken: List[str] = Field(default_factory=list)
    reason_for_escalation: str
    confidence: float
    confidence_level: str


class CaseCreate(BaseModel):
    conversation_id: str
    category: str = "general_assistance"
    priority: str = "MEDIUM"
    summary: Optional[str] = None
    confidence: float = 1.0
    escalation_reason: Optional[str] = None
    details: Optional[List[CaseDetailSchema]] = None


class CaseUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    summary: Optional[str] = None


class CaseResponse(BaseModel):
    id: str
    conversation_id: str
    category: str
    priority: str
    status: str
    summary: Optional[str]
    confidence: float
    escalation_reason: Optional[str]
    assigned_agent_id: Optional[str]
    assigned_agent_name: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    details: List[CaseDetailSchema] = []
    handoff_summary: Optional[HandoffSummary] = None

    model_config = {"from_attributes": True}


class IncomingCallRequest(BaseModel):
    caller_number: str = "+919876543210"
    telephony_call_id: Optional[str] = None
    agora_channel: Optional[str] = None


class ProcessTurnRequest(BaseModel):
    call_id: str
    user_transcript: str
    language: Optional[str] = None  # hindi, english, hinglish, or auto-detect
    asr_confidence: float = 0.95
    has_background_noise: bool = False
    is_interruption: bool = False


class ProcessTurnResponse(BaseModel):
    call_id: str
    ai_response_text: str
    language_used: str
    intent_detected: Optional[str]
    confidence_breakdown: ConfidenceBreakdownSchema
    state: AgentStateSchema
    escalation_triggered: bool
    escalation_reason: Optional[str]
    created_case_id: Optional[str]
    handoff_summary: Optional[HandoffSummary]


class CallResponse(BaseModel):
    id: str
    caller_number: str
    telephony_call_id: Optional[str]
    agora_channel: str
    status: str
    started_at: datetime.datetime
    ended_at: Optional[datetime.datetime]
    current_conversation_id: Optional[str] = None
    latest_confidence: Optional[float] = 1.0
    latest_intent: Optional[str] = None
    case_id: Optional[str] = None

    model_config = {"from_attributes": True}


class AgoraTokenRequest(BaseModel):
    channel_name: str
    uid: int = 0
    role: str = "publisher"  # publisher or subscriber


class AgoraTokenResponse(BaseModel):
    token: str
    channel_name: str
    uid: int
    app_id: str
    expires_in: int
