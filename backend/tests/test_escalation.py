import pytest
from app.agent.state import ConversationState
from app.agent.confidence import confidence_engine
from app.agent.escalation import escalation_engine


def test_medical_safety_escalation():
    state = ConversationState("conv_test_1", "+919876543210")
    state.intent = "emergency_medical"
    conf = confidence_engine.calculate(intent_conf=0.98)

    should_esc, reason, msg = escalation_engine.evaluate(state, conf, "I have chest pain")
    assert should_esc is True
    assert reason == "safety_medical"
    assert "medical" in msg.lower() or "human" in msg.lower()


def test_explicit_human_request():
    state = ConversationState("conv_test_2", "+919876543210")
    state.intent = "human_escalation"
    conf = confidence_engine.calculate()

    should_esc, reason, msg = escalation_engine.evaluate(state, conf, "transfer to human agent")
    assert should_esc is True
    assert reason == "explicit_request"


def test_low_confidence_escalation():
    state = ConversationState("conv_test_3", "+919876543210")
    conf = confidence_engine.calculate(intent_conf=0.3, asr_conf=0.4, entity_conf=0.2, confirmation_score=0.2, consistency_score=0.3)
    assert conf.level == "LOW"

    should_esc, reason, msg = escalation_engine.evaluate(state, conf, "unclear mumbling...")
    assert should_esc is True
    assert reason == "low_confidence"
