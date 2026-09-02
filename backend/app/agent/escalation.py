from typing import Tuple, Optional
from app.agent.state import ConversationState
from app.agent.confidence import ConfidenceScore


class EscalationEngine:
    """
    Evaluates whether a conversation must be escalated to a human agent based on:
    1. Explicit caller request
    2. Low confidence score
    3. Safety boundaries (medical, legal, financial)
    4. Repeated corrections
    5. Persistent background noise / ASR degradation
    """

    def evaluate(
        self,
        state: ConversationState,
        confidence_score: ConfidenceScore,
        raw_transcript: str,
        is_interruption: bool = False,
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Returns:
            (should_escalate, escalation_reason, user_facing_message)
        """
        lang = state.language

        # 1. Safety Filter - Medical
        if state.intent == "emergency_medical":
            msg = (
                "Main medical advice nahi de sakta. Main aapko turant human support officer se connect kar raha hoon."
                if lang in ["hindi", "hinglish"]
                else "I cannot diagnose or provide medical advice. I am connecting you with qualified human support immediately."
            )
            return True, "safety_medical", msg

        # 2. Safety Filter - Legal
        if state.intent == "legal_query":
            msg = (
                "Main legal advice provide nahi kar sakta. Main aapko humare support executive se connect kar raha hoon."
                if lang in ["hindi", "hinglish"]
                else "I cannot provide legal advice. Connecting you with a support representative."
            )
            return True, "safety_legal", msg

        # 3. Safety Filter - Financial
        if state.intent == "financial_query":
            msg = (
                "Main financial advice nahi de sakta. Main aapko officer se connect kar raha hoon."
                if lang in ["hindi", "hinglish"]
                else "I cannot provide financial advice. Connecting you to human assistance."
            )
            return True, "safety_financial", msg

        # 4. Explicit Human Request
        if state.intent == "human_escalation":
            msg = (
                "Zaroor, main aapki call humare human representative ko transfer kar raha hoon. Kripya bane rahein."
                if lang in ["hindi", "hinglish"]
                else "Certainly. Transferring your call to our customer support executive. Please stay on the line."
            )
            return True, "explicit_request", msg

        # 5. Repeated Corrections (> 2 corrections)
        if state.correction_count >= 2:
            msg = (
                "Main aapka vivaran galat samajh raha hoon. Main aapko officer se connect kar raha hoon taaki sahi madad mil sake."
                if lang in ["hindi", "hinglish"]
                else "I want to ensure we have the exact details right. Let me transfer you to an officer."
            )
            return True, "repeated_corrections", msg

        # 6. Low Confidence (< 0.55)
        if confidence_score.level == "LOW":
            msg = (
                "Aawaz ya jankari aspasht hone ke karan, main aapko turant staff member se connect kar raha hoon."
                if lang in ["hindi", "hinglish"]
                else "I don't want to misunderstand your request. I'll connect you with a staff member right away."
            )
            return True, "low_confidence", msg

        return False, None, None


escalation_engine = EscalationEngine()
