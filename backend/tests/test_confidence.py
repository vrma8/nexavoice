import pytest
from app.agent.confidence import ConfidenceEngine, confidence_engine


def test_confidence_high_score():
    score = confidence_engine.calculate(
        intent_conf=0.95,
        asr_conf=0.98,
        entity_conf=1.0,
        confirmation_score=1.0,
        consistency_score=1.0,
    )
    assert score.level == "HIGH"
    assert score.overall_confidence >= 0.80


def test_confidence_medium_score():
    score = confidence_engine.calculate(
        intent_conf=0.70,
        asr_conf=0.80,
        entity_conf=0.60,
        confirmation_score=0.50,
        consistency_score=0.70,
    )
    assert score.level == "MEDIUM"
    assert 0.55 <= score.overall_confidence < 0.80


def test_confidence_low_score_due_to_noise():
    score = confidence_engine.calculate(
        intent_conf=0.40,
        asr_conf=0.50,
        entity_conf=0.30,
        confirmation_score=0.30,
        consistency_score=0.50,
        has_background_noise=True,
    )
    assert score.level == "LOW"
    assert score.overall_confidence < 0.55


def test_confidence_penalty_on_repeated_corrections():
    score_normal = confidence_engine.calculate(
        intent_conf=0.9, asr_conf=0.9, entity_conf=0.9, confirmation_score=0.8, consistency_score=1.0, correction_count=0
    )
    score_corrected = confidence_engine.calculate(
        intent_conf=0.9, asr_conf=0.9, entity_conf=0.9, confirmation_score=0.8, consistency_score=1.0, correction_count=3
    )
    assert score_corrected.overall_confidence < score_normal.overall_confidence
