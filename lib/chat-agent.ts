/**
 * Chat-mode agent turn.
 *
 * Voice is powered by Agora Conversational AI. For text chat the backend LLM
 * path is used when it is configured, and both share the same conversation
 * state, the same tools and the same escalation engine:
 *
 *  - With `NEXT_LLM_API_KEY` + `NEXT_LLM_URL` set → an OpenAI-compatible LLM
 *    runs with the system prompt and tools of `lib/support/tools.ts`.
 *  - Without an LLM key → the deterministic agent below covers the demo flows
 *    (cart add/remove/status, orders, add/remove items on a PLACED order,
 *    cancel, address, language preference, escalation) through the *same*
 *    `executeTool()` layer, so the guardrails are identical.
 */
import { generateText, stepCountIs, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { buildSystemPrompt, normalizeLanguageName } from './agent-prompt';
import { spokenNumbersToDigits } from './numbers';
import { buildConversationTools } from './chat-completions';
import { getConversation, listMessages, updateConversation } from './support/store';
import { executeTool } from './support/tools';
import type { Conversation } from './support/types';

export interface ChatTurnResult {
  text: string;
  /** true when the rule-based fallback produced the answer. */
  degraded: boolean;
}

export async function runChatTurn(conversationId: string): Promise<ChatTurnResult> {
  const conversation = getConversation(conversationId);
  if (!conversation) return { text: 'Conversation not found.', degraded: true };

  const apiKey = process.env.NEXT_LLM_API_KEY?.trim();
  const url = process.env.NEXT_LLM_URL?.trim();
  if (apiKey && url) {
    try {
      return { text: await runLlmTurn(conversation, apiKey, url), degraded: false };
    } catch (error) {
      console.error('[chat-agent] LLM turn failed, using rule-based fallback:', error);
    }
  }
  const text = await runRuleBasedTurn(conversation);
  return { text: withLanguageConfirmation(conversation.id, text), degraded: true };
}

/**
 * Until the customer has picked a language, every rule-based reply carries the
 * English language question. The greeting asks it once; this keeps asking (in
 * English) until they answer, so the agent never silently settles into Hindi or
 * Hinglish on its own. An explicit request ("hindi me baat karo") at any point
 * switches and saves the preference through `set_preferred_language`.
 */
function withLanguageConfirmation(conversationId: string, reply: string): string {
  const conversation = getConversation(conversationId);
  if (!conversation || conversation.state !== 'AI_HANDLING') return reply;
  if (conversation.context.languageConfirmed || conversation.caseId) return reply;
  if (listMessages(conversationId).length > 4) return reply; // asked enough
  return `${reply}\n\n(Which language would you like — English, Hindi or Hinglish?)`;
}

// ---------------------------------------------------------------------------
// LLM path
// ---------------------------------------------------------------------------

/**
 * A reply that only PROMISES work ("let me check your cart", "ek second, main
 * dekh kar batati hoon") is a dead end in a request/response chat: the model
 * cannot send a second message on its own, so the customer waits forever. When
 * the model produces one of these we run one more step with an explicit nudge
 * so the tools actually run and the answer comes back in the same turn.
 */
const STALL_RE =
  /\b(let me (just )?(check|look|see|verify|confirm|pull up|take a look)|i('| a)?ll (just )?(check|look|see|verify|confirm|have a look)|i am (checking|looking)|i'm (checking|looking)|give me a (second|moment|minute)|one (second|moment|minute)|hold on|please wait|checking (that|this|your|the)|main (abhi |zara )?(check|dekh|pata)\w* (kar|karke|kar ke)?\s*(rahi|rahe|leti|leta|ke)?|ek (second|minute|min|pal)|zara (dekh|check)|thoda (wait|ruk)|dekh kar batati|check karke batati|get back to you|batati hoon|bata(ta|ti) hu|abhi dekhti|abhi dekhta|looking into (it|this)|working on (it|this))\b|एक (सेकंड|मिनट|पल)|देख(कर| कर) बताती|अभी (देखती|चेक)|जरा (देख|चेक)|थोड़ा (रुक|इंतज़ार)/i;

/** A stall only matters when the model gave nothing else — a promise plus real data is fine. */
export function isStall(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (!STALL_RE.test(trimmed)) return false;
  // Real content alongside the promise (numbers, a product/order, a question
  // about a concrete change) means the turn is usable.
  const hasSubstance = /₹|\bNM-\d|\d{2,}/.test(trimmed) && trimmed.length > 80;
  return !hasSubstance;
}

const NO_STALL_REMINDER =
  'Reminder: you cannot send a follow-up message on your own. Do not reply with a promise to check something — ' +
  'call the tools you need right now (get_cart_status, list_recent_orders, get_order_status, search_products are free to call), ' +
  'then give ONE complete answer that already contains the result and, for any change, a clear yes/no confirmation question.';

async function runLlmTurn(conversation: Conversation, apiKey: string, url: string): Promise<string> {
  const openai = createOpenAI({ apiKey, baseURL: url.replace(/\/chat\/completions\/?$/, '') });
  const modelId = process.env.NEXT_LLM_MODEL?.trim() || 'gpt-4o-mini';
  const history: ModelMessage[] = listMessages(conversation.id)
    .slice(-30)
    .map((m) =>
      m.role === 'user'
        ? { role: 'user' as const, content: m.content }
        : { role: 'assistant' as const, content: m.role === 'human_agent' ? `[Human agent] ${m.content}` : m.content },
    );
  const system = buildSystemPrompt({
    mode: 'chat',
    customerName: conversation.context.customer?.name,
    preferredLanguage: normalizeLanguageName(
      conversation.context.customer?.preferredLanguage ?? conversation.context.language,
    ),
  });
  const tools = buildConversationTools(conversation.id);

  const { text } = await generateText({
    model: openai(modelId),
    system,
    messages: history,
    tools,
    // Enough steps for the real flows: read the cart, search the catalogue,
    // preview the change and — after a yes — apply it, all in one turn.
    stopWhen: stepCountIs(10),
    temperature: 0.4,
  });

  const first = text.trim();
  if (!isStall(first)) return first || 'Sorry, could you say that again?';

  // The model stalled: run the turn again with the promise on the record and an
  // explicit instruction to finish the job now.
  const retry = await generateText({
    model: openai(modelId),
    system,
    messages: [
      ...history,
      ...(first ? [{ role: 'assistant' as const, content: first }] : []),
      { role: 'user' as const, content: NO_STALL_REMINDER },
    ],
    tools,
    stopWhen: stepCountIs(10),
    temperature: 0.2,
  });
  const second = retry.text.trim();
  if (second && !isStall(second)) return second;
  return second || first || 'Sorry, could you say that again?';
}

// ---------------------------------------------------------------------------
// Rule-based fallback
// ---------------------------------------------------------------------------

type Lang = 'en' | 'hi' | 'hinglish';
type Copy = Record<Lang, string>;

const HINGLISH_HINTS =
  /\b(hai|hain|kya|mera|meri|mere|karna|karo|kardo|kar do|nahi|nahin|chahiye|mujhe|aap|aapka|batao|bataiye|kab|kahan|kaha|ho gaya|wapas|paisa|paise|theek|haan|ji|dobara|abhi|jaldi)\b/i;

function toLang(stored?: string): Lang | undefined {
  if (stored === 'hindi' || stored === 'hi') return 'hi';
  if (stored === 'hinglish') return 'hinglish';
  if (stored === 'english' || stored === 'en') return 'en';
  return undefined;
}

/**
 * Which language this turn should be answered in.
 *
 * The rule is "English first, then whatever the customer settled on":
 *  - before the customer has chosen, answer in English — unless they clearly
 *    wrote Devanagari (then they obviously want Hindi);
 *  - after a choice is settled, KEEP that language. A single stray word does not
 *    flip it; only Devanagari script, or a genuinely mixed Hindi-English
 *    message, moves the conversation (mixed input → Hinglish, mirroring them).
 */
export function detectLanguage(text: string, fallback?: string, settled = false): Lang {
  const stored = toLang(fallback);
  const devanagari = /[\u0900-\u097F]/.test(text);
  const romanHindi = HINGLISH_HINTS.test(text);
  const hasLatinWords = /[a-z]{3,}/i.test(text);

  if (devanagari) return romanHindi && hasLatinWords ? 'hinglish' : 'hi';

  // A short answer ("yes", "haan", "ok theek hai", "NM-10023") is a reply, not a
  // language switch — keep whatever the conversation already settled on.
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (settled && stored && wordCount <= 3) return stored;

  if (!settled) {
    // English-first: until the customer answers the language question, a saved
    // preference is NOT enough to leave English — only their own Hindi words are.
    return romanHindi ? 'hinglish' : 'en';
  }

  // Settled: stick to the saved language; a mixed message mirrors into Hinglish.
  if (stored === 'en') return romanHindi ? 'hinglish' : 'en';
  if (stored === 'hi') return romanHindi && hasLatinWords ? 'hinglish' : 'hi';
  return stored ?? (romanHindi ? 'hinglish' : 'en');
}

// An explicit language request: a language NAME plus a switch-ish word ("hindi
// me baat karo", "speak in english", "switch to hinglish", "हिंदी में बात करें"),
// or the bare language name as an answer to the greeting's preference question.
const LANGUAGE_NAME_RE = /(hinglish|हिंग्लिश|hindi|english|हिंदी|हिन्दी|अंग्रेजी|अंग्रेज़ी|इंग्लिश)/gi;
const LANGUAGE_SWITCH_RE =
  /\b(baat|bol|speak|talk|reply|answer|jawab|switch|change|prefer|language|bhasha|karo|karein|kijiye|chahiye|want|please|haan|ha|ji|yes|ok|okay|theek|thik)\b|में\b|\bme\b|\bmein\b|भाषा/i;
const BARE_LANGUAGE_RE =
  /^\s*(?:please\s+)?(?:hinglish|hindi|english|हिंग्लिश|हिंदी|हिन्दी|अंग्रेजी|अंग्रेज़ी|इंग्लिश)(?:\s+please)?\s*[.!]*\s*$/i;

/** The language the customer explicitly asked for, or null. Last name wins ("english se hindi" → hindi). */
function detectLanguageRequest(text: string): Lang | null {
  const matches = [...text.matchAll(LANGUAGE_NAME_RE)];
  if (matches.length === 0) return null;
  if (!BARE_LANGUAGE_RE.test(text) && !LANGUAGE_SWITCH_RE.test(text)) return null;
  const named = normalizeLanguageName(matches[matches.length - 1][0]);
  return named === 'hindi' ? 'hi' : named === 'english' ? 'en' : named === 'hinglish' ? 'hinglish' : null;
}

function pick(lang: Lang, copy: Copy): string {
  return copy[lang];
}

export const RE = {
  human:
    /\b(talk|speak|connect|transfer|need|want)\s+(me\s+)?(to|with)?\s*(a|an|some)?\s*(human|real|live|support|customer[- ]care|executive|representative|agent|manager|person)\b|\b(human|live)\s+(agent|support|executive)\b|\bescalate\b|\b(insaan|insan|aadmi|human|agent|manager|executive)\s+(se|sa|ki)\s+baat\b|\bbaat\s+(karao|karwao)\b|इंसान\s+से\s+बात|एजेंट\s+से\s+बात|किसी\s+से\s+बात/i,
  add: /\b(add|include|bhi (chahiye|dal|add)|dal do|daal do|daalo|dalo|jod|jodo|add kar|order me[in]? (add|dal))\b|जोड़|डाल|और चाहिए/i,
  remove: /\b(remove|delete|hata|hataa|hatao|nikal|nikalo|nikaalo|cancel the (item|product)|mat bhejo|nahi chahiye|dont want|don't want)\b|हटा|निकाल/i,
  cancel: /\b(cancel|cancle|radd|rad kar|band karo|order cancel)\b|रद्द|कैंसिल/i,
  address: /\b(address|pata|change address|address change|deliver (to|at)|new address)\b|पता|एड्रेस/i,
  status: /\b(status|kahan|kaha|where|track|tracking|deliver|delivery|kab|when|aayega|pahunch|update|my order|orders)\b|कहाँ|कब|स्टेटस|ऑर्डर|डिलीवरी/i,
  products: /\b(product|catalogue|catalog|show me|dikha|kitne ka|price|kitna|available|buy|kharid)\b|कीमत|दिखाओ|खरीद/i,
  cart: /\b(cart|basket)\b|कार्ट|टोकरी/i,
  // "replace X with Y", "X ki jagah Y", "X ko Y se badal do", "change X to Y".
  replace: /\b(replace|swap|exchange|badal|badlo|badal do|badal dijiye|change .* (to|with|se)|instead of|ki jagah|ke badle|ke bajay)\b|बदल|जगह|बजाय/i,
  // "place my order", "order kar do", "checkout", "buy it now".
  placeOrder: /\b(place (the |my |an )?order|order (kar do|kardo|karo|kar dijiye|place)|checkout|check out|buy (it |this )?now|confirm (the |my )?order|purchase (it|now)|order laga do)\b|ऑर्डर कर दो|ऑर्डर कर दीजिए|ऑर्डर लगा दो|खरीद लो/i,
  // "empty my cart", "clear the cart", "cart khali kar do".
  clearCart: /\b(empty (the |my )?(cart|basket)|clear (the |my )?(cart|basket)|cart (khali|khaali) (kar|kardo|kar do)|remove everything|sab hata do|sab kuch hata do)\b|कार्ट खाली|सब हटा/i,
  // Two alternations each: the ASCII half needs the trailing \b, but `\b` never
  // matches after Devanagari (its characters are not `\w`), so the Devanagari
  // half is anchored at the start only — otherwise "हाँ" would never confirm.
  yes: /^\s*(yes|yeah|yep|ya|haan|haa|han|ha|ji|ji haan|theek|thik|ok|okay|sure|confirm|kar do|kardo|karo|bilkul|zaroor|go ahead|y)\b|^\s*(हाँ|हां|जी|ठीक|बिल्कुल|जरूर|ज़रूर|कर दो|हो गया|चलेगा)/i,
  no: /^\s*(no|nope|nahi|nahin|na|mat|don'?t|rehne do|ruko)\b|^\s*(नहीं|नही|मत|रहने दो|रुको|बिल्कुल नहीं)/i,
  greeting: /^\s*(hi|hii|hello|hey|namaste|namaskar|good (morning|evening|afternoon))\b|^\s*(हेलो|नमस्ते|नमस्कार)/i,
  thanks: /\b(thanks|thank you|dhanyawad|shukriya|thnx|bye|that'?s all|bas|done)\b|धन्यवाद|शुक्रिया/i,
};

interface AgentOrder {
  order_id: string;
  status: string;
  status_text: string;
  items: string[];
  total_inr: number;
  shipping_address: string;
  can_edit_items: boolean;
  can_cancel: boolean;
  seconds_until_next_status_change: number;
}

interface AgentProduct {
  sku: string;
  title: string;
  price_inr: number;
  category: string;
}

interface AgentCartLine {
  product: string;
  sku: string;
  qty: number;
  total_inr: number;
}

function extractOrderCode(text: string): string | null {
  const explicit = text.match(/\bnm\s*-?\s*(\d{4,6})\b/i);
  if (explicit) return `NM-${explicit[1]}`;
  const digits = text.match(/\b(1\d{4})\b/);
  return digits ? `NM-${digits[1]}` : null;
}

function extractQty(text: string): number | undefined {
  const m = text.match(/\b(\d{1,2})\s*(x|pcs|piece|pieces|nos|qty|quantity)?\b/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 1 && n <= 10 ? n : undefined;
}

/**
 * Hindi command words to drop from the product phrase. `\b` does not work with
 * Devanagari (the characters are not `\w`), so these are filtered token-wise
 * instead of by the word-boundary regex below.
 */
const DEV_STOPWORDS = new Set([
  'से', 'में', 'मे', 'को', 'का', 'की', 'के', 'और', 'भी', 'ही',
  'हटा', 'हटाओ', 'हटाइए', 'हटाएँ', 'हटाना', 'निकाल', 'निकालो', 'निकालें',
  'डाल', 'डालो', 'डालिए', 'डालें', 'डालना', 'जोड़', 'जोड़ो', 'जोड़ें', 'जोड़ना',
  'दो', 'दीजिए', 'दें', 'दे', 'करो', 'करें', 'करिए', 'कीजिए', 'करना', 'चाहिए',
  'मुझे', 'मेरा', 'मेरी', 'मेरे', 'मैं', 'हम', 'आप', 'आपका', 'आपकी', 'आपके',
  'कृपया', 'जल्दी', 'अभी', 'कार्ट', 'टोकरी', 'ऑर्डर', 'खरीद', 'खरीदो', 'खरीदना',
  'दिखाओ', 'बताओ', 'एक', 'यह', 'वह', 'इस', 'इसमें', 'उस', 'कुछ', 'कोई', 'नया', 'नई',
]);

/** Strips the command words so what is left is (mostly) the product the customer named. */
export function extractProductPhrase(text: string): string {
  return text
    .replace(/\bnm\s*-?\s*\d{4,6}\b/gi, ' ')
    .replace(
      /\b(please|kindly|can you|could you|i want to|i want|i would like|mujhe|main|mera|meri|order|orders|cart|basket|me|mein|in|to|from|the|my|a|an|add|include|remove|delete|hata|hataa|hatao|nikal|nikalo|dal|daal|daalo|dalo|do|dijiye|kar|karo|kardo|de|chahiye|bhi|aur|and|please|jaldi|abhi|ek|se|sa|kya|dikhao|dikha|batao|bata)\b/gi,
      ' ',
    )
    // \p{M} keeps Devanagari matras attached to their consonants ("केतली" must
    // not be shredded into "क तल") — only real punctuation is replaced.
    .replace(/[^\p{L}\p{N}\p{M}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((word) => !DEV_STOPWORDS.has(word.toLowerCase()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a replace request into the two product phrases.
 * Handles "replace X with Y", "change X to Y", "X ki jagah Y", "X ke badle Y",
 * "X ko Y se badal do" and the Devanagari equivalents.
 */
export function extractReplacePair(text: string): { from: string; to: string } | null {
  const patterns: Array<{ re: RegExp; from: 1 | 2; to: 1 | 2 }> = [
    { re: /(?:replace|swap|exchange|change)\s+(.+?)\s+(?:with|for|to|by|se)\s+(.+)/i, from: 1, to: 2 },
    { re: /(.+?)\s+(?:ki jagah|ke badle|ke bajay|ki jgah)\s+(?:par\s+|pe\s+)?(.+)/i, from: 1, to: 2 },
    { re: /(.+?)\s+ko\s+(.+?)\s+(?:se|me|mein)?\s*badal\s*(?:do|dijiye|den)?/i, from: 1, to: 2 },
    { re: /(?:instead of)\s+(.+?)[, ]+\s*(?:add|send|bhejo|chahiye|de do)?\s*(.+)/i, from: 1, to: 2 },
    { re: /(.+?)\s+(?:की जगह|के बदले|के बजाय)\s+(.+)/, from: 1, to: 2 },
  ];
  for (const { re, from, to } of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const a = extractProductPhrase(m[from] ?? '');
    const b = extractProductPhrase(m[to] ?? '');
    if (a && b) return { from: a, to: b };
  }
  return null;
}

function describeOrder(lang: Lang, o: AgentOrder): string {
  const items = o.items.join(', ');
  const eta =
    o.seconds_until_next_status_change > 0
      ? ` (${pick(lang, { en: 'next update in', hi: 'अगला अपडेट', hinglish: 'next update' })} ~${Math.max(
          1,
          Math.round(o.seconds_until_next_status_change / 60),
        )} min)`
      : '';
  switch (lang) {
    case 'hi':
      return `ऑर्डर ${o.order_id} (${items}) — स्थिति: ${o.status_text}${eta}. कुल ₹${o.total_inr}.`;
    case 'hinglish':
      return `Order ${o.order_id} (${items}) abhi "${o.status_text}" hai${eta}. Total ₹${o.total_inr}.`;
    default:
      return `Order ${o.order_id} (${items}) is currently "${o.status_text}"${eta}. Total ₹${o.total_inr}.`;
  }
}

/** "Cart: 2 x Kettle, 1 x Saree — total ₹1,299." in the turn's language. */
function describeCart(lang: Lang, result: Record<string, unknown>): string {
  const lines = ((result.cart as AgentCartLine[]) ?? []).filter(Boolean);
  if (lines.length === 0) {
    return pick(lang, { en: 'The cart is now empty.', hi: 'कार्ट अब खाली है।', hinglish: 'Cart ab khaali hai.' });
  }
  const items = lines.map((l) => `${l.qty} x ${l.product}`).join(', ');
  return `${pick(lang, { en: 'Cart', hi: 'कार्ट', hinglish: 'Cart' })}: ${items} — ${pick(lang, {
    en: 'total',
    hi: 'कुल',
    hinglish: 'total',
  })} ₹${result.total_inr}.`;
}

function listOrdersText(lang: Lang, orders: AgentOrder[]): string {
  if (orders.length === 0) {
    return pick(lang, {
      en: 'You have not placed any order yet. Add products to your cart on the shopping page and place an order — then I can help with it.',
      hi: 'आपने अभी तक कोई ऑर्डर नहीं किया है। शॉपिंग पेज से कार्ट में प्रोडक्ट डालकर ऑर्डर करें, फिर मैं मदद कर सकती हूँ।',
      hinglish: 'Aapne abhi tak koi order nahi kiya hai. Shopping page se cart mein product daal kar order karein, phir main help kar sakti hoon.',
    });
  }
  const lines = orders
    .map((o) => `• ${o.order_id}: ${o.items.join(', ')} — ${o.status_text}${o.can_edit_items ? ' ✏️' : ''}`)
    .join('\n');
  return pick(lang, {
    en: `Here are your recent orders:\n${lines}\nWhich order should I look at?`,
    hi: `आपके हाल के ऑर्डर:\n${lines}\nकिस ऑर्डर के बारे में देखूँ?`,
    hinglish: `Aapke recent orders:\n${lines}\nKis order ke baare mein dekhoon?`,
  });
}

async function runRuleBasedTurn(conversation: Conversation): Promise<string> {
  const messages = listMessages(conversation.id);
  const last = [...messages].reverse().find((m) => m.role === 'user');
  // Interpret the message with spoken numbers rendered as digits ("तीन केतली" →
  // "3 केतली", "pin ek ek shunya…" → digits), so quantities, phone numbers and
  // PIN codes are understood — and stored — the same way whichever language or
  // script the customer typed them in.
  const text = spokenNumbersToDigits(last?.content?.trim() ?? '');
  const lang = detectLanguage(
    text,
    conversation.context.language ?? conversation.context.customer?.preferredLanguage,
    Boolean(conversation.context.languageConfirmed),
  );
  updateConversation(conversation.id, {
    context: { language: lang === 'hi' ? 'hindi' : lang === 'hinglish' ? 'hinglish' : 'english' },
  });

  const ctx = () => getConversation(conversation.id)!.context;
  const setCtx = (patch: Partial<Conversation['context']>) => updateConversation(conversation.id, { context: patch });
  const note = (fact: string) => setCtx({ notes: [...new Set([...(ctx().notes ?? []), fact])] });

  const call = (tool: string, args: Record<string, unknown> = {}) => executeTool(conversation.id, tool, args);

  const loadOrders = async (): Promise<AgentOrder[]> => {
    const outcome = await call('list_recent_orders');
    return ((outcome.result.orders as AgentOrder[]) ?? []).filter(Boolean);
  };

  const escalate = async (reason: string, intent: string, missing: string[] = []) => {
    const c = ctx();
    const summary =
      `Customer ${c.customer?.name ?? c.customerName ?? 'unknown'} in text chat (${c.language ?? 'unknown'}) — intent: ${intent}. ` +
      `${c.orderIds.length ? `Orders discussed: ${c.orderIds.join(', ')}. ` : ''}${reason}. ` +
      `Last message: "${text.slice(0, 160)}"`;
    const outcome = await call('escalate_to_human', {
      reason,
      intent,
      summary,
      language: c.language,
      confidence: 0.45,
      missing_information: missing,
    });
    if (!outcome.ok) {
      return pick(lang, {
        en: 'I could not reach a human agent right now. Please try again in a moment.',
        hi: 'अभी मानव एजेंट से संपर्क नहीं हो पाया। कृपया थोड़ी देर बाद प्रयास करें।',
        hinglish: 'Abhi human agent se connect nahi ho paya. Please thodi der baad try karein.',
      });
    }
    return pick(lang, {
      en: `Sure. I've created case ${outcome.result.case_id} and a human support agent will continue this chat shortly. Please stay on this page.`,
      hi: `ज़रूर। मैंने केस ${outcome.result.case_id} बना दिया है, एक मानव एजेंट जल्द ही इसी चैट में बात करेंगे। कृपया इस पेज पर रहें।`,
      hinglish: `Zaroor. Maine case ${outcome.result.case_id} bana diya hai, ek human agent thodi der mein isi chat mein baat karenge. Please is page par rahiye.`,
    });
  };

  // 0. No signed-in client on this conversation -------------------------------
  if (!ctx().customer) {
    if (RE.human.test(text)) return escalate('Customer asked for a human agent', 'other');
    return pick(lang, {
      en: 'I could not link this chat to your NexaMart account. Please reopen the chat from the shopping page while signed in, or ask for a human agent.',
      hi: 'यह चैट आपके NexaMart खाते से नहीं जुड़ पाई। कृपया साइन-इन करके शॉपिंग पेज से चैट दोबारा खोलें, या मानव एजेंट माँगें।',
      hinglish: 'Yeh chat aapke NexaMart account se link nahi ho payi. Please sign-in karke shopping page se chat dobara kholein, ya human agent maangein.',
    });
  }

  // 1. Pending confirmation / address collection ------------------------------
  const pending = ctx().pendingAction;
  if (pending) {
    if (pending.stage === 'collect_address') {
      if (RE.no.test(text) || RE.human.test(text)) {
        setCtx({ pendingAction: undefined });
        if (RE.human.test(text)) return escalate('Customer asked for a human agent', 'address_change');
        return pick(lang, {
          en: 'Okay, nothing changed. Anything else?',
          hi: 'ठीक है, कुछ नहीं बदला। और कुछ?',
          hinglish: 'Theek hai, kuch change nahi kiya. Aur kuch?',
        });
      }
      if (text.length < 10) {
        return pick(lang, {
          en: 'Please type the complete new address: house/flat, street or area, city and 6-digit PIN code.',
          hi: 'कृपया पूरा नया पता लिखें: मकान/फ्लैट, गली या क्षेत्र, शहर और 6 अंकों का पिन कोड।',
          hinglish: 'Please poora naya address likhiye: house/flat, area, city aur 6-digit PIN code.',
        });
      }
      note(`new delivery address: ${text}`);
      // The address is collected for two different actions: changing an existing
      // order's address, and supplying one for a brand-new order.
      if (pending.tool === 'place_order') {
        setCtx({ pendingAction: { ...pending, args: { ...pending.args, shipping_address: text }, stage: 'confirm' } });
        const cart = await call('get_cart_status');
        const lines = ((cart.result.cart as AgentCartLine[]) ?? []).filter(Boolean);
        const items = lines.map((l) => `${l.qty} x ${l.product}`).join(', ');
        return pick(lang, {
          en: `Delivering ${items} (₹${cart.result.total_inr}) to "${text}". Should I place the order? (yes / no)`,
          hi: `${items} (₹${cart.result.total_inr}) "${text}" पर भेजूँगी। ऑर्डर कर दूँ? (हाँ / नहीं)`,
          hinglish: `${items} (₹${cart.result.total_inr}) "${text}" par bhejungi. Order kar doon? (haan / nahi)`,
        });
      }
      setCtx({ pendingAction: { ...pending, args: { ...pending.args, new_address: text }, stage: 'confirm' } });
      return pick(lang, {
        en: `New address for ${pending.args.order_id}: "${text}". Should I update it? (yes / no)`,
        hi: `${pending.args.order_id} का नया पता: "${text}"। क्या अपडेट कर दूँ? (हाँ / नहीं)`,
        hinglish: `${pending.args.order_id} ka naya address: "${text}". Update kar doon? (haan / nahi)`,
      });
    }

    if (pending.stage === 'confirm') {
      if (RE.yes.test(text)) {
        setCtx({ pendingAction: undefined });
        const outcome = await call(pending.tool, { ...pending.args, confirmed: true });
        if (!outcome.ok) {
          return `${pick(lang, { en: 'Sorry, that did not work:', hi: 'क्षमा करें, यह नहीं हो पाया:', hinglish: 'Sorry, yeh ho nahi paya:' })} ${
            (outcome.result.message as string) ?? outcome.result.error
          } ${pick(lang, {
            en: 'Shall I connect you to a human agent?',
            hi: 'क्या मैं आपको मानव एजेंट से जोड़ दूँ?',
            hinglish: 'Kya main aapko human agent se connect karoon?',
          })}`;
        }
        const order = outcome.result.order as AgentOrder | undefined;
        const done = (outcome.result.message as string) ?? 'Done.';
        const summary = order
          ? `\n${describeOrder(lang, order)}`
          : Array.isArray(outcome.result.cart)
            ? `\n${describeCart(lang, outcome.result)}`
            : '';
        return `${done}${summary}\n${pick(lang, {
          en: 'Anything else I can help with?',
          hi: 'और कुछ मदद करूँ?',
          hinglish: 'Aur kuch madad karoon?',
        })}`;
      }
      if (RE.no.test(text)) {
        setCtx({ pendingAction: undefined });
        return pick(lang, {
          en: 'Okay, I have not changed anything. Anything else?',
          hi: 'ठीक है, मैंने कुछ नहीं बदला। और कुछ?',
          hinglish: 'Theek hai, maine kuch change nahi kiya. Aur kuch?',
        });
      }
      setCtx({ pendingAction: undefined });
    }
  }

  // 2. Explicit language preference — switch, confirm and save it on the account.
  const requestedLang = detectLanguageRequest(text);
  if (requestedLang) {
    const language = requestedLang === 'hi' ? 'hindi' : requestedLang === 'en' ? 'english' : 'hinglish';
    const outcome = await call('set_preferred_language', { language });
    if (outcome.ok) {
      return `${outcome.result.message} ${pick(requestedLang, {
        en: 'How can I help you now?',
        hi: 'अब मैं आपकी क्या मदद करूँ?',
        hinglish: 'Ab bataiye, kya madad karoon?',
      })}`;
    }
    // Could not save (no signed-in client): still honour it for this conversation.
    setCtx({ language: requestedLang === 'hi' ? 'hindi' : requestedLang === 'en' ? 'english' : 'hinglish', languageConfirmed: true });
    return pick(requestedLang, {
      en: "Sure, let's continue in English. How can I help you?",
      hi: 'ज़रूर, अब से हिंदी में बात करते हैं। बताइए, क्या मदद करूँ?',
      hinglish: 'Zaroor, ab se Hinglish mein baat karte hain. Bataiye, kya madad karoon?',
    });
  }

  // 3. Explicit human request ---------------------------------------------------
  if (RE.human.test(text)) return escalate('Customer asked for a human agent', ctx().intent ?? 'other');

  // 4. Intent -------------------------------------------------------------------
  // "cart" wins over the order flows: the cart is what the customer is about to
  // order, and cart changes go straight to their account (CartItem rows).
  const wantsCart = RE.cart.test(text);
  const mentionsOrder = /\b(order|orders)\b|ऑर्डर/i.test(text) || extractOrderCode(text) !== null;
  const intent = RE.placeOrder.test(text)
    ? 'place_order'
    : RE.clearCart.test(text)
      ? 'cart_clear'
      : RE.replace.test(text)
        ? // A replace targets the cart unless the customer clearly named an order.
          mentionsOrder && !wantsCart
          ? 'order_replace'
          : 'cart_replace'
        : wantsCart
          ? RE.add.test(text)
            ? 'cart_add'
            : RE.remove.test(text)
              ? 'cart_remove'
              : 'cart_status'
          : RE.add.test(text)
            ? 'order_edit_add'
            : RE.remove.test(text)
              ? 'order_edit_remove'
              : RE.cancel.test(text)
                ? 'cancellation'
                : RE.address.test(text)
                  ? 'address_change'
                  : RE.status.test(text)
                    ? 'order_status'
                    : RE.products.test(text)
                      ? 'product_search'
                      : null;
  if (intent) setCtx({ intent, misunderstandings: 0 });

  const needsOrders =
    intent !== null &&
    !['product_search', 'cart_add', 'cart_remove', 'cart_status', 'cart_replace', 'cart_clear', 'place_order'].includes(
      intent,
    );
  const orders = needsOrders ? await loadOrders() : [];
  const editable = orders.filter((o) => o.can_edit_items);
  const explicitCode = extractOrderCode(text);
  const remembered = ctx().orderIds[ctx().orderIds.length - 1];

  /** Picks the order the customer means: stated → only editable one → last discussed. */
  const resolveOrder = (needsEditable: boolean): AgentOrder | null => {
    if (explicitCode) return orders.find((o) => o.order_id === explicitCode) ?? null;
    const pool = needsEditable ? editable : orders;
    if (pool.length === 1) return pool[0];
    const previous = pool.find((o) => o.order_id === remembered);
    return previous ?? null;
  };

  switch (intent) {
    case 'cart_status': {
      const outcome = await call('get_cart_status');
      if (!outcome.ok) return `${outcome.result.message}`;
      const lines = ((outcome.result.cart as AgentCartLine[]) ?? []).filter(Boolean);
      if (lines.length === 0) {
        return pick(lang, {
          en: 'Your cart is empty right now. Tell me what to add — e.g. "add a kettle to my cart" — or browse the shopping page.',
          hi: 'आपका कार्ट अभी खाली है। बताइए क्या जोड़ूँ — जैसे "कार्ट में केतली डालो" — या शॉपिंग पेज देखें।',
          hinglish: 'Aapka cart abhi khaali hai. Batayein kya add karoon — jaise "cart mein kettle daalo" — ya shopping page browse karein.',
        });
      }
      const items = lines.map((l) => `${l.qty} x ${l.product} (₹${l.total_inr})`).join(', ');
      return `${pick(lang, { en: 'Your cart:', hi: 'आपका कार्ट:', hinglish: 'Aapka cart:' })} ${items}. ${pick(lang, {
        en: 'Total',
        hi: 'कुल',
        hinglish: 'Total',
      })} ₹${outcome.result.total_inr}. ${pick(lang, {
        en: 'Should I add or remove anything?',
        hi: 'कुछ जोड़ूँ या हटाऊँ?',
        hinglish: 'Kuch add ya remove karoon?',
      })}`;
    }

    case 'cart_add': {
      const phrase = extractProductPhrase(text);
      if (!phrase) {
        return pick(lang, {
          en: 'Which product should I add to your cart?',
          hi: 'कार्ट में कौन सा प्रोडक्ट जोड़ूँ?',
          hinglish: 'Cart mein kaunsa product add karoon?',
        });
      }
      const qty = extractQty(text) ?? 1;
      const outcome = await call('add_item_to_cart', { product: phrase, quantity: qty });
      if (outcome.ok) return `${outcome.result.message}\n${describeCart(lang, outcome.result)}`;
      if (outcome.result.error === 'CONFIRMATION_REQUIRED') {
        const preview = outcome.result.preview as Record<string, unknown>;
        setCtx({
          pendingAction: {
            tool: 'add_item_to_cart',
            args: { product: String(preview.sku ?? phrase), quantity: qty },
            stage: 'confirm',
          },
        });
        note(`wants to add ${qty} x ${preview.product} to the cart`);
        return pick(lang, {
          en: `${preview.product} costs ₹${preview.unit_price_inr}. Adding ${qty} makes your cart total ₹${preview.new_total_inr}. Should I add it to your cart? (yes / no)`,
          hi: `${preview.product} की कीमत ₹${preview.unit_price_inr} है। ${qty} जोड़ने पर कार्ट का कुल ₹${preview.new_total_inr} हो जाएगा। कार्ट में जोड़ दूँ? (हाँ / नहीं)`,
          hinglish: `${preview.product} ka price ₹${preview.unit_price_inr} hai. ${qty} add karne par cart ka total ₹${preview.new_total_inr} ho jayega. Cart mein add kar doon? (haan / nahi)`,
        });
      }
      return `${outcome.result.message}`;
    }

    case 'cart_remove': {
      const currentCart = await call('get_cart_status');
      const lines = ((currentCart.result.cart as AgentCartLine[]) ?? []).filter(Boolean);
      const phrase = extractProductPhrase(text);
      if (!phrase) {
        if (lines.length === 0) {
          return pick(lang, {
            en: 'Your cart is already empty.',
            hi: 'आपका कार्ट पहले से खाली है।',
            hinglish: 'Aapka cart pehle se khaali hai.',
          });
        }
        return `${pick(lang, { en: 'Your cart has:', hi: 'आपके कार्ट में है:', hinglish: 'Aapke cart mein hai:' })} ${lines
          .map((l) => `${l.qty} x ${l.product}`)
          .join(', ')}. ${pick(lang, {
          en: 'Which one should I remove?',
          hi: 'किसे हटाऊँ?',
          hinglish: 'Kise remove karoon?',
        })}`;
      }
      const qty = extractQty(text);
      const outcome = await call('remove_item_from_cart', {
        product: phrase,
        ...(qty ? { quantity: qty } : {}),
      });
      if (outcome.ok) return `${outcome.result.message}\n${describeCart(lang, outcome.result)}`;
      if (outcome.result.error === 'CONFIRMATION_REQUIRED') {
        const preview = outcome.result.preview as Record<string, unknown>;
        setCtx({
          pendingAction: {
            tool: 'remove_item_from_cart',
            args: { product: String(preview.sku ?? phrase), ...(qty ? { quantity: qty } : {}) },
            stage: 'confirm',
          },
        });
        note(`wants to remove ${preview.removing_qty} x ${preview.product} from the cart`);
        return pick(lang, {
          en: `Removing ${preview.removing_qty} x ${preview.product} from your cart. The cart total would be ₹${preview.new_total_inr}. Should I go ahead? (yes / no)`,
          hi: `कार्ट से ${preview.removing_qty} x ${preview.product} हटा रही हूँ। कार्ट का कुल ₹${preview.new_total_inr} रह जाएगा। आगे बढ़ूँ? (हाँ / नहीं)`,
          hinglish: `Cart se ${preview.removing_qty} x ${preview.product} hata rahi hoon. Cart total ₹${preview.new_total_inr} reh jayega. Aage badhoon? (haan / nahi)`,
        });
      }
      if (outcome.result.error === 'NOT_IN_CART') {
        return `${pick(lang, {
          en: 'That product is not in your cart.',
          hi: 'यह प्रोडक्ट आपके कार्ट में नहीं है।',
          hinglish: 'Yeh product aapke cart mein nahi hai.',
        })} ${
          lines.length
            ? `${pick(lang, { en: 'Your cart has:', hi: 'कार्ट में है:', hinglish: 'Cart mein hai:' })} ${lines
                .map((l) => `${l.qty} x ${l.product}`)
                .join(', ')}.`
            : pick(lang, { en: 'The cart is empty.', hi: 'कार्ट खाली है।', hinglish: 'Cart khaali hai.' })
        }`;
      }
      return `${outcome.result.message}`;
    }

    case 'cart_replace': {
      const current = await call('get_cart_status');
      const lines = ((current.result.cart as AgentCartLine[]) ?? []).filter(Boolean);
      const cartText = lines.map((l) => `${l.qty} x ${l.product}`).join(', ');
      if (lines.length === 0) {
        return pick(lang, {
          en: 'Your cart is empty right now, so there is nothing to replace. Tell me what you would like to add.',
          hi: 'आपका कार्ट अभी खाली है, इसलिए बदलने के लिए कुछ नहीं है। बताइए क्या जोड़ूँ?',
          hinglish: 'Aapka cart abhi khaali hai, isliye replace karne ke liye kuch nahi hai. Bataiye kya add karoon?',
        });
      }
      const pair = extractReplacePair(text);
      if (!pair) {
        return `${pick(lang, { en: 'Your cart has:', hi: 'आपके कार्ट में है:', hinglish: 'Aapke cart mein hai:' })} ${cartText}. ${pick(
          lang,
          {
            en: 'Which product should I replace, and what should I put in its place?',
            hi: 'किस प्रोडक्ट को बदलूँ, और उसकी जगह क्या डालूँ?',
            hinglish: 'Kaunsa product replace karoon, aur uski jagah kya daaloon?',
          },
        )}`;
      }
      const qty = extractQty(text);
      const outcome = await call('replace_cart_item', {
        old_product: pair.from,
        new_product: pair.to,
        ...(qty ? { quantity: qty } : {}),
      });
      if (outcome.ok) return `${outcome.result.message}\n${describeCart(lang, outcome.result)}`;
      if (outcome.result.error === 'CONFIRMATION_REQUIRED') {
        const preview = outcome.result.preview as Record<string, unknown>;
        const removing = preview.removing as Record<string, unknown>;
        const adding = preview.adding as Record<string, unknown>;
        setCtx({
          pendingAction: {
            tool: 'replace_cart_item',
            args: {
              old_product: String(removing.sku ?? pair.from),
              new_product: String(adding.sku ?? pair.to),
              ...(qty ? { quantity: qty } : {}),
            },
            stage: 'confirm',
          },
        });
        note(`wants to replace ${removing.product} with ${adding.product} in the cart`);
        return pick(lang, {
          en: `Yes, I can do that. Your cart has ${removing.qty} x ${removing.product}. I will replace it with ${adding.qty} x ${adding.product} (₹${adding.unit_price_inr} each), making the cart total ₹${preview.new_total_inr}. Should I go ahead? (yes / no)`,
          hi: `जी हाँ, यह हो सकता है। आपके कार्ट में ${removing.qty} x ${removing.product} है। मैं इसे ${adding.qty} x ${adding.product} (₹${adding.unit_price_inr} प्रति) से बदल दूँगी, कार्ट का कुल ₹${preview.new_total_inr} हो जाएगा। आगे बढ़ूँ? (हाँ / नहीं)`,
          hinglish: `Ji haan, ho jayega. Aapke cart mein ${removing.qty} x ${removing.product} hai. Main ise ${adding.qty} x ${adding.product} (₹${adding.unit_price_inr} each) se replace kar doongi, cart total ₹${preview.new_total_inr} ho jayega. Aage badhoon? (haan / nahi)`,
        });
      }
      if (outcome.result.error === 'NOT_IN_CART') {
        return `${pick(lang, {
          en: `I checked your cart and "${pair.from}" is not in it.`,
          hi: `मैंने आपका कार्ट देखा — उसमें "${pair.from}" नहीं है।`,
          hinglish: `Maine aapka cart check kiya — usmein "${pair.from}" nahi hai.`,
        })} ${pick(lang, { en: 'It has:', hi: 'उसमें है:', hinglish: 'Usmein hai:' })} ${cartText}. ${pick(lang, {
          en: `Should I add ${pair.to} instead, or replace one of these?`,
          hi: `क्या ${pair.to} जोड़ दूँ, या इनमें से कोई बदलूँ?`,
          hinglish: `Kya ${pair.to} add kar doon, ya inmein se koi replace karoon?`,
        })}`;
      }
      return `${outcome.result.message}`;
    }

    case 'cart_clear': {
      const outcome = await call('clear_cart');
      if (outcome.ok) return `${outcome.result.message}`;
      if (outcome.result.error === 'CONFIRMATION_REQUIRED') {
        const preview = outcome.result.preview as Record<string, unknown>;
        const removing = ((preview.removing as string[]) ?? []).join(', ');
        setCtx({ pendingAction: { tool: 'clear_cart', args: {}, stage: 'confirm' } });
        note('wants to empty the cart');
        return pick(lang, {
          en: `Your cart has ${removing} (₹${preview.current_total_inr}). Emptying it removes everything. Should I go ahead? (yes / no)`,
          hi: `आपके कार्ट में ${removing} (₹${preview.current_total_inr}) है। खाली करने पर सब हट जाएगा। आगे बढ़ूँ? (हाँ / नहीं)`,
          hinglish: `Aapke cart mein ${removing} (₹${preview.current_total_inr}) hai. Khali karne par sab hat jayega. Aage badhoon? (haan / nahi)`,
        });
      }
      return `${outcome.result.message}`;
    }

    case 'place_order': {
      const outcome = await call('place_order');
      if (outcome.ok) return `${outcome.result.message}`;
      if (outcome.result.error === 'CONFIRMATION_REQUIRED') {
        const preview = outcome.result.preview as Record<string, unknown>;
        const items = ((preview.items as string[]) ?? []).join(', ');
        setCtx({ pendingAction: { tool: 'place_order', args: {}, stage: 'confirm' } });
        note(`wants to place an order for ₹${preview.total_inr}`);
        return pick(lang, {
          en: `Yes, I can place it. Your cart: ${items} — total ₹${preview.total_inr}, delivering to ${preview.shipping_address}, payment ${preview.payment_method}. Should I place the order? (yes / no)`,
          hi: `जी हाँ, ऑर्डर कर सकती हूँ। आपका कार्ट: ${items} — कुल ₹${preview.total_inr}, डिलीवरी ${preview.shipping_address} पर, भुगतान ${preview.payment_method}. ऑर्डर कर दूँ? (हाँ / नहीं)`,
          hinglish: `Ji haan, order kar sakti hoon. Aapka cart: ${items} — total ₹${preview.total_inr}, delivery ${preview.shipping_address} par, payment ${preview.payment_method}. Order kar doon? (haan / nahi)`,
        });
      }
      if (outcome.result.error === 'CART_EMPTY') {
        return pick(lang, {
          en: 'Your cart is empty, so there is nothing to order yet. Tell me what to add — for example "add a kettle to my cart".',
          hi: 'आपका कार्ट खाली है, इसलिए अभी ऑर्डर करने को कुछ नहीं है। बताइए क्या जोड़ूँ — जैसे "कार्ट में केतली डालो"।',
          hinglish: 'Aapka cart khaali hai, isliye abhi order karne ko kuch nahi hai. Bataiye kya add karoon — jaise "cart mein kettle daalo".',
        });
      }
      if (outcome.result.error === 'ADDRESS_REQUIRED') {
        setCtx({ pendingAction: { tool: 'place_order', args: {}, stage: 'collect_address' } });
        return pick(lang, {
          en: 'I can place the order — I just need the delivery address. Please type it in full (house/flat, area, city, 6-digit PIN).',
          hi: 'ऑर्डर कर सकती हूँ — बस डिलीवरी का पता चाहिए। कृपया पूरा पता लिखें (मकान/फ्लैट, क्षेत्र, शहर, 6 अंकों का पिन)।',
          hinglish: 'Order kar sakti hoon — bas delivery address chahiye. Please poora address likhiye (house/flat, area, city, 6-digit PIN).',
        });
      }
      return `${outcome.result.message}`;
    }

    case 'order_replace': {
      const order = resolveOrder(true);
      if (!order) {
        return editable.length === 0
          ? pick(lang, {
              en: 'None of your orders is in the PLACED stage anymore, so its items cannot be changed. I can put the new product in your cart instead — should I?',
              hi: 'आपका कोई ऑर्डर अब "Placed" चरण में नहीं है, इसलिए आइटम नहीं बदले जा सकते। नया प्रोडक्ट कार्ट में डाल दूँ?',
              hinglish: 'Aapka koi order ab "Placed" stage mein nahi hai, isliye items change nahi ho sakte. Naya product cart mein daal doon?',
            })
          : listOrdersText(lang, editable);
      }
      const pair = extractReplacePair(text);
      if (!pair) {
        return `${pick(lang, {
          en: `${order.order_id} contains: ${order.items.join(', ')}. Which item should I replace, and with what?`,
          hi: `${order.order_id} में हैं: ${order.items.join(', ')}. किसे बदलूँ, और किससे?`,
          hinglish: `${order.order_id} mein hain: ${order.items.join(', ')}. Kise replace karoon, aur kis se?`,
        })}`;
      }
      const qty = extractQty(text);
      const outcome = await call('replace_item_in_order', {
        order_id: order.order_id,
        old_product: pair.from,
        new_product: pair.to,
        ...(qty ? { quantity: qty } : {}),
      });
      if (outcome.ok) {
        const updated = outcome.result.order as AgentOrder | undefined;
        return `${outcome.result.message}${updated ? `\n${describeOrder(lang, updated)}` : ''}`;
      }
      if (outcome.result.error === 'CONFIRMATION_REQUIRED') {
        const preview = outcome.result.preview as Record<string, unknown>;
        const removing = preview.removing as Record<string, unknown>;
        const adding = preview.adding as Record<string, unknown>;
        setCtx({
          pendingAction: {
            tool: 'replace_item_in_order',
            args: {
              order_id: order.order_id,
              old_product: String(removing.sku ?? pair.from),
              new_product: String(adding.sku ?? pair.to),
              ...(qty ? { quantity: qty } : {}),
            },
            stage: 'confirm',
          },
        });
        note(`wants to replace ${removing.product} with ${adding.product} in ${order.order_id}`);
        return pick(lang, {
          en: `Yes, I can do that. ${order.order_id} has ${removing.qty} x ${removing.product}. I will replace it with ${adding.qty} x ${adding.product} (₹${adding.unit_price_inr} each), new order total ₹${preview.new_total_inr}. Should I go ahead? (yes / no)`,
          hi: `जी हाँ, हो सकता है। ${order.order_id} में ${removing.qty} x ${removing.product} है। इसे ${adding.qty} x ${adding.product} (₹${adding.unit_price_inr} प्रति) से बदल दूँगी, ऑर्डर का नया कुल ₹${preview.new_total_inr}. आगे बढ़ूँ? (हाँ / नहीं)`,
          hinglish: `Ji haan, ho jayega. ${order.order_id} mein ${removing.qty} x ${removing.product} hai. Ise ${adding.qty} x ${adding.product} (₹${adding.unit_price_inr} each) se replace kar doongi, naya order total ₹${preview.new_total_inr}. Aage badhoon? (haan / nahi)`,
        });
      }
      return `${outcome.result.message}`;
    }

    case 'product_search': {
      const phrase = extractProductPhrase(text);
      const outcome = await call('search_products', { query: phrase || text });
      const products = ((outcome.result.products as AgentProduct[]) ?? []).slice(0, 5);
      if (products.length === 0) {
        return pick(lang, {
          en: 'I could not find that in the NexaMart catalogue. Try a different word, e.g. "headphones", "kettle" or "saree".',
          hi: 'यह NexaMart कैटलॉग में नहीं मिला। कोई और शब्द आज़माएँ, जैसे "headphones", "kettle" या "saree"।',
          hinglish: 'Yeh NexaMart catalogue mein nahi mila. Koi aur word try karein, jaise "headphones", "kettle" ya "saree".',
        });
      }
      const lines = products.map((p) => `• ${p.title} — ₹${p.price_inr} (${p.sku})`).join('\n');
      return `${pick(lang, {
        en: 'These match in our catalogue:',
        hi: 'हमारे कैटलॉग में ये मिले:',
        hinglish: 'Hamare catalogue mein ye mile:',
      })}\n${lines}\n${pick(lang, {
        en: 'Tell me which one to add to your placed order, or add it yourself from the shopping page.',
        hi: 'बताइए किसे आपके "Placed" ऑर्डर में जोड़ूँ, या शॉपिंग पेज से खुद जोड़ लें।',
        hinglish: 'Bataiye kise aapke "Placed" order mein add karoon, ya shopping page se khud add kar lijiye.',
      })}`;
    }

    case 'order_status': {
      const order = resolveOrder(false);
      if (!order) return listOrdersText(lang, orders);
      setCtx({ orderIds: [...new Set([...ctx().orderIds, order.order_id])] });
      return `${describeOrder(lang, order)} ${
        order.can_edit_items
          ? pick(lang, {
              en: 'It is still in the PLACED stage, so I can add or remove items, change the address or cancel it.',
              hi: 'यह अभी "Placed" है, तो मैं आइटम जोड़/हटा सकती हूँ, पता बदल सकती हूँ या रद्द कर सकती हूँ।',
              hinglish: 'Yeh abhi "Placed" hai, to main items add/remove kar sakti hoon, address change ya cancel bhi kar sakti hoon.',
            })
          : pick(lang, {
              en: 'It has left the PLACED stage, so its items can no longer be changed.',
              hi: 'यह "Placed" चरण से आगे बढ़ चुका है, इसलिए अब आइटम नहीं बदले जा सकते।',
              hinglish: 'Yeh "Placed" stage se aage nikal chuka hai, isliye ab items change nahi ho sakte.',
            })
      }`;
    }

    case 'order_edit_add': {
      const order = resolveOrder(true);
      if (!order) {
        if (editable.length === 0) {
          // Nothing is editable anymore — but "add X" still makes sense for the
          // cart, so offer that instead of dead-ending the request.
          const phrase = extractProductPhrase(text);
          if (phrase) {
            const qty = extractQty(text) ?? 1;
            const preview = await call('add_item_to_cart', { product: phrase, quantity: qty });
            if (preview.result.error === 'CONFIRMATION_REQUIRED') {
              const p = preview.result.preview as Record<string, unknown>;
              setCtx({
                pendingAction: {
                  tool: 'add_item_to_cart',
                  args: { product: String(p.sku ?? phrase), quantity: qty },
                  stage: 'confirm',
                },
              });
              note(`wants to add ${qty} x ${p.product}; no PLACED order, offered the cart instead`);
              return pick(lang, {
                en: `None of your orders is still in the PLACED stage, so I can't add to an order. Should I add ${qty} x ${p.product} (₹${p.unit_price_inr}) to your cart instead? New cart total: ₹${p.new_total_inr}. (yes / no)`,
                hi: `आपका कोई ऑर्डर "Placed" चरण में नहीं है, इसलिए ऑर्डर में नहीं जोड़ सकती। क्या ${qty} x ${p.product} (₹${p.unit_price_inr}) कार्ट में जोड़ दूँ? कार्ट का नया कुल: ₹${p.new_total_inr}. (हाँ / नहीं)`,
                hinglish: `Aapka koi order "Placed" stage mein nahi hai, isliye order mein add nahi kar sakti. Kya ${qty} x ${p.product} (₹${p.unit_price_inr}) cart mein add kar doon? Naya cart total: ₹${p.new_total_inr}. (haan / nahi)`,
              });
            }
          }
          return pick(lang, {
            en: 'None of your orders is in the PLACED stage anymore, so items cannot be added. Placing a new order takes a second on the shopping page.',
            hi: 'आपका कोई ऑर्डर अब "Placed" चरण में नहीं है, इसलिए आइटम नहीं जोड़े जा सकते। शॉपिंग पेज से नया ऑर्डर करें।',
            hinglish: 'Aapka koi order ab "Placed" stage mein nahi hai, isliye item add nahi ho sakta. Shopping page se naya order kar lijiye.',
          });
        }
        return listOrdersText(lang, editable);
      }
      const phrase = extractProductPhrase(text);
      if (!phrase) {
        return pick(lang, {
          en: `Which product should I add to ${order.order_id}?`,
          hi: `${order.order_id} में कौन सा प्रोडक्ट जोड़ूँ?`,
          hinglish: `${order.order_id} mein kaunsa product add karoon?`,
        });
      }
      const qty = extractQty(text) ?? 1;
      const outcome = await call('add_item_to_order', { order_id: order.order_id, product: phrase, quantity: qty });
      if (outcome.ok) return `${outcome.result.message}`;
      if (outcome.result.error === 'CONFIRMATION_REQUIRED') {
        const preview = outcome.result.preview as Record<string, unknown>;
        setCtx({
          pendingAction: {
            tool: 'add_item_to_order',
            args: { order_id: order.order_id, product: String(preview.sku ?? phrase), quantity: qty },
            stage: 'confirm',
          },
        });
        note(`wants to add ${qty} x ${preview.product} to ${order.order_id}`);
        return pick(lang, {
          en: `${preview.product} costs ₹${preview.unit_price_inr}. Adding ${qty} makes the total for ${order.order_id} ₹${preview.new_total_inr}. Should I add it? (yes / no)`,
          hi: `${preview.product} की कीमत ₹${preview.unit_price_inr} है। ${qty} जोड़ने पर ${order.order_id} का कुल ₹${preview.new_total_inr} हो जाएगा। जोड़ दूँ? (हाँ / नहीं)`,
          hinglish: `${preview.product} ka price ₹${preview.unit_price_inr} hai. ${qty} add karne par ${order.order_id} ka total ₹${preview.new_total_inr} ho jayega. Add kar doon? (haan / nahi)`,
        });
      }
      return `${outcome.result.message}`;
    }

    case 'order_edit_remove': {
      const order = resolveOrder(true);
      if (!order) {
        return editable.length === 0
          ? pick(lang, {
              en: 'None of your orders is in the PLACED stage anymore, so items cannot be removed.',
              hi: 'आपका कोई ऑर्डर अब "Placed" चरण में नहीं है, इसलिए आइटम नहीं हटाए जा सकते।',
              hinglish: 'Aapka koi order ab "Placed" stage mein nahi hai, isliye item remove nahi ho sakta.',
            })
          : listOrdersText(lang, editable);
      }
      const phrase = extractProductPhrase(text);
      if (!phrase) {
        return `${pick(lang, {
          en: `${order.order_id} contains: ${order.items.join(', ')}. Which one should I remove?`,
          hi: `${order.order_id} में हैं: ${order.items.join(', ')}. किसे हटाऊँ?`,
          hinglish: `${order.order_id} mein hain: ${order.items.join(', ')}. Kise remove karoon?`,
        })}`;
      }
      const outcome = await call('remove_item_from_order', { order_id: order.order_id, product: phrase });
      if (outcome.ok) return `${outcome.result.message}`;
      if (outcome.result.error === 'CONFIRMATION_REQUIRED') {
        setCtx({
          pendingAction: { tool: 'remove_item_from_order', args: { order_id: order.order_id, product: phrase }, stage: 'confirm' },
        });
        note(`wants to remove ${phrase} from ${order.order_id}`);
        return pick(lang, {
          en: `Removing "${phrase}" from ${order.order_id}. Should I go ahead? (yes / no)`,
          hi: `${order.order_id} से "${phrase}" हटा रही हूँ। आगे बढ़ूँ? (हाँ / नहीं)`,
          hinglish: `${order.order_id} se "${phrase}" hata rahi hoon. Aage badhoon? (haan / nahi)`,
        });
      }
      return `${outcome.result.message}`;
    }

    case 'cancellation': {
      const order = resolveOrder(true);
      if (!order) {
        return editable.length === 0
          ? pick(lang, {
              en: 'None of your orders can be cancelled anymore — they have all left the PLACED stage. A human agent can still look at it if you want.',
              hi: 'अब कोई ऑर्डर रद्द नहीं हो सकता — सभी "Placed" चरण से आगे हैं। चाहें तो मानव एजेंट देख सकते हैं।',
              hinglish: 'Ab koi order cancel nahi ho sakta — sabhi "Placed" stage se aage hain. Chahein to human agent dekh sakte hain.',
            })
          : listOrdersText(lang, editable);
      }
      setCtx({
        pendingAction: {
          tool: 'cancel_order',
          args: { order_id: order.order_id, reason: text.slice(0, 120) || 'customer request' },
          stage: 'confirm',
        },
      });
      note(`wants to cancel ${order.order_id}`);
      return pick(lang, {
        en: `${order.order_id} (${order.items.join(', ')}, ₹${order.total_inr}) will be cancelled. Should I cancel it? (yes / no)`,
        hi: `${order.order_id} (${order.items.join(', ')}, ₹${order.total_inr}) रद्द किया जाएगा। रद्द कर दूँ? (हाँ / नहीं)`,
        hinglish: `${order.order_id} (${order.items.join(', ')}, ₹${order.total_inr}) cancel ho jayega. Cancel kar doon? (haan / nahi)`,
      });
    }

    case 'address_change': {
      const order = resolveOrder(true);
      if (!order) {
        return editable.length === 0
          ? pick(lang, {
              en: 'The address can only be changed while an order is in the PLACED stage, and none of yours is. Shall I connect you to a human agent?',
              hi: 'पता केवल "Placed" ऑर्डर का बदला जा सकता है, और आपका कोई ऐसा नहीं है। क्या मानव एजेंट से जोड़ूँ?',
              hinglish: 'Address sirf "Placed" order ka change ho sakta hai, aur aapka koi aisa nahi hai. Human agent se connect karoon?',
            })
          : listOrdersText(lang, editable);
      }
      setCtx({ pendingAction: { tool: 'update_shipping_address', args: { order_id: order.order_id }, stage: 'collect_address' } });
      return pick(lang, {
        en: `Current address for ${order.order_id}: ${order.shipping_address}. Please type the complete new address (house/flat, area, city, PIN).`,
        hi: `${order.order_id} का वर्तमान पता: ${order.shipping_address}। कृपया पूरा नया पता लिखें (मकान/फ्लैट, क्षेत्र, शहर, पिन)।`,
        hinglish: `${order.order_id} ka current address: ${order.shipping_address}. Please poora naya address likhiye (house/flat, area, city, PIN).`,
      });
    }

    default: {
      if (RE.thanks.test(text)) {
        return pick(lang, {
          en: 'Happy to help! Have a great day.',
          hi: 'मदद करके खुशी हुई! आपका दिन शुभ हो।',
          hinglish: 'Madad karke khushi hui! Aapka din shubh ho.',
        });
      }
      if (RE.greeting.test(text)) {
        const name = ctx().customer?.name?.split(' ')[0] ?? '';
        return pick(lang, {
          en: `Hello ${name}! I can check your orders, add or remove items on an order that is still PLACED, change the address or cancel it. What do you need?`,
          hi: `नमस्ते ${name}! मैं आपके ऑर्डर देख सकती हूँ, "Placed" ऑर्डर में आइटम जोड़/हटा सकती हूँ, पता बदल सकती हूँ या रद्द कर सकती हूँ। क्या चाहिए?`,
          hinglish: `Namaste ${name}! Main aapke orders dekh sakti hoon, "Placed" order mein items add/remove kar sakti hoon, address change ya cancel kar sakti hoon. Kya chahiye?`,
        });
      }
      const misses = (ctx().misunderstandings ?? 0) + 1;
      setCtx({ misunderstandings: misses });
      if (misses >= 3) {
        return escalate('Could not understand the customer request after three attempts', ctx().intent ?? 'other');
      }
      return pick(lang, {
        en: 'I can show your orders, add or remove products on an order that is still PLACED, change the delivery address, or cancel it. Say "talk to a human" any time for a person.',
        hi: 'मैं आपके ऑर्डर दिखा सकती हूँ, "Placed" ऑर्डर में प्रोडक्ट जोड़/हटा सकती हूँ, पता बदल सकती हूँ या रद्द कर सकती हूँ। किसी व्यक्ति के लिए "इंसान से बात" लिखें।',
        hinglish: 'Main aapke orders dikha sakti hoon, "Placed" order mein product add/remove kar sakti hoon, address change ya cancel kar sakti hoon. Kisi insaan ke liye "talk to a human" likhiye.',
      });
    }
  }
}
