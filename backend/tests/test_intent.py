import pytest
from app.agent.intent import intent_classifier


def test_language_detection_hindi():
    lang = intent_classifier.detect_language("Mujhe aavedan ka status check karna hai")
    assert lang in ["hindi", "hinglish"]


def test_language_detection_english():
    lang = intent_classifier.detect_language("I want to check my application status please")
    assert lang == "english"


def test_language_detection_hinglish():
    lang = intent_classifier.detect_language("Mera application status check karna hai because it is not updated")
    assert lang in ["hinglish", "hindi"]


def test_intent_classification_application_status():
    intent, conf = intent_classifier.classify_intent("Mujhe apne application ka status check karna tha 5281")
    assert intent == "application_status"
    assert conf >= 0.70


def test_intent_classification_human_escalation():
    intent, conf = intent_classifier.classify_intent("Mujhe agent se baat karni hai transfer to human")
    assert intent == "human_escalation"
    assert conf >= 0.90


def test_safety_filter_medical():
    intent, conf = intent_classifier.classify_intent("Mujhe severe chest pain ho raha hai kaunsi medicine loon?")
    assert intent == "emergency_medical"
    assert conf >= 0.90


def test_safety_filter_legal():
    intent, conf = intent_classifier.classify_intent("Can you give me legal advice regarding court case?")
    assert intent == "legal_query"


def test_entity_extraction_reference_id():
    entities = intent_classifier.extract_entities("My application number is 5281 and phone is 9876543210")
    assert entities.get("reference_id") == "5281"
    assert entities.get("phone") == "+919876543210"
