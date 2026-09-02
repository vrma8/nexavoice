from dataclasses import dataclass
from typing import Dict, Any, List
from app.config import settings


@dataclass
class ConfidenceScore:
    intent_confidence: float
    asr_confidence: float
    entity_confidence: float
    confirmation_score: float
    consistency_score: float
    overall_confidence: float
    level: str  # HIGH, MEDIUM, LOW


class ConfidenceEngine:
    """
    Computes a multi-factor confidence score for the voice agent interaction.
    Formula:
        confidence = 0.30 * intent_confidence
                   + 0.25 * asr_confidence
                   + 0.20 * entity_confidence
                   + 0.15 * confirmation_score
                   + 0.10 * consistency_score
    """

    WEIGHT_INTENT = 0.30
    WEIGHT_ASR = 0.25
    WEIGHT_ENTITY = 0.20
    WEIGHT_CONFIRMATION = 0.15
    WEIGHT_CONSISTENCY = 0.10

    def __init__(
        self,
        high_threshold: float = settings.CONFIDENCE_HIGH_THRESHOLD,
        medium_threshold: float = settings.CONFIDENCE_MEDIUM_THRESHOLD,
    ):
        self.high_threshold = high_threshold
        self.medium_threshold = medium_threshold

    def calculate(
        self,
        intent_conf: float = 1.0,
        asr_conf: float = 1.0,
        entity_conf: float = 1.0,
        confirmation_score: float = 1.0,
        consistency_score: float = 1.0,
        has_background_noise: bool = False,
        correction_count: int = 0,
    ) -> ConfidenceScore:
        # Penalties for real-world acoustic/dialogue degradation
        effective_asr = asr_conf
        if has_background_noise:
            effective_asr = max(0.2, effective_asr * 0.65)

        effective_consistency = consistency_score
        if correction_count > 1:
            # Each repeated correction reduces consistency
            effective_consistency = max(0.1, effective_consistency - (0.25 * (correction_count - 1)))

        # Weighted calculation
        overall = (
            (self.WEIGHT_INTENT * intent_conf)
            + (self.WEIGHT_ASR * effective_asr)
            + (self.WEIGHT_ENTITY * entity_conf)
            + (self.WEIGHT_CONFIRMATION * confirmation_score)
            + (self.WEIGHT_CONSISTENCY * effective_consistency)
        )

        overall = round(max(0.0, min(1.0, overall)), 3)

        if overall >= self.high_threshold:
            level = "HIGH"
        elif overall >= self.medium_threshold:
            level = "MEDIUM"
        else:
            level = "LOW"

        return ConfidenceScore(
            intent_confidence=round(intent_conf, 3),
            asr_confidence=round(effective_asr, 3),
            entity_confidence=round(entity_conf, 3),
            confirmation_score=round(confirmation_score, 3),
            consistency_score=round(effective_consistency, 3),
            overall_confidence=overall,
            level=level,
        )


confidence_engine = ConfidenceEngine()
