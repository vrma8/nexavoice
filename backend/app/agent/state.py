from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.schemas import AgentStateSchema, ConfidenceBreakdownSchema
from app.agent.confidence import confidence_engine, ConfidenceScore


class ConversationState:
    """
    Maintains turn-by-turn conversational state, collected entities,
    pending verifications, corrections count, and confidence scores.
    """

    def __init__(self, conversation_id: str, caller_number: str = ""):
        self.conversation_id = conversation_id
        self.language: str = "hinglish"
        self.intent: Optional[str] = None
        self.caller_name: Optional[str] = None
        self.phone: Optional[str] = caller_number
        self.reference_id: Optional[str] = None
        self.problem_description: Optional[str] = None
        self.collected_entities: Dict[str, Any] = {}
        self.missing_entities: List[str] = []
        self.confirmed_entities: List[str] = []
        self.pending_confirmation_field: Optional[str] = None
        self.pending_confirmation_value: Optional[str] = None
        self.escalation_required: bool = False
        self.escalation_reason: Optional[str] = None
        self.turns_count: int = 0
        self.correction_count: int = 0
        self.actions_taken: List[str] = []
        self.last_confidence_score: ConfidenceScore = confidence_engine.calculate()

    def update_intent(self, intent: str, intent_confidence: float):
        if not self.intent or intent in ["emergency_medical", "legal_query", "financial_query", "human_escalation"]:
            self.intent = intent

        # Determine required missing entities based on intent
        if self.intent == "application_status":
            required = ["reference_id"]
        elif self.intent == "complaint_registration":
            required = ["problem_description", "caller_name"]
        else:
            required = []

        self.missing_entities = [req for req in required if req not in self.collected_entities]

    def update_entities(self, new_entities: Dict[str, Any]):
        for k, v in new_entities.items():
            if k == "reference_id":
                if self.reference_id and self.reference_id != v:
                    self.correction_count += 1
                    if "reference_id" in self.confirmed_entities:
                        self.confirmed_entities.remove("reference_id")
                self.reference_id = str(v)
                self.pending_confirmation_field = "reference_id"
                self.pending_confirmation_value = str(v)
            elif k == "caller_name":
                self.caller_name = str(v)
                self.confirmed_entities.append("caller_name")
            elif k == "phone":
                self.phone = str(v)
                self.confirmed_entities.append("phone")

            self.collected_entities[k] = v

        # Refresh missing entities
        if self.intent == "application_status":
            if "reference_id" in self.collected_entities:
                self.missing_entities = [m for m in self.missing_entities if m != "reference_id"]
        elif self.intent == "complaint_registration":
            self.missing_entities = [
                m for m in ["problem_description", "caller_name"] if m not in self.collected_entities
            ]

    def mark_field_confirmed(self, field_name: str):
        if field_name not in self.confirmed_entities:
            self.confirmed_entities.append(field_name)
        if self.pending_confirmation_field == field_name:
            self.pending_confirmation_field = None
            self.pending_confirmation_value = None

    def to_schema(self) -> AgentStateSchema:
        return AgentStateSchema(
            language=self.language,
            intent=self.intent,
            caller_name=self.caller_name,
            phone=self.phone,
            reference_id=self.reference_id,
            problem_description=self.problem_description,
            confidence_breakdown=ConfidenceBreakdownSchema(
                intent_confidence=self.last_confidence_score.intent_confidence,
                asr_confidence=self.last_confidence_score.asr_confidence,
                entity_confidence=self.last_confidence_score.entity_confidence,
                confirmation_score=self.last_confidence_score.confirmation_score,
                consistency_score=self.last_confidence_score.consistency_score,
                overall_confidence=self.last_confidence_score.overall_confidence,
                confidence_level=self.last_confidence_score.level,
            ),
            collected_entities=self.collected_entities,
            missing_entities=self.missing_entities,
            confirmed_entities=self.confirmed_entities,
            escalation_required=self.escalation_required,
            escalation_reason=self.escalation_reason,
            turns_count=self.turns_count,
            correction_count=self.correction_count,
        )
