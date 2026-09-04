/**
 * Chat-mode agent turn.
 *
 * Voice is powered by Agora Conversational AI. For text chat, v1.md §9 allows
 * the backend LLM path as long as it shares the same conversation state,
 * tools and escalation engine — which is exactly what happens here:
 *
 *  - With `NEXT_LLM_API_KEY` + `NEXT_LLM_URL` set → an OpenAI-compatible LLM
 *    runs with the same system prompt and the same tools as the voice agent.
 *  - Without an LLM key → a deterministic rule-based agent covers the demo
 *    flows (verify by phone, order status, cancel / return / address change
 *    with explicit confirmation, tickets, escalation) through the *same*
 *    `executeTool()` layer, so guardrails are identical.
 */
import { generateText, stepCountIs, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { buildSystemPrompt } from './agent-prompt';
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
  return { text: await runRuleBasedTurn(conversation), degraded: true };
}

// ---------------------------------------------------------------------------
// LLM path
// ---------------------------------------------------------------------------

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
  const { text } = await generateText({
    model: openai(modelId),
    system: buildSystemPrompt({ mode: 'chat' }),
    messages: history,
    tools: buildConversationTools(conversation.id),
    stopWhen: stepCountIs(5),
    temperature: 0.4,
  });
  return text.trim() || 'Sorry, could you say that again?';
}

// ---------------------------------------------------------------------------
// Rule-based fallback
// ---------------------------------------------------------------------------

type Lang = 'en' | 'hi' | 'hinglish';
type Copy = Record<Lang, string>;

const HINGLISH_HINTS =
  /\b(hai|hain|kya|mera|meri|mere|karna|karo|kardo|kar do|nahi|nahin|chahiye|mujhe|aap|aapka|batao|bataiye|order ka|kab|kahan|kaha|ho gaya|karwana|wapas|paisa|paise|theek|haan|ji|bhai|please karo|dobara|abhi)\b/i;

/** Stored conversation language ("english" | "hindi" | "hinglish") → copy key. */
function toLang(stored?: string): Lang | undefined {
  if (stored === 'hindi' || stored === 'hi') return 'hi';
  if (stored === 'hinglish') return 'hinglish';
  if (stored === 'english' || stored === 'en') return 'en';
  return undefined;
}

