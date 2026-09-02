import datetime
from typing import Dict, Any, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Call, Conversation, Message, Case, CaseDetail
from app.agent.intent import intent_classifier
from app.agent.confidence import confidence_engine, ConfidenceScore
from app.agent.confirmation import confirmation_engine
from app.agent.escalation import escalation_engine
from app.agent.state import ConversationState
from app.agent.summarizer import summarizer
from app.tools import check_application_status, create_ticket
from app.schemas import ProcessTurnResponse, ConfidenceBreakdownSchema


class AgentOrchestrator:
    """
    Main dialogue orchestrator for the multilingual voice agent.
    Coordinates language detection, intent parsing, entity confirmation,
    confidence scoring, tool execution, and escalation handoffs.
    """

    def __init__(self):
        # In-memory active conversation states keyed by conversation_id
        self._active_states: Dict[str, ConversationState] = {}

    def get_or_create_state(self, conversation_id: str, caller_number: str = "") -> ConversationState:
        if conversation_id not in self._active_states:
            self._active_states[conversation_id] = ConversationState(conversation_id, caller_number)
        return self._active_states[conversation_id]

    async def process_turn(
        self,
        db: AsyncSession,
        call_id: str,
        user_transcript: str,
        language_override: Optional[str] = None,
        asr_confidence: float = 0.95,
        has_background_noise: bool = False,
        is_interruption: bool = False,
    ) -> ProcessTurnResponse:
        # 1. Fetch Call & Active Conversation
        call_res = await db.execute(select(Call).where(Call.id == call_id))
        call = call_res.scalars().first()
        if not call:
            raise ValueError(f"Call with id {call_id} not found")

        conv_res = await db.execute(
            select(Conversation).where(Conversation.call_id == call_id).order_by(Conversation.started_at.desc())
        )
        conversation = conv_res.scalars().first()
        if not conversation:
            conversation = Conversation(call_id=call.id, caller_number=call.caller_number)
            db.add(conversation)
            await db.flush()

        state = self.get_or_create_state(conversation.id, call.caller_number)
        state.turns_count += 1

        # 2. Language Detection
        detected_lang = language_override or intent_classifier.detect_language(user_transcript)
        state.language = detected_lang

        # 3. Intent & Entity Extraction
        new_intent, intent_conf = intent_classifier.classify_intent(user_transcript)
        entities = intent_classifier.extract_entities(user_transcript)
        state.update_intent(new_intent, intent_conf)

        # 4. Handle Pending Confirmation / Denial / Correction
        confirmed_in_this_turn = False
        denied_in_this_turn = False

        if state.pending_confirmation_field:
            if confirmation_engine.is_affirmation(user_transcript):
                state.mark_field_confirmed(state.pending_confirmation_field)
                confirmed_in_this_turn = True
            else:
                is_denial, new_num = confirmation_engine.is_denial_or_correction(user_transcript)
                if is_denial:
                    denied_in_this_turn = True
                    state.correction_count += 1
                    if new_num:
                        entities["reference_id"] = new_num

        # Update newly extracted entities
        state.update_entities(entities)

        # 5. Handle Interruption
        if is_interruption:
            state.correction_count = max(1, state.correction_count)

        # 6. Calculate 5-Factor Confidence Score
        entity_conf = 1.0 if (state.reference_id or state.caller_name) else (0.7 if state.intent else 0.4)
        conf_score_val = 1.0 if state.confirmed_entities else (0.5 if state.pending_confirmation_field else 0.8)
        consistency_val = max(0.2, 1.0 - (0.25 * state.correction_count))

        confidence_score = confidence_engine.calculate(
            intent_conf=intent_conf,
            asr_conf=asr_confidence,
            entity_conf=entity_conf,
            confirmation_score=conf_score_val,
            consistency_score=consistency_val,
            has_background_noise=has_background_noise,
            correction_count=state.correction_count,
        )
        state.last_confidence_score = confidence_score

        # 7. Evaluate Escalation Rules & Safety Filters
        should_escalate, esc_reason, esc_msg = escalation_engine.evaluate(
            state=state,
            confidence_score=confidence_score,
            raw_transcript=user_transcript,
            is_interruption=is_interruption,
        )

        response_text = ""
        created_case_id = None
        handoff_summary_obj = None

        if should_escalate:
            state.escalation_required = True
            state.escalation_reason = esc_reason
            response_text = esc_msg

            # Generate Handoff Summary
            handoff_summary_obj = summarizer.generate_summary(state, esc_reason)

            # Create or update case in database
            case = await create_ticket(
                db=db,
                conversation_id=conversation.id,
                category=state.intent or "general_assistance",
                summary=handoff_summary_obj.summary,
                priority="HIGH" if esc_reason in ["safety_medical", "safety_legal", "low_confidence"] else "MEDIUM",
                confidence=confidence_score.overall_confidence,
                escalation_reason=esc_reason,
                details=state.collected_entities,
            )
            created_case_id = case.id

            # Update call and conversation status
            call.status = "WAITING_FOR_HUMAN"
            conversation.confidence = confidence_score.overall_confidence
            conversation.summary = handoff_summary_obj.summary
            conversation.intent = state.intent
            conversation.language = state.language
            conversation.collected_entities = state.collected_entities
            conversation.confirmed_entities = state.confirmed_entities

        else:
            # 8. Normal Conversational Logic
            if is_interruption:
                if state.language in ["hindi", "hinglish"]:
                    response_text = "Theek hai, main sun raha hoon. Kripya apna sahi reference number batayein."
                else:
                    response_text = "Understood. Let's verify your reference number again."

            elif denied_in_this_turn and state.reference_id:
                if state.language in ["hindi", "hinglish"]:
                    response_text = f"Theek hai, main {state.reference_id} use karta hoon. Kya yeh sahi hai?"
                else:
                    response_text = f"Got it. I'll use reference number {state.reference_id}. Just to confirm, is that correct?"

            elif state.pending_confirmation_field == "reference_id":
                if state.language in ["hindi", "hinglish"]:
                    response_text = f"Confirm karne ke liye, aapka reference number {state.reference_id} hai, kya yeh sahi hai?"
                else:
                    response_text = f"Just to confirm, your reference number is {state.reference_id}, correct?"

            elif "reference_id" in state.confirmed_entities and state.intent == "application_status":
                # Execute Controlled Tool: Lookup Application
                lookup = await check_application_status(db, state.reference_id)
                state.actions_taken.append(f"Looked up application {state.reference_id}")

                if lookup["found"]:
                    status_text = lookup['status']
                    last_up = lookup['last_updated']
                    service = lookup['service_type']
                    if state.language in ["hindi", "hinglish"]:
                        response_text = f"Aapka {service} (Ref: {state.reference_id}) abhi '{status_text}' status par hai, jo {last_up} ko update hua tha."
                    else:
                        response_text = f"Your {service} application #{state.reference_id} is currently '{status_text}' (last updated on {last_up})."
                else:
                    if state.language in ["hindi", "hinglish"]:
                        response_text = f"Reference number {state.reference_id} ka koi record nahi mila. Kya aap dobara check karenge?"
                    else:
                        response_text = f"We could not find any active application for reference #{state.reference_id}. Would you like to check the number again?"

            elif state.intent == "application_status" and not state.reference_id:
                if state.language in ["hindi", "hinglish"]:
                    response_text = "Zaroor. Aapka application reference number kya hai?"
                else:
                    response_text = "Sure! Could you please tell me your application reference number?"

            elif state.intent == "complaint_registration":
                if state.language in ["hindi", "hinglish"]:
                    response_text = "Hum aapki shikayat darj kar rahe hain. Kripya samasya ka thoda aur vivaran dein."
                else:
                    response_text = "I can help register your complaint. Could you briefly describe the exact issue you faced?"

            else:
                if state.language in ["hindi", "hinglish"]:
                    response_text = "Namaste, NexaVoice helpline mein aapka swagat hai. Main aapki kya madad kar sakta hoon?"
                else:
                    response_text = "Hello, welcome to NexaVoice support line. How may I assist you today?"

            # Update conversation fields
            conversation.confidence = confidence_score.overall_confidence
            conversation.intent = state.intent
            conversation.language = state.language
            conversation.collected_entities = state.collected_entities
            conversation.confirmed_entities = state.confirmed_entities

        # 9. Record Messages in Database
        msg_user = Message(
            conversation_id=conversation.id,
            speaker="CALLER",
            language=detected_lang,
            transcript=user_transcript,
        )
        msg_ai = Message(
            conversation_id=conversation.id,
            speaker="AI",
            language=state.language,
            transcript=response_text,
        )
        db.add_all([msg_user, msg_ai])
        await db.commit()

        return ProcessTurnResponse(
            call_id=call.id,
            ai_response_text=response_text,
            language_used=state.language,
            intent_detected=state.intent,
            confidence_breakdown=ConfidenceBreakdownSchema(
                intent_confidence=confidence_score.intent_confidence,
                asr_confidence=confidence_score.asr_confidence,
                entity_confidence=confidence_score.entity_confidence,
                confirmation_score=confidence_score.confirmation_score,
                consistency_score=confidence_score.consistency_score,
                overall_confidence=confidence_score.overall_confidence,
                confidence_level=confidence_score.level,
            ),
            state=state.to_schema(),
            escalation_triggered=should_escalate,
            escalation_reason=esc_reason,
            created_case_id=created_case_id,
            handoff_summary=handoff_summary_obj,
        )


orchestrator = AgentOrchestrator()
