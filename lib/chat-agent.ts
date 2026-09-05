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
 *    (orders, add/remove items on a PLACED order, cancel, address, escalation)
 *    through the *same* `executeTool()` layer, so the guardrails are identical.
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
    system: buildSystemPrompt({ mode: 'chat', customerName: conversation.context.customer?.name }),
    messages: history,
    tools: buildConversationTools(conversation.id),
    stopWhen: stepCountIs(6),
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
  /\b(hai|hain|kya|mera|meri|mere|karna|karo|kardo|kar do|nahi|nahin|chahiye|mujhe|aap|aapka|batao|bataiye|kab|kahan|kaha|ho gaya|wapas|paisa|paise|theek|haan|ji|dobara|abhi|jaldi)\b/i;

function toLang(stored?: string): Lang | undefined {
  if (stored === 'hindi' || stored === 'hi') return 'hi';
  if (stored === 'hinglish') return 'hinglish';
  if (stored === 'english' || stored === 'en') return 'en';
  return undefined;
}

function detectLanguage(text: string, fallback?: string): Lang {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (HINGLISH_HINTS.test(text)) return 'hinglish';
  if (/^[\s\d+\-()#a-z]{0,12}$/i.test(text)) {
    const prev = toLang(fallback);
    if (prev) return prev;
  }
  return 'en';
}

function pick(lang: Lang, copy: Copy): string {
  return copy[lang];
}

const RE = {
  human:
    /\b(talk|speak|connect|transfer|need|want)\s+(me\s+)?(to|with)?\s*(a|an|some)?\s*(human|real|live|support|customer[- ]care|executive|representative|agent|manager|person)\b|\b(human|live)\s+(agent|support|executive)\b|\bescalate\b|\b(insaan|insan|aadmi|human|agent|manager|executive)\s+(se|sa|ki)\s+baat\b|\bbaat\s+(karao|karwao)\b|इंसान\s+से\s+बात|एजेंट\s+से\s+बात|किसी\s+से\s+बात/i,
  add: /\b(add|include|bhi (chahiye|dal|add)|dal do|daal do|jod|add kar|order me[in]? (add|dal))\b|जोड़|डाल दो|और चाहिए/i,
  remove: /\b(remove|delete|hata|hataa|nikal|cancel the (item|product)|mat bhejo|nahi chahiye|dont want|don't want)\b|हटा|निकाल/i,
  cancel: /\b(cancel|cancle|radd|rad kar|band karo|order cancel)\b|रद्द|कैंसिल/i,
  address: /\b(address|pata|change address|address change|deliver (to|at)|new address)\b|पता|एड्रेस/i,
  status: /\b(status|kahan|kaha|where|track|tracking|deliver|delivery|kab|when|aayega|pahunch|update|my order|orders)\b|कहाँ|कब|स्टेटस|ऑर्डर|डिलीवरी/i,
  products: /\b(product|catalogue|catalog|show me|dikha|kitne ka|price|kitna|available|buy|kharid)\b|कीमत|दिखाओ|खरीद/i,
  yes: /^\s*(yes|yeah|yep|ya|haan|haa|han|ha|ji|ji haan|theek|thik|ok|okay|sure|confirm|kar do|kardo|karo|bilkul|zaroor|go ahead|y|हाँ|हां|जी|ठीक)\b/i,
  no: /^\s*(no|nope|nahi|nahin|na|mat|don'?t|rehne do|ruko|नहीं|मत)\b/i,
  greeting: /^\s*(hi|hii|hello|hey|namaste|namaskar|good (morning|evening|afternoon)|हेलो|नमस्ते)\b/i,
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

/** Strips the command words so what is left is (mostly) the product the customer named. */
function extractProductPhrase(text: string): string {
  return text
    .replace(/\bnm\s*-?\s*\d{4,6}\b/gi, ' ')
    .replace(
      /\b(please|kindly|can you|could you|i want to|i want|i would like|mujhe|main|mera|meri|order|orders|me|mein|in|to|from|the|my|a|an|add|include|remove|delete|hata|hataa|hatao|nikal|nikalo|dal|daal|do|dijiye|kar|karo|kardo|de|chahiye|bhi|aur|and|please|jaldi|abhi)\b/gi,
      ' ',
    )
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const text = last?.content?.trim() ?? '';
  const lang = detectLanguage(text, conversation.context.language);
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
        const summary = order ? `\n${describeOrder(lang, order)}` : '';
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

  // 2. Explicit human request ---------------------------------------------------
  if (RE.human.test(text)) return escalate('Customer asked for a human agent', ctx().intent ?? 'other');

  // 3. Intent -------------------------------------------------------------------
  const intent = RE.add.test(text)
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

  const orders = intent && intent !== 'product_search' ? await loadOrders() : [];
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
        return editable.length === 0
          ? pick(lang, {
              en: 'None of your orders is in the PLACED stage anymore, so items cannot be added. Placing a new order takes a second on the shopping page.',
              hi: 'आपका कोई ऑर्डर अब "Placed" चरण में नहीं है, इसलिए आइटम नहीं जोड़े जा सकते। शॉपिंग पेज से नया ऑर्डर करें।',
              hinglish: 'Aapka koi order ab "Placed" stage mein nahi hai, isliye item add nahi ho sakta. Shopping page se naya order kar lijiye.',
            })
          : listOrdersText(lang, editable);
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