function detectLanguage(text: string, fallback?: string): Lang {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (HINGLISH_HINTS.test(text)) return 'hinglish';
  // Numbers / order ids / short confirmations carry no language signal: keep
  // answering in the language the customer used so far.
  if (/^[\s\d+\-()#a-z]{0,12}$/i.test(text) || /^[\s\d+\-()]+$/.test(text)) {
    const prev = toLang(fallback);
    if (prev) return prev;
  }
  return 'en';
}

function pick(lang: Lang, copy: Copy): string {
  return copy[lang];
}

const RE = {
  /**
   * An explicit request to reach a person. Deliberately narrow: the previous
   * version matched bare nouns ("agent", "person", "manager", "call me"), so a
   * customer writing "the delivery agent did not come" was escalated on their
   * first message instead of being helped. Escalation now needs a request verb
   * next to a person-noun.
   */
  human:
    /\b(talk|speak|connect|transfer|put|need|want|give)\s+(me\s+)?(to|with)?\s*(a|an|some|this)?\s*(human|real|live|support|customer[- ]care|executive|representative|agent|manager|person)\b|\b(human|live)\s+(agent|support|executive|representative)\b|\bescalate(\s+(to|me))?\b|\bagent\s+na\s+(milegi|nahi\s+mili)\b|\b(insaan|insan|aadmi|human|agent|manager|executive|support|customer[- ]care|representative)\s+(se|sa|ki)\s+baat\b|\bbaat\s+(karao|karwao)\b|इंसान\s+से\s+बात|एजेंट\s+से\s+बात|किसी\s+से\s+बात|बड़ा\s+अफसर|शिकायत\s+अधिकारी/i,
  cancel: /\b(cancel|cancle|radd|rad kar|band karo|nahi chahiye)\b|रद्द|कैंसिल/i,
  ret: /\b(return|wapas|wapis|refund|exchange|lautana|lauta)\b|वापस|रिटर्न|रिफंड/i,
  address: /\b(address|pata|location|deliver(y)? (to|at|par)|ghar badal|badalna|change)\b|पता|एड्रेस/i,
  status: /\b(status|kahan|kaha|where|track|tracking|deliver|delivery|kab|when|aayega|pahuncha|pahunchega|update|order)\b|कहाँ|कब|स्टेटस|ऑर्डर|डिलीवरी/i,
  complaint:
    /\b(complain|complaint|shikayat|damaged|damage|toota|tuta|broken|kharab|defective|wrong item|galat|missing|nahi mila|not received|late|der|delay|charged|paisa kat)\b|शिकायत|खराब|टूटा|गलत/i,
  yes: /^\s*(yes|yeah|yep|ya|haan|haa|han|ha|ji|ji haan|theek|thik|ok|okay|sure|confirm|kar do|kardo|karo|bilkul|zaroor|please do|go ahead|y|हाँ|हां|जी|ठीक)\b/i,
  no: /^\s*(no|nope|nahi|nahin|na|mat|don'?t|rehne do|cancel that|wait|ruko|नहीं|मत)\b/i,
  greeting: /^\s*(hi|hii|hello|hey|namaste|namaskar|good (morning|evening|afternoon)|हेलो|नमस्ते)\b/i,
  thanks: /\b(thanks|thank you|dhanyawad|shukriya|thnx|bye|that'?s all|bas|done)\b|धन्यवाद|शुक्रिया/i,
};

function extractPhone(text: string): string | null {
  const compact = text.replace(/(\d)[\s\-.](?=\d)/g, '$1');
  const match = compact.match(/(?:\+?91)?([6-9]\d{9})(?!\d)/);
  return match ? match[1] : null;
}

function extractOrderId(text: string): string | null {
  const explicit = text.match(/\bnm\s*-?\s*(\d{4,6})\b/i);
  if (explicit) return `NM-${explicit[1]}`;
  const digits = text.match(/\b(1\d{4})\b/);
  return digits ? `NM-${digits[1]}` : null;
}

function categorize(text: string): string {
  if (/damaged|damage|toota|tuta|broken|kharab|defective|खराब|टूटा/i.test(text)) return 'damaged_item';
  if (/wrong|galat|गलत/i.test(text)) return 'missing_item';
  if (/missing|nahi mila|not received/i.test(text)) return 'missing_item';
  if (/charged|paisa|payment|paise|refund/i.test(text)) return 'payment_issue';
  if (/late|der|delay|slow/i.test(text)) return 'delivery_delay';
  return 'other';
}

interface OrderView {
  order_id: string;
  status: string;
  status_text: string;
  items: string[];
  expected_delivery: string;
  tracking_id?: string;
  courier?: string;
  shipping_address?: string;
  can_cancel: boolean;
  can_return: boolean;
  can_change_address: boolean;
  payment_method?: string;
}

function describeOrder(lang: Lang, o: OrderView): string {
  const items = o.items.join(', ');
  const tracking = o.tracking_id ? ` ${pick(lang, { en: 'Tracking', hi: 'ट्रैकिंग', hinglish: 'Tracking' })}: ${o.courier ?? ''} ${o.tracking_id}.` : '';
  switch (lang) {
    case 'hi':
      return `ऑर्डर ${o.order_id} (${items}) — स्थिति: ${o.status_text}. अपेक्षित डिलीवरी: ${o.expected_delivery}.${tracking}`;
    case 'hinglish':
      return `Order ${o.order_id} (${items}) abhi "${o.status_text}" hai. Expected delivery: ${o.expected_delivery}.${tracking}`;
    default:
      return `Order ${o.order_id} (${items}) is currently "${o.status_text}". Expected delivery: ${o.expected_delivery}.${tracking}`;
  }
}

function listOrdersText(lang: Lang, orders: OrderView[]): string {
  const lines = orders.map((o) => `• ${o.order_id}: ${o.items.join(', ')} — ${o.status_text}`).join('\n');
  return pick(lang, {
    en: `Here are your recent orders:\n${lines}\nWhich order number should I look at?`,
    hi: `आपके हाल के ऑर्डर:\n${lines}\nकिस ऑर्डर नंबर के बारे में बात करें?`,
    hinglish: `Aapke recent orders:\n${lines}\nKis order number ke baare mein baat karein?`,
  });
}

async function runRuleBasedTurn(conversation: Conversation): Promise<string> {
  const messages = listMessages(conversation.id);
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const text = last?.content?.trim() ?? '';
  const lang = detectLanguage(text, conversation.context.language);
  updateConversation(conversation.id, { context: { language: lang === 'hi' ? 'hindi' : lang === 'hinglish' ? 'hinglish' : 'english' } });

  const ctx = () => getConversation(conversation.id)!.context;
  const setCtx = (patch: Partial<Conversation['context']>) => updateConversation(conversation.id, { context: patch });
  const lastOrderId = () => ctx().orderIds[ctx().orderIds.length - 1];

  const escalate = async (reason: string, intent: string, extraMissing: string[] = []) => {
    const c = ctx();
    const summary = `Customer ${c.customer ? `${c.customer.name} ` : ''}in text chat (${c.language ?? 'unknown'}) — intent: ${intent}. ${c.orderIds.length ? `Orders discussed: ${c.orderIds.join(', ')}. ` : ''}${reason}. Last message: "${text.slice(0, 160)}"`;
    const outcome = await executeTool(conversation.id, 'escalate_to_human', {
      reason,
      intent,
      summary,
      customer_name: c.customerName,
      language: c.language,
      confidence: 0.45,
      missing_information: extraMissing,
    });
    if (!outcome.ok) {
      return pick(lang, {
        en: 'I could not reach a human agent right now. Please try again in a moment.',
        hi: 'अभी मानव एजेंट से संपर्क नहीं हो पाया। कृपया थोड़ी देर बाद पुनः प्रयास करें।',
        hinglish: 'Abhi human agent se connect nahi ho paya. Please thodi der baad dobara try karein.',
      });
    }
    return pick(lang, {
      en: `Sure. I've created case ${outcome.result.case_id} and a human support agent will continue this chat shortly. Please stay here.`,
      hi: `ज़रूर। मैंने केस ${outcome.result.case_id} बनाया है, एक मानव सहायता एजेंट जल्द ही यहाँ बात जारी रखेंगे। कृपया प्रतीक्षा करें।`,
      hinglish: `Zaroor. Maine case ${outcome.result.case_id} bana diya hai, ek human support agent thodi der mein isi chat mein aapse baat karenge. Please yahin rahiye.`,
    });
  };

  // 1. Pending confirmation / address collection ---------------------------------
  const pending = ctx().pendingAction;
  if (pending) {
    if (pending.stage === 'collect_address') {
      if (RE.no.test(text) || RE.human.test(text)) {
        setCtx({ pendingAction: undefined });
        if (RE.human.test(text)) return escalate('Customer asked for a human agent', 'address_change');
        return pick(lang, { en: 'Okay, I have not changed anything. Anything else?', hi: 'ठीक है, मैंने कुछ नहीं बदला। और कुछ?', hinglish: 'Theek hai, maine kuch change nahi kiya. Aur kuch?' });
      }
      if (text.length < 10) {
        return pick(lang, {
          en: 'Please type the complete new address: house/flat, street or area, city and 6-digit PIN code.',
          hi: 'कृपया पूरा नया पता लिखें: मकान/फ्लैट, गली या क्षेत्र, शहर और 6 अंकों का पिन कोड।',
          hinglish: 'Please poora naya address likhiye: house/flat, street ya area, city aur 6-digit PIN code.',
        });
      }
      setCtx({ pendingAction: { ...pending, args: { ...pending.args, new_address: text }, stage: 'confirm' } });
      return pick(lang, {
        en: `New address for ${pending.args.order_id}: "${text}". Should I update it? (yes / no)`,
        hi: `${pending.args.order_id} का नया पता: "${text}"। क्या मैं इसे अपडेट कर दूँ? (हाँ / नहीं)`,
        hinglish: `${pending.args.order_id} ka naya address: "${text}". Kya main update kar doon? (haan / nahi)`,
      });
    }
    if (pending.stage === 'confirm') {
      if (RE.yes.test(text)) {
        setCtx({ pendingAction: undefined });
        const outcome = await executeTool(conversation.id, pending.tool, { ...pending.args, confirmed: true });
        if (!outcome.ok) {
          return `${pick(lang, { en: 'Sorry, that did not work:', hi: 'क्षमा करें, यह नहीं हो पाया:', hinglish: 'Sorry, yeh ho nahi paya:' })} ${outcome.result.message ?? outcome.result.error}. ${pick(lang, { en: 'Would you like me to connect you to a human agent?', hi: 'क्या मैं आपको मानव एजेंट से जोड़ दूँ?', hinglish: 'Kya main aapko human agent se connect karoon?' })}`;
        }
        const done: Record<string, Copy> = {
          cancel_order: {
            en: `Done — order ${pending.args.order_id} is cancelled. ${outcome.result.message}`,
            hi: `हो गया — ऑर्डर ${pending.args.order_id} रद्द कर दिया गया है। ${outcome.result.message}`,
            hinglish: `Ho gaya — order ${pending.args.order_id} cancel kar diya hai. ${outcome.result.message}`,
          },
          request_return: {
            en: `Done — return requested for ${pending.args.order_id}. ${outcome.result.message}`,
            hi: `हो गया — ${pending.args.order_id} के लिए रिटर्न दर्ज कर दिया गया है। ${outcome.result.message}`,
            hinglish: `Ho gaya — ${pending.args.order_id} ka return request kar diya hai. ${outcome.result.message}`,
          },
          update_shipping_address: {
            en: `Done — the address for ${pending.args.order_id} is updated.`,
            hi: `हो गया — ${pending.args.order_id} का पता अपडेट कर दिया गया है।`,
            hinglish: `Ho gaya — ${pending.args.order_id} ka address update kar diya hai.`,
          },
        };
        return `${pick(lang, done[pending.tool] ?? { en: 'Done.', hi: 'हो गया।', hinglish: 'Ho gaya.' })} ${pick(lang, { en: 'Anything else I can help with?', hi: 'और कुछ मदद करूँ?', hinglish: 'Aur kuch madad karoon?' })}`;
      }
      if (RE.no.test(text)) {
        setCtx({ pendingAction: undefined });
        return pick(lang, { en: 'Okay, I have not changed anything. Anything else?', hi: 'ठीक है, मैंने कुछ नहीं बदला। और कुछ?', hinglish: 'Theek hai, maine kuch change nahi kiya. Aur kuch?' });
      }
      // Customer changed topic — drop the pending action and continue.
      setCtx({ pendingAction: undefined });
    }
  }

  // 2. Explicit human request -----------------------------------------------------
  if (RE.human.test(text)) {
    return escalate('Customer asked for a human agent', ctx().intent ?? 'other');
  }

  // 3. Identify intent ------------------------------------------------------------
  const intent = RE.cancel.test(text)
    ? 'cancellation'
    : RE.ret.test(text)
      ? 'return'
      : RE.address.test(text)
        ? 'address_change'
        : RE.complaint.test(text)
          ? 'complaint'
          : RE.status.test(text)
            ? 'order_status'
            : null;
  if (intent) setCtx({ intent, misunderstandings: 0 });

  // 4. Verification gate ------------------------------------------------------------
  if (!ctx().customer) {
    const phone = extractPhone(text);
    if (phone) {
      const outcome = await executeTool(conversation.id, 'verify_customer', { phone });
      if (!outcome.ok) {
        const misses = (ctx().misunderstandings ?? 0) + 1;
        setCtx({ misunderstandings: misses });
        if (misses >= 3) return escalate('Could not verify the customer by phone number after three attempts', ctx().intent ?? 'verification', ['verified phone number']);
        return pick(lang, {
          en: `I couldn't find an account for ${phone}. Could you re-check the registered mobile number?`,
          hi: `${phone} के लिए कोई खाता नहीं मिला। कृपया पंजीकृत मोबाइल नंबर दोबारा जाँचें।`,
          hinglish: `${phone} ke liye koi account nahi mila. Kya aap registered mobile number dobara check kar sakte hain?`,
        });
      }
      const customer = outcome.result.customer as { name: string };
      const recent = (outcome.result.recent_orders as OrderView[]) ?? [];
      const followUp: Copy = {
        cancellation: { en: 'Which order would you like to cancel?', hi: 'आप कौन सा ऑर्डर रद्द करना चाहते हैं?', hinglish: 'Kaunsa order cancel karna hai?' },
        return: { en: 'Which order would you like to return?', hi: 'आप कौन सा ऑर्डर वापस करना चाहते हैं?', hinglish: 'Kaunsa order return karna hai?' },
        address_change: { en: 'Which order needs a new address?', hi: 'किस ऑर्डर का पता बदलना है?', hinglish: 'Kis order ka address change karna hai?' },
        order_status: { en: 'Which order should I check?', hi: 'कौन सा ऑर्डर देखूँ?', hinglish: 'Kaunsa order check karoon?' },
        complaint: { en: 'Which order is the issue about?', hi: 'यह समस्या किस ऑर्डर से जुड़ी है?', hinglish: 'Yeh problem kis order ke baare mein hai?' },
      }[ctx().intent ?? ''] ?? { en: 'How can I help you today?', hi: 'आज मैं आपकी कैसे मदद कर सकती हूँ?', hinglish: 'Aaj main aapki kaise madad kar sakti hoon?' };
      const recentLines = recent.length
        ? '\n' + recent.map((o) => `• ${o.order_id}: ${o.items.join(', ')} — ${o.status}`).join('\n') + '\n'
        : ' ';
      return `${pick(lang, { en: `Thank you, ${customer.name}! Your account is verified.`, hi: `धन्यवाद, ${customer.name}! आपका खाता सत्यापित हो गया।`, hinglish: `Dhanyavaad, ${customer.name}! Aapka account verify ho gaya.` })}${recentLines}${pick(lang, followUp)}`;
    }
    if (RE.thanks.test(text) && !intent) {
      return pick(lang, { en: 'You’re welcome! Have a great day.', hi: 'आपका स्वागत है! आपका दिन शुभ हो।', hinglish: 'Aapka swagat hai! Aapka din shubh ho.' });
    }
    const lead = RE.greeting.test(text) || !intent
      ? pick(lang, { en: 'Hello! I can help with your NexaMart orders.', hi: 'नमस्ते! मैं आपके NexaMart ऑर्डर में मदद कर सकती हूँ।', hinglish: 'Namaste! Main aapke NexaMart orders mein madad kar sakti hoon.' })
      : pick(lang, { en: 'Sure, I can help with that.', hi: 'ज़रूर, मैं इसमें मदद कर सकती हूँ।', hinglish: 'Zaroor, main isme madad kar sakti hoon.' });
    return `${lead} ${pick(lang, {
      en: 'To find your account, please share your registered 10-digit mobile number.',
      hi: 'आपका खाता ढूँढने के लिए कृपया अपना पंजीकृत 10 अंकों का मोबाइल नंबर बताएं।',
      hinglish: 'Aapka account dhoondhne ke liye please apna registered 10-digit mobile number bataiye.',
    })}`;
  }

  // 5. Verified customer flows ---------------------------------------------------------
  const orderId = extractOrderId(text) ?? (intent && intent !== 'order_status' ? lastOrderId() : extractOrderId(text));
  const currentIntent = intent ?? (orderId ? ctx().intent ?? 'order_status' : null);

  const lookup = async (id: string): Promise<OrderView | string> => {
    const outcome = await executeTool(conversation.id, 'get_order_status', { order_id: id });
    if (!outcome.ok) {
      return pick(lang, {
        en: `I couldn't find order ${id} on your account. Please re-check the order number.`,
        hi: `आपके खाते में ऑर्डर ${id} नहीं मिला। कृपया ऑर्डर नंबर दोबारा जाँचें।`,
        hinglish: `Aapke account mein order ${id} nahi mila. Please order number dobara check karein.`,
      });
    }
    return outcome.result.order as OrderView;
  };

  const askWhichOrder = async () => {
    const outcome = await executeTool(conversation.id, 'list_recent_orders', {});
    const orders = (outcome.result.orders as OrderView[]) ?? [];
    return listOrdersText(lang, orders);
  };

  switch (currentIntent) {
    case 'order_status': {
      if (!orderId) return askWhichOrder();
      const order = await lookup(orderId);
      if (typeof order === 'string') return order;
      return `${describeOrder(lang, order)} ${pick(lang, { en: 'Anything else?', hi: 'और कुछ?', hinglish: 'Aur kuch?' })}`;
    }
    case 'cancellation': {
      if (!orderId) return askWhichOrder();
      const order = await lookup(orderId);
      if (typeof order === 'string') return order;
      if (!order.can_cancel) {
        return pick(lang, {
          en: `Order ${order.order_id} is already "${order.status_text}", so it can't be cancelled now. ${order.can_return ? 'I can start a return instead — shall I?' : 'You can refuse the package at delivery and the refund is processed once it returns. Would you like a human agent to help?'}`,
          hi: `ऑर्डर ${order.order_id} पहले से "${order.status_text}" है, इसलिए अब रद्द नहीं हो सकता। ${order.can_return ? 'मैं इसके बजाय रिटर्न शुरू कर सकती हूँ — करूँ?' : 'आप डिलीवरी पर पैकेज लेने से मना कर सकते हैं, वापस आने पर रिफंड हो जाएगा। क्या मानव एजेंट से बात करना चाहेंगे?'}`,
          hinglish: `Order ${order.order_id} already "${order.status_text}" hai, isliye ab cancel nahi ho sakta. ${order.can_return ? 'Main iske bajaye return start kar sakti hoon — karoon?' : 'Aap delivery par package refuse kar sakte hain, wapas aane par refund ho jayega. Kya human agent se baat karna chahenge?'}`,
        });
      }
      setCtx({ pendingAction: { tool: 'cancel_order', args: { order_id: order.order_id, reason: 'customer request' }, stage: 'confirm' } });
      return pick(lang, {
        en: `Order ${order.order_id} (${order.items.join(', ')}) can be cancelled${order.payment_method !== 'COD' ? ' with a full refund in 5-7 business days' : ''}. Should I cancel it? (yes / no)`,
        hi: `ऑर्डर ${order.order_id} (${order.items.join(', ')}) रद्द हो सकता है${order.payment_method !== 'COD' ? ', पूरा रिफंड 5-7 कार्यदिवसों में' : ''}। क्या मैं इसे रद्द कर दूँ? (हाँ / नहीं)`,
        hinglish: `Order ${order.order_id} (${order.items.join(', ')}) cancel ho sakta hai${order.payment_method !== 'COD' ? ', full refund 5-7 business days mein' : ''}. Kya main cancel kar doon? (haan / nahi)`,
      });
    }
    case 'return': {
      if (!orderId) return askWhichOrder();
      const order = await lookup(orderId);
      if (typeof order === 'string') return order;
      if (!order.can_return) {
        return pick(lang, {
          en: `Order ${order.order_id} is "${order.status_text}", so a return isn't possible right now (returns are allowed within 7 days of delivery). Would you like me to connect you to a human agent?`,
          hi: `ऑर्डर ${order.order_id} "${order.status_text}" है, इसलिए अभी रिटर्न संभव नहीं है (डिलीवरी के 7 दिनों के भीतर रिटर्न होता है)। क्या मैं आपको मानव एजेंट से जोड़ दूँ?`,
          hinglish: `Order ${order.order_id} "${order.status_text}" hai, isliye abhi return possible nahi hai (delivery ke 7 din ke andar return hota hai). Kya main aapko human agent se connect karoon?`,
        });
      }
      setCtx({ pendingAction: { tool: 'request_return', args: { order_id: order.order_id, reason: text.slice(0, 80) }, stage: 'confirm' } });
      return pick(lang, {
        en: `I can schedule a pickup for ${order.order_id} (${order.items.join(', ')}); the refund is issued after it reaches our warehouse. Should I start the return? (yes / no)`,
        hi: `मैं ${order.order_id} (${order.items.join(', ')}) के लिए पिकअप शेड्यूल कर सकती हूँ; वेयरहाउस पहुँचने के बाद रिफंड होगा। क्या रिटर्न शुरू करूँ? (हाँ / नहीं)`,
        hinglish: `Main ${order.order_id} (${order.items.join(', ')}) ke liye pickup schedule kar sakti hoon; warehouse pahunchne ke baad refund hoga. Kya return start karoon? (haan / nahi)`,
      });
    }
    case 'address_change': {
      if (!orderId) return askWhichOrder();
      const order = await lookup(orderId);
      if (typeof order === 'string') return order;
      if (!order.can_change_address) {
        return pick(lang, {
          en: `Order ${order.order_id} has already been ${order.status_text.toLowerCase()}, so the address can't be changed. I can raise a ticket for the courier team — just say "create ticket".`,
          hi: `ऑर्डर ${order.order_id} पहले ही "${order.status_text}" है, इसलिए पता नहीं बदला जा सकता। मैं कूरियर टीम के लिए टिकट बना सकती हूँ — "टिकट बनाओ" लिखें।`,
          hinglish: `Order ${order.order_id} already "${order.status_text}" hai, isliye address change nahi ho sakta. Main courier team ke liye ticket bana sakti hoon — bas "ticket banao" likhiye.`,
        });
      }
      setCtx({ pendingAction: { tool: 'update_shipping_address', args: { order_id: order.order_id }, stage: 'collect_address' } });
      return pick(lang, {
        en: `Current address for ${order.order_id}: ${order.shipping_address}. Please type the complete new address (house/flat, area, city, PIN).`,
        hi: `${order.order_id} का वर्तमान पता: ${order.shipping_address}। कृपया पूरा नया पता लिखें (मकान/फ्लैट, क्षेत्र, शहर, पिन)।`,
        hinglish: `${order.order_id} ka current address: ${order.shipping_address}. Please poora naya address likhiye (house/flat, area, city, PIN).`,
      });
    }
    case 'complaint': {
      const category = categorize(text);
      const outcome = await executeTool(conversation.id, 'create_ticket', {
        category,
        summary: `Chat complaint (${category}): ${text.slice(0, 200)}`,
        order_id: orderId ?? undefined,
      });
      if (!outcome.ok) return escalate('Ticket creation failed', 'complaint');
      return pick(lang, {
        en: `I'm sorry about that. I've created ticket ${outcome.result.ticket_id}${orderId ? ` for order ${orderId}` : ''}; our team will get back within 24 hours. Would you also like to speak to a human agent?`,
        hi: `इसके लिए क्षमा करें। मैंने टिकट ${outcome.result.ticket_id}${orderId ? ` (ऑर्डर ${orderId})` : ''} बना दिया है; हमारी टीम 24 घंटे में संपर्क करेगी। क्या आप मानव एजेंट से भी बात करना चाहेंगे?`,
        hinglish: `Iske liye sorry. Maine ticket ${outcome.result.ticket_id}${orderId ? ` (order ${orderId})` : ''} bana diya hai; hamari team 24 ghante mein contact karegi. Kya aap human agent se bhi baat karna chahenge?`,
      });
    }
    default: {
      if (/ticket/i.test(text) || /टिकट/.test(text)) {
        const outcome = await executeTool(conversation.id, 'create_ticket', {
          category: 'other',
          summary: `Customer request via chat: ${text.slice(0, 200)}`,
          order_id: lastOrderId(),
        });
        if (outcome.ok) {
          return pick(lang, {
            en: `Ticket ${outcome.result.ticket_id} created. Our team responds within 24 hours. Anything else?`,
            hi: `टिकट ${outcome.result.ticket_id} बन गया। हमारी टीम 24 घंटे में जवाब देगी। और कुछ?`,
            hinglish: `Ticket ${outcome.result.ticket_id} ban gaya. Hamari team 24 ghante mein reply karegi. Aur kuch?`,
          });
        }
      }
      if (RE.yes.test(text) && /human|agent|एजेंट/i.test(messages[messages.length - 2]?.content ?? '')) {
        return escalate('Customer accepted the offer to talk to a human agent', ctx().intent ?? 'other');
      }
      if (RE.thanks.test(text)) {
        return pick(lang, { en: 'Happy to help! Have a great day.', hi: 'मदद करके खुशी हुई! आपका दिन शुभ हो।', hinglish: 'Madad karke khushi hui! Aapka din shubh ho.' });
      }
      const misses = (ctx().misunderstandings ?? 0) + 1;
      setCtx({ misunderstandings: misses });
      // Escalate only after a real dead end, and offer it before taking it:
      // silently opening a case reads to the customer as the bot giving up.
      if (misses >= 3) {
        return escalate('Could not understand the customer request after three attempts', ctx().intent ?? 'other');
      }
      if (misses === 2) {
        return pick(lang, {
          en: 'I\'m not sure I followed that. I can check an order, cancel or return one, change the delivery address, or raise a ticket — and if you\'d rather talk to a person, just say "talk to a human".',
          hi: 'मैं ठीक से समझ नहीं पाई। मैं ऑर्डर देख सकती हूँ, रद्द या रिटर्न कर सकती हूँ, पता बदल सकती हूँ, या टिकट बना सकती हूँ — और अगर आप किसी इंसान से बात करना चाहती हैं तो बस "इंसान से बात" लिख दें।',
          hinglish: "Main theek se samajh nahi payi. Main order check, cancel ya return kar sakti hoon, address change kar sakti hoon, ya ticket bana sakti hoon — aur agar aap kisi insaan se baat karna chahte hain to bas 'talk to a human' boliye.",
        });
      }
      return pick(lang, {
        en: 'I can check order status, cancel or return an order, change a delivery address, or raise a ticket. What would you like to do?',
        hi: 'मैं ऑर्डर स्थिति देख सकती हूँ, ऑर्डर रद्द या वापस कर सकती हूँ, पता बदल सकती हूँ, या टिकट बना सकती हूँ। आप क्या करना चाहेंगे?',
        hinglish: 'Main order status check kar sakti hoon, order cancel ya return kar sakti hoon, address change kar sakti hoon, ya ticket bana sakti hoon. Aap kya karna chahenge?',
      });
    }
  }
}
