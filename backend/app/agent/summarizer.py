from typing import List
from app.agent.state import ConversationState
from app.schemas import HandoffSummary


class HandoffSummarizer:
    """
    Generates structured, lossless summaries for human agents when an escalation occurs.
    """

    def generate_summary(
        self,
        state: ConversationState,
        reason: str,
        recent_messages: List[dict] = None,
    ) -> HandoffSummary:
        # Build list of collected information fields
        collected_info = []
        if state.caller_name:
            collected_info.append(f"Caller Name: {state.caller_name}")
        if state.phone:
            collected_info.append(f"Phone: {state.phone}")
        if state.reference_id:
            status = "Confirmed" if "reference_id" in state.confirmed_entities else "Unconfirmed"
            collected_info.append(f"Reference ID: {state.reference_id} ({status})")
        if state.problem_description:
            collected_info.append(f"Issue: {state.problem_description}")

        # Human-readable summary description
        intent_display = (state.intent or "general inquiry").replace("_", " ").title()
        if state.intent == "application_status":
            if state.reference_id:
                summary_text = f"Caller is inquiring about the status of application #{state.reference_id}."
            else:
                summary_text = "Caller is inquiring about application status, but reference ID was missing or incomplete."
        elif state.intent == "complaint_registration":
            summary_text = f"Caller wants to register a complaint: {state.problem_description or 'Service delay/issue'}."
        elif state.intent == "emergency_medical":
            summary_text = "EMERGENCY SAFETY ESCALATION: Caller inquired about medical symptoms/treatment."
        elif state.intent == "legal_query":
            summary_text = "LEGAL SAFETY ESCALATION: Caller requested legal advice/litigation assistance."
        elif state.intent == "financial_query":
            summary_text = "FINANCIAL SAFETY ESCALATION: Caller requested investment or trading guidance."
        elif state.intent == "human_escalation":
            summary_text = "Caller explicitly requested to speak with a human support officer."
        else:
            summary_text = f"Caller requires assistance regarding {intent_display}."

        if state.correction_count > 0:
            summary_text += f" (Note: Caller made {state.correction_count} detail correction(s))."

        return HandoffSummary(
            language=state.language.title(),
            caller_name=state.caller_name,
            phone=state.phone,
            reference_id=state.reference_id,
            intent=state.intent,
            summary=summary_text,
            information_collected=collected_info,
            missing_information=state.missing_entities,
            actions_taken=state.actions_taken if state.actions_taken else ["Identified intent and verified caller details"],
            reason_for_escalation=reason.replace("_", " ").title(),
            confidence=state.last_confidence_score.overall_confidence,
            confidence_level=state.last_confidence_score.level,
        )


summarizer = HandoffSummarizer()
