import re
from typing import Tuple, Optional


class ConfirmationEngine:
    """
    Handles confirmation and verification of critical identifiers (reference numbers, IDs).
    Detects affirmative responses, denials, corrections, and mid-turn corrections.
    """

    AFFIRMATIVE_PATTERNS = [
        r"\b(yes|yeah|yup|correct|right|that's right|exactly|true|sure)\b",
        r"\b(haan|sahi|theek|bilkul|yahi|sahi hai|ji haan|haanji)\b",
    ]

    NEGATIVE_PATTERNS = [
        r"\b(no|nope|wrong|not that|incorrect|wait|sorry|different)\b",
        r"\b(nahi|galat|ye nahi|arre nahi|ruko|dusra|galat hai)\b",
    ]

    CORRECTION_PATTERNS = [
        r"(?:no|nahi|actually|instead|it is|it's|hai)\s*(\d{4,8})",
        r"(?:not\s+\d{4,8}\s*,?\s*(?:but|it's|is)\s*)(\d{4,8})",
    ]

    def is_affirmation(self, text: str) -> bool:
        text_lower = text.lower().strip()
        for pat in self.AFFIRMATIVE_PATTERNS:
            if re.search(pat, text_lower):
                # Ensure it's not a negated affirmative e.g. "not correct"
                if not re.search(r"\b(not|nahi)\b\s+" + pat, text_lower):
                    return True
        return False

    def is_denial_or_correction(self, text: str) -> Tuple[bool, Optional[str]]:
        text_lower = text.lower().strip()
        is_neg = False
        new_val = None

        for pat in self.NEGATIVE_PATTERNS:
            if re.search(pat, text_lower):
                is_neg = True
                break

        # Check if there is an explicit new number given in the same breath
        for pat in self.CORRECTION_PATTERNS:
            match = re.search(pat, text_lower)
            if match:
                is_neg = True
                new_val = match.group(1)
                break

        # If not matched by pattern but negative word exists and a 4+ digit number is in text
        if is_neg and not new_val:
            num_match = re.search(r"\b(\d{4,8})\b", text)
            if num_match:
                new_val = num_match.group(1)

        return is_neg, new_val


confirmation_engine = ConfirmationEngine()
