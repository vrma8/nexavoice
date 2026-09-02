import re
from typing import Tuple, Dict, Any, Optional, List


INTENT_PATTERNS = {
    "human_escalation": [
        r"(human|agent|person|representative|executive|officer|talk to someone|connect me|transfer|helpdesk)",
        r"(insaan|kisi se baat|officer se baat|agent se baat|transfer karo|human support)",
    ],
    "emergency_medical": [
        r"(chest pain|heart attack|doctor|medicine|ambulance|emergency|hospital|bleeding|severe pain|breathless|poison)",
        r"(seene mein dard|dil ka daura|dawai|ilaaj|aspataal|behosh|chot lag gayi|khoon)",
    ],
    "legal_query": [
        r"(legal advice|lawyer|court case|sue|illegal|fir|police case|section|advocate)",
        r"(kanooni salah|vakil|adalat|mukadma|court|kanoon)",
    ],
    "financial_query": [
        r"(invest|stock market|crypto|bitcoin|mutual fund|trading|profit guarantee|loan advice)",
        r"(paise lagana|nivesh|share market|munafa|byaaj)",
    ],
    "application_status": [
        r"(status|track|application|reference|ref\s*no|applied|submitted|progress|update|ration|domicile|certificate|meter)",
        r"(status check|stith|aavedan|reference number|darj kiya|kahan tak pahuncha|pata karna|ration card|praman patra)",
    ],
    "complaint_registration": [
        r"(complaint|grievance|problem|issue|not working|broken|delay|corrupt|unhappy|fail)",
        r"(shikayat|pareshani|samasya|kaam nahi kar raha|deri|kharaab)",
    ],
    "general_info": [
        r"(how to|what is|procedure|timings|working hours|eligibility|documents required|scheme|yojana)",
        r"(kaise karein|kya hai|prakriya|samay|patrata|documents kya chahiye|yojana ki jankari)",
    ],
}


class IntentClassifier:
    """
    Multilingual Intent and Entity Extraction Engine supporting Hindi, English, and Hinglish.
    """

    def detect_language(self, text: str) -> str:
        hindi_markers = ["mujhe", "mera", "meri", "hai", "tha", "raha", "karna", "hoga", "aapka", "kya", "batao", "shikayat", "aavedan", "chahiye", "nahi", "haan"]
        text_lower = text.lower()

        # Check for Devanagari script
        if re.search(r"[\u0900-\u097F]", text):
            return "hindi"

        hindi_words_found = sum(1 for word in hindi_markers if re.search(r"\b" + word + r"\b", text_lower))
        english_words_found = len([w for w in text_lower.split() if w not in hindi_markers and len(w) > 3])

        if hindi_words_found > 0 and english_words_found > 0:
            return "hinglish"
        elif hindi_words_found > 0:
            return "hindi"
        return "english"

    def classify_intent(self, text: str) -> Tuple[str, float]:
        text_lower = text.lower().strip()
        if not text_lower:
            return "general_info", 0.3

        # 1. Check Safety Critical intents first
        for intent_name in ["emergency_medical", "legal_query", "financial_query", "human_escalation"]:
            patterns = INTENT_PATTERNS[intent_name]
            for pattern in patterns:
                if re.search(pattern, text_lower, re.IGNORECASE):
                    return intent_name, 0.98

        # 2. Check Service intents
        best_intent = "general_info"
        best_confidence = 0.5

        for intent_name, patterns in INTENT_PATTERNS.items():
            for pattern in patterns:
                matches = re.findall(pattern, text_lower, re.IGNORECASE)
                if matches:
                    score = min(0.95, 0.70 + (len(matches) * 0.10))
                    if score > best_confidence:
                        best_confidence = score
                        best_intent = intent_name

        return best_intent, best_confidence

    def extract_entities(self, text: str) -> Dict[str, Any]:
        entities: Dict[str, Any] = {}
        text_lower = text.lower()

        # Extract 4-10 digit Reference/Application ID
        ref_match = re.search(r"(?:reference|application|ref|number|no|id|sankhya)?\s*[:#\-]?\s*(\d{4,10})", text_lower)
        if ref_match:
            entities["reference_id"] = ref_match.group(1)

        # Extract standalone 4+ digit number if not matched with keywords
        if "reference_id" not in entities:
            num_match = re.search(r"\b(\d{4,8})\b", text)
            if num_match:
                entities["reference_id"] = num_match.group(1)

        # Extract 10-digit phone number
        phone_match = re.search(r"(?:\+91|0)?\s*([6-9]\d{9})\b", text)
        if phone_match:
            entities["phone"] = f"+91{phone_match.group(1)}"

        # Extract Name patterns
        name_match = re.search(r"(?:my name is|mera naam|naam hai|i am|this is)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)", text_lower)
        if name_match:
            entities["caller_name"] = name_match.group(1).title()

        return entities


intent_classifier = IntentClassifier()
