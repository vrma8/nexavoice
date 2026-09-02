import pytest
from app.agent.confirmation import confirmation_engine


def test_affirmation_hindi():
    assert confirmation_engine.is_affirmation("haan sahi hai") is True
    assert confirmation_engine.is_affirmation("ji haan bilkul") is True


def test_affirmation_english():
    assert confirmation_engine.is_affirmation("yes correct that's right") is True
    assert confirmation_engine.is_affirmation("yeah") is True


def test_denial_and_correction_flow():
    is_neg, new_val = confirmation_engine.is_denial_or_correction("No, it's actually 5821")
    assert is_neg is True
    assert new_val == "5821"

    is_neg2, new_val2 = confirmation_engine.is_denial_or_correction("nahi galat hai, mera 5821 hai")
    assert is_neg2 is True
    assert new_val2 == "5821"
