/**
 * End-to-end test of the VOICE tool path — the exact requests the Agora
 * Conversational AI engine makes during a call (REST inline tools).
 *
 *  1. login a client (PostgreSQL Client row)
 *  2. open a VOICE conversation bound to that client
 *  3. call /api/agent-tools/* with the tool token, like the engine does
 *
 * Run: node --env-file-if-exists=.env.local --import tsx scripts/test-voice-tools.ts
 */
import { createHmac } from 'node:crypto';
import { buildSystemPrompt } from '../lib/agent-prompt';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

function toolSecret(): string {
  const cert = process.env.NEXT_AGORA_APP_CERTIFICATE ?? process.env.AGORA_APP_CERTIFICATE ?? '';
  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID ?? process.env.AGORA_APP_ID ?? '';
  return createHmac('sha256', cert).update(`nexavoice-agent-tools:${appId}`).digest('hex').slice(0, 48);
}

const TOKEN = toolSecret();

interface ProductHit {
  sku: string;
  title: string;
  category: string;
  price_inr: number;
  description: string;
}

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass += 1;
    console.log(`  ✔ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✘ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : '');
  }
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function tool(conversationId: string, name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(
    `${BASE}/api/agent-tools/${name}?conversation_id=${conversationId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nexavoice-tool-token': TOKEN },
      body: JSON.stringify({ tool_call_id: `test-${Math.random().toString(36).slice(2)}`, ...args }),
    },
  );
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log(`Voice-tool E2E against ${BASE}\n`);

  // ---------------------------------------------------------------- prompt
  console.log('[0] system prompt variants');
  const full = buildSystemPrompt({ mode: 'voice', toolsAvailable: true });
  const degraded = buildSystemPrompt({ mode: 'voice', toolsAvailable: false });
  check('full prompt describes the tools', full.includes('get_cart_status') && full.includes('place_order'), undefined);
  check('full prompt is intent-first + honest on failure', full.includes('detect the intent') && full.toLowerCase().includes('honesty beats invention'), undefined);
  check('full prompt explains PLACED-stage order edits', full.includes('still PLACED'), undefined);
  check('degraded prompt hides tools and forbids inventing', !degraded.includes('get_cart_status') && degraded.includes('NO access') && degraded.includes('NEVER invent'), undefined);
  check('no Agora template braces in prompts', !/{{/.test(full) && !/{{/.test(degraded), undefined);

  // ---------------------------------------------------------------- health
  const health = await api('/api/health?deep=0');
  check('health reports database ok', health.body.database?.ok === true, health.body.database);
  check('health sees the 60-product catalogue', (health.body.database?.products ?? 0) >= 60, health.body.database);

  // ---------------------------------------------------------------- login
  console.log('[1] login + conversation');
  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'client',
      name: 'Test Caller',
      email: 'test.caller@example.com',
      phone: '9000000001',
      city: 'Delhi',
      address: 'B-42, Lajpat Nagar II, New Delhi 110024',
    }),
  });
  check('login ok', login.status === 200 && login.body.client?.id, login.body);
  const clientId = login.body.client.id as string;

  const conv = await api('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'VOICE', clientId }),
  });
  check('conversation created', conv.status === 201 && conv.body.conversation?.id, conv.body);
  const conversationId = conv.body.conversation.id as string;

  // Start from a clean cart — a re-run logs in as the same client (same phone),
  // and the cart legitimately persists in PostgreSQL between runs.
  await fetch(`${BASE}/api/shop/cart`, {
    method: 'DELETE',
    headers: { 'x-nexavoice-client-id': clientId },
  });

  // ---------------------------------------------------------------- context
  console.log('\n[2] customer context');
  const ctx = await tool(conversationId, 'get_customer_context');
  check('get_customer_context ok', ctx.body.ok === true, ctx.body);
  check('customer is Test Caller', ctx.body.customer?.name === 'Test Caller', ctx.body.customer);

  // ---------------------------------------------------------------- search
  console.log('\n[3] search_products (wrong-product check)');
  const kettle = await tool(conversationId, 'search_products', { query: 'kettle' });
  check('kettle search ok', kettle.body.ok === true, kettle.body);
  check(
    'kettle search returns the kettle',
    Array.isArray(kettle.body.products) && kettle.body.products.some((p: ProductHit) => /kettle/i.test(p.title)),
    kettle.body.products?.map((p: ProductHit) => p.title),
  );
  check(
    'no medical products in kettle search',
    !kettle.body.products?.some((p: ProductHit) => /paracetamol|cetirizine|ibuprofen|thermometer|sanitizer|antacid|ors/i.test(p.title)),
    kettle.body.products?.map((p: ProductHit) => p.title),
  );
  const headphones = await tool(conversationId, 'search_products', { query: 'bluetooth headphones' });
  check(
    'headphones search returns NexaSound Bluetooth Headphones first',
    headphones.body.products?.[0]?.title === 'NexaSound Bluetooth Headphones',
    headphones.body.products?.map((p: ProductHit) => p.title),
  );
  const hinglish = await tool(conversationId, 'search_products', { query: 'केतली' });
  check(
    'hindi "केतली" finds the kettle',
    hinglish.body.products?.some((p: ProductHit) => /kettle/i.test(p.title)),
    hinglish.body.products?.map((p: ProductHit) => p.title),
  );

  // ---------------------------------------------------------------- cart
  console.log('\n[4] cart: check, add, replace');
  const cart0 = await tool(conversationId, 'get_cart_status');
  check('cart starts empty', cart0.body.ok === true && cart0.body.item_count === 0, cart0.body);
  {
    const convNow = await api(`/api/conversations/${conversationId}`);
    check('intent tracked as cart_check', convNow.body.conversation?.context?.intent === 'cart_check', convNow.body.conversation?.context);
  }

  const addKettle = await tool(conversationId, 'add_item_to_cart', { product: 'Steel Electric Kettle 1.5L', quantity: 2 });
  check('add_item_to_cart preview needs confirmation', addKettle.body.error === 'CONFIRMATION_REQUIRED', addKettle.body);

  const addKettleYes = await tool(conversationId, 'add_item_to_cart', { product: 'Steel Electric Kettle 1.5L', quantity: 2, confirmed: true });
  check('add_item_to_cart confirmed ok', addKettleYes.body.ok === true, addKettleYes.body);
  check('cart total is 2 x ₹1,299 = ₹2,598', addKettleYes.body.total_inr === 2598, addKettleYes.body);

  const cart1 = await tool(conversationId, 'get_cart_status');
  check('get_cart_status shows kettle x2', cart1.body.cart?.[0]?.qty === 2, cart1.body);

  // replace kettle with pressure cooker
  const replace = await tool(conversationId, 'replace_cart_item', { old_product: 'Steel Electric Kettle 1.5L', new_product: 'Pressure Cooker 5L' });
  check('replace_cart_item preview needs confirmation', replace.body.error === 'CONFIRMATION_REQUIRED', replace.body);
  const replaceYes = await tool(conversationId, 'replace_cart_item', { old_product: 'Steel Electric Kettle 1.5L', new_product: 'Pressure Cooker 5L', confirmed: true });
  check('replace_cart_item confirmed ok', replaceYes.body.ok === true, replaceYes.body);
  check('cart line is now the cooker', replaceYes.body.cart?.[0]?.product === 'Pressure Cooker 5L', replaceYes.body.cart);

  // wrong product in cart → NOT_IN_CART error with real contents
  const replaceWrong = await tool(conversationId, 'replace_cart_item', { old_product: 'Yoga Mat 6mm', new_product: 'LED Table Lamp' });
  check('replacing a product not in cart → NOT_IN_CART', replaceWrong.body.error === 'NOT_IN_CART', replaceWrong.body);

  // ---------------------------------------------------------------- place order
  console.log('\n[5] place_order');
  const preview = await tool(conversationId, 'place_order', {});
  check('place_order preview needs confirmation', preview.body.error === 'CONFIRMATION_REQUIRED', preview.body);
  const placed = await tool(conversationId, 'place_order', { confirmed: true, payment_method: 'COD' });
  check('place_order confirmed ok', placed.body.ok === true, placed.body);
  check('order code NM-…', typeof placed.body.order?.order_id === 'string' && placed.body.order.order_id.startsWith('NM-'), placed.body.order);
  const orderId = placed.body.order?.order_id as string;
  {
    const convNow = await api(`/api/conversations/${conversationId}`);
    check('intent tracked as new_order after place_order', convNow.body.conversation?.context?.intent === 'new_order', convNow.body.conversation?.context);
  }

  const cartAfter = await tool(conversationId, 'get_cart_status');
  check('cart empty after order', cartAfter.body.item_count === 0, cartAfter.body);

  // ---------------------------------------------------------------- edit PLACED order
  console.log('\n[6] change products while order is PLACED');
  const order0 = await tool(conversationId, 'get_order_status', { order_id: orderId });
  check('get_order_status ok', order0.body.ok === true && order0.body.order?.status === 'PLACED', order0.body);
  check('order has the cooker', order0.body.order?.items?.some((i: string) => i.includes('Pressure Cooker')), order0.body.order?.items);

  const addOrder = await tool(conversationId, 'add_item_to_order', { order_id: orderId, product: 'NexaSound Bluetooth Headphones' });
  check('add_item_to_order preview needs confirmation', addOrder.body.error === 'CONFIRMATION_REQUIRED', addOrder.body);
  const addOrderYes = await tool(conversationId, 'add_item_to_order', { order_id: orderId, product: 'NexaSound Bluetooth Headphones', confirmed: true });
  check('add_item_to_order confirmed ok', addOrderYes.body.ok === true, addOrderYes.body);

  const replaceOrder = await tool(conversationId, 'replace_item_in_order', { order_id: orderId, old_product: 'Pressure Cooker 5L', new_product: 'Air Fryer 4L' });
  check('replace_item_in_order preview needs confirmation', replaceOrder.body.error === 'CONFIRMATION_REQUIRED', replaceOrder.body);
  const replaceOrderYes = await tool(conversationId, 'replace_item_in_order', { order_id: orderId, old_product: 'Pressure Cooker 5L', new_product: 'Air Fryer 4L', confirmed: true });
  check('replace_item_in_order confirmed ok', replaceOrderYes.body.ok === true, replaceOrderYes.body);
  check(
    'order now has air fryer, not cooker',
    replaceOrderYes.body.order?.items?.some((i: string) => i.includes('Air Fryer')) &&
      !replaceOrderYes.body.order?.items?.some((i: string) => i.includes('Pressure Cooker')),
    replaceOrderYes.body.order?.items,
  );

  const removeOrder = await tool(conversationId, 'remove_item_from_order', { order_id: orderId, product: 'Air Fryer 4L', confirmed: true });
  check('remove_item_from_order ok', removeOrder.body.ok === true, removeOrder.body);

  // replacing a product that is NOT in the order must not touch the order
  const wrongReplace = await tool(conversationId, 'replace_item_in_order', { order_id: orderId, old_product: 'Banarasi Silk Saree', new_product: 'LED Table Lamp' });
  check('replacing item not in order → ITEM_NOT_IN_ORDER', wrongReplace.body.error === 'ITEM_NOT_IN_ORDER', wrongReplace.body);

  const list = await tool(conversationId, 'list_recent_orders');
  check('list_recent_orders ok', list.body.ok === true && list.body.orders?.length >= 1, list.body);

  // ---------------------------------------------------------------- escalate
  console.log('\n[7] escalate_to_human + handoff summary');
  // Leave something in the cart so the handoff can show it.
  await tool(conversationId, 'add_item_to_cart', { product: 'Yoga Mat 6mm', quantity: 1, confirmed: true });
  const esc = await tool(conversationId, 'escalate_to_human', {
    reason: 'customer wants a refund for a delivered order',
    intent: 'refund_request',
    summary: 'Customer received a damaged product on a delivered order and wants a refund. AI explained refunds need a human agent.',
    information_collected: ['order NM-10023 delivered', 'product arrived damaged'],
    missing_information: ['photo of damage'],
    language: 'english',
    confidence: 0.8,
  });
  check('escalate_to_human ok', esc.body.ok === true && esc.body.case_id, esc.body);
  const caseId = esc.body.case_id as string;

  const caseRes = await api(`/api/cases/${caseId}`);
  const handoff = caseRes.body.supportCase?.handoff ?? caseRes.body.case?.handoff ?? caseRes.body.handoff;
  check('case readable', caseRes.status === 200, caseRes.body);
  check('handoff has intent', handoff?.intent === 'refund_request', handoff);
  check('handoff has actions taken', Array.isArray(handoff?.actions_taken) && handoff.actions_taken.length > 0, handoff?.actions_taken);
  check('handoff has orders with live state', Array.isArray(handoff?.orders) && handoff.orders.length > 0, handoff?.orders);
  check('handoff has the live cart', Array.isArray(handoff?.cart?.items) && handoff.cart.items.some((i: string) => i.includes('Yoga Mat')), handoff?.cart);
  check('handoff has transcript excerpt', Array.isArray(handoff?.transcript_excerpt), handoff?.transcript_excerpt);

  // after handoff, the AI must not act
  const blocked = await tool(conversationId, 'get_cart_status');
  check('tools blocked after handoff', blocked.body.error === 'HANDED_OFF', blocked.body);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
