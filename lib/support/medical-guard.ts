/**
 * NexaVoice medical-safety guard — shared by every agent path (voice tools,
 * chat LLM, rule-based chat) so the behaviour cannot drift between them.
 *
 * Hard policy (product requirement):
 *   - Nexa never gives medical advice: no diagnosis, no treatment guidance, no
 *     dosage/side-effect information, no "what should I take" answers — no
 *     matter how many times the customer asks.
 *   - Nexa never recommends or sells medical products (the catalogue's
 *     `Medicine` section, including OTC tablets, syrups, ORS, antiseptics,
 *     thermometers and sanitizers) through the assistant.
 *   - The first request gets a single, firm, polite refusal. From the second
 *     request on, the platform escalates to a human agent automatically with a
 *     handoff summary that names the reason.
 */

/** How many medical requests are allowed before automatic escalation. */
export const MEDICAL_ESCALATION_LIMIT = 2;

/** Refusal copy the model is told to speak word-for-word (kept generic). */
export const MEDICAL_REFUSAL_MESSAGE =
  'I am not able to give medical advice or recommend medicines — that is for a doctor or pharmacist to decide, and NexaVoice does not sell medical products. I can still help with your NexaMart orders, deliveries, returns and payments. What would you like me to help with?';

const ENGLISH_MEDICAL_RE =
  /\b(medic(?:ine|ines|ation|ations|al|ally)?|tablet\w*|pill\w*|capsule\w*|syrup\w*|dose\w*|dosage\w*|prescription\w*|antibiotic\w*|painkiller\w*|paracetamol|crocin|dolo\s*650|calpol|ibuprofen|brufen|cetirizine|allegra|antacid|digene|ors\b|rehydration|multivitamin\w*|vitamin\w*|supplement\w*|thermometer\b|saniti[sz]er\w*|antiseptic\w*|cough\b|cold\s+medicine|fever\b|headache\b|migraine\b|sore\s+throat|nausea\b|vomit\w*|diarrh\w*|loose\s+motion\w*|blood\s+pressure|diabet\w*|bp\s+(high|low|level)|infection\b|allerg\w*|asthma\b|stomach\s+ache|body\s+ache|pain\s+relief)/i;

const DEVANAGARI_MEDICAL_RE =
  /(दवा|दवाई|गोली|टैबलेट|कैप्सूल|सिरप|खुराक|नुस्खा|पर्चा|बुखार|सर्दी|खांसी|खाँसी|बीमार|बीमारी|इलाज|डॉक्टर|डाक्टर|डॉ|दर्द|सिरदर्द|पेट दर्द|उल्टी|दस्त|चक्कर|एलर्जी|एंटीबायोटिक|पेनकिलर|मल्टीविटामिन|विटामिन|थर्मामीटर|सैनिटाइज़र|सैनिटाइजर|एंटीसेप्टिक|खुराक|कितना लूं|क्या लूं|क्या खाऊं|क्या खाऊँ|दवा का नाम)/i;

const HINGLISH_MEDICAL_RE =
  /\b(dawai|dawa|goli|tablet|sirup|syrup|bukhar|sardi|khansi|khanasi|khaansi|bimar|bimari|ilaj|daktar|doctor|dar(d|d)\b|pet\s+dard|sir\s+dard|ulti|dast|chakkar|allergy|elergy|medicine\s+chahiye|dawai\s+chahiye|kya\s+khaun|kya\s+khaun\b|kya\s+loon|kya\s+lena\s+chahiye|dawai\s+ka\s+naam|medicine\s+ka\s+naam|kya\s+karoon|kya\s+karu\b|nahi\s+theek\s+lag|theek\s+nahi\s+lag|bimari\s+ka\s+ilaaj)/i;

/**
 * True when the customer's message is about medical advice, symptoms, or
 * buying a medicine / medical product. Kept deliberately broad so a refusal is
 * always on the safe side — a false positive costs one polite refusal, a false
 * negative costs a medical recommendation.
 */
export function isMedicalRequest(text: string): boolean {
  const value = String(text ?? '').trim();
  if (!value) return false;
  return (
    ENGLISH_MEDICAL_RE.test(value) ||
    DEVANAGARI_MEDICAL_RE.test(value) ||
    HINGLISH_MEDICAL_RE.test(value)
  );
}

/**
 * True for catalogue products the assistant must never surface or add to a
 * cart/order: the whole `Medicine` category, matched on top of a few keywords
 * so a future product without the category label still cannot slip through.
 */
export function isMedicalProduct(product: {
  category?: string | null;
  title?: string | null;
  sku?: string | null;
} | null | undefined): boolean {
  if (!product) return false;
  const category = String(product.category ?? '').toLowerCase();
  if (category === 'medicine') return true;
  const title = String(product.title ?? '').toLowerCase();
  const sku = String(product.sku ?? '').toLowerCase();
  if (sku.startsWith('nm-md-')) return true;
  return /(paracetamol|ibuprofen|cough syrup|antacid|multivitamin|cetirizine|ors\b|antiseptic|hand sanitizer|digital thermometer)/.test(
    title,
  );
}

/**
 * Human-facing refusal copy in the conversation languages, used by the
 * rule-based chat agent (the LLM paths get the tool result / system prompt).
 */
export const MEDICAL_REFUSAL_COPY: Record<'en' | 'hi' | 'hinglish', string> = {
  en: "I'm sorry, but I can't give medical advice or recommend medicines — that's for a doctor or pharmacist to decide, and NexaVoice does not sell them. I can still help with your NexaMart orders, deliveries and payments. What would you like?",
  hi: 'माफ़ कीजिए, मैं चिकित्सा सलाह नहीं दे सकती और न ही दवाइयों की सिफारिश कर सकती हूँ — यह डॉक्टर या फार्मासिस्ट का काम है, और NexaVoice उन्हें बेचती नहीं है। फिर भी मैं आपके NexaMart ऑर्डर, डिलीवरी और भुगतान में मदद कर सकती हूँ। बताइए, क्या चाहिए?',
  hinglish: 'Maaf kijiye, main medical advice nahi de sakti aur na hi medicines recommend kar sakti hoon — yeh doctor ya pharmacist ka kaam hai, aur NexaVoice unhe bechti nahi hai. Main phir bhi aapke NexaMart orders, delivery aur payment mein madad kar sakti hoon. Bataiye, kya chahiye?',
};

/** One-line reason used in the handoff summary / case for medical escalations. */
export const MEDICAL_ESCALATION_REASON =
  'Customer repeatedly asked for medical advice or medication recommendations, which NexaVoice does not provide';
