/**
 * NexaMart shop service — PostgreSQL (Prisma) backed.
 *
 * Everything the shopping page, the API routes and the AI agent tools do with
 * products, carts and orders goes through this module. It is the only place
 * that talks to the `Product` / `CartItem` / `Order` / `OrderItem` tables, so the
 * business rules below hold for a human clicking in the UI *and* for the AI
 * agent calling a tool:
 *
 *   • a client can only buy the 50 catalogue products (`ensureCatalog`);
 *   • orders are always scoped to the signed-in client id — no cross-client reads;
 *   • an order's items may only change while it is still `PLACED`;
 *   • status moves PLACED → ON_THE_WAY → DELIVERED on a timer (`syncOrderStatuses`),
 *     which is applied lazily on every read, so the UI and the agent always agree.
 */
import { prisma } from '@/lib/db';
import { CATALOG } from './catalog-data';

export type OrderStatus = 'PLACED' | 'ON_THE_WAY' | 'DELIVERED' | 'CANCELLED';

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function fail<T = never>(code: string, message: string): ServiceResult<T> {
  return { ok: false, error: { code, message } };
}

// ---------------------------------------------------------------------------
// Timing of the automatic status changes (short on purpose — this is a demo).
// ---------------------------------------------------------------------------

function seconds(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : fallback * 1000;
}

/** How long an order stays editable / cancellable in PLACED. */
export function placedWindowMs(): number {
  return seconds('ORDER_PLACED_SECONDS', 120);
}

/** How long the order then stays ON_THE_WAY before it is DELIVERED. */
export function transitWindowMs(): number {
  return seconds('ORDER_TRANSIT_SECONDS', 180);
}

// ---------------------------------------------------------------------------
// Views (plain JSON, safe to send to the browser and to the LLM)
// ---------------------------------------------------------------------------

export interface ProductView {
  id: string;
  sku: string;
  title: string;
  category: string;
  description: string;
  priceInr: number;
  emoji: string;
  imageUrl?: string;
  rating: number;
}

export interface CartLineView {
  productId: string;
  sku: string;
  title: string;
  emoji: string;
  qty: number;
  priceInr: number;
  lineTotalInr: number;
}

export interface CartView {
  lines: CartLineView[];
  itemCount: number;
  totalInr: number;
}

export interface OrderItemView {
  productId: string;
  sku: string;
  title: string;
  qty: number;
  priceInr: number;
  lineTotalInr: number;
}

export interface OrderView {
  id: string;
  code: string;
  status: OrderStatus;
  statusText: string;
  items: OrderItemView[];
  totalInr: number;
  placedAt: number;
  statusUpdatedAt: number;
  expectedDelivery: number;
  deliveredAt?: number;
  shippingAddress: string;
  paymentMethod: string;
  cancellationReason?: string;
  /** Items can be added/removed and the order cancelled only while PLACED. */
  editable: boolean;
  /** ms until the next automatic status change (0 when final). */
  nextChangeInMs: number;
  history: Array<{ at: number; event: string }>;
}

export function statusText(status: OrderStatus): string {
  switch (status) {
    case 'PLACED':
      return 'Order placed — being prepared';
    case 'ON_THE_WAY':
      return 'On the way';
    case 'DELIVERED':
      return 'Delivered';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

export function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

let catalogEnsured = false;

/**
 * Writes the 50 fixed products once. Idempotent (upsert by sku) so two cold
 * serverless instances cannot double the catalogue, and safe to call on every
 * request — after the first success it is a no-op for the process.
 */
export async function ensureCatalog(): Promise<void> {
  if (catalogEnsured) return;
  const count = await prisma.product.count();
  if (count >= CATALOG.length) {
    // Rows exist — but they may predate a catalogue change (e.g. the product
    // photos moving from placeholders to the real images in /public/products).
    // Re-sync only when the stored artwork no longer matches the seed source.
    const stale = await prisma.product.count({
      where: {
        OR: [{ imageUrl: null }, { NOT: { imageUrl: { startsWith: '/products/' } } }],
      },
    });
    if (stale === 0) {
      catalogEnsured = true;
      return;
    }
  }
  for (const product of CATALOG) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      create: { ...product },
      update: { ...product },
    });
  }
  catalogEnsured = true;
}

export async function listProducts(): Promise<ProductView[]> {
  await ensureCatalog();
  const rows = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { priceInr: 'asc' }],
  });
  return rows.map(toProductView);
}

function toProductView(row: {
  id: string;
  sku: string;
  title: string;
  category: string;
  description: string;
  priceInr: number;
  emoji: string;
  imageUrl?: string | null;
  rating: number;
}): ProductView {
  return {
    id: row.id,
    sku: row.sku,
    title: row.title,
    category: row.category,
    description: row.description,
    priceInr: row.priceInr,
    emoji: row.emoji,
    imageUrl: row.imageUrl ?? undefined,
    rating: row.rating,
  };
}

/**
 * Finds one catalogue product from whatever the customer said: a SKU, an exact
 * title, or a few words of it ("bluetooth headphones", "kettle").
 */
export async function findProduct(reference: string): Promise<ProductView | null> {
  await ensureCatalog();
  const needle = String(reference ?? '').trim();
  if (!needle) return null;

  const bySku = await prisma.product.findFirst({
    where: { sku: { equals: needle.toUpperCase() } },
  });
  if (bySku) return toProductView(bySku);

  const exact = await prisma.product.findFirst({
    where: { title: { equals: needle, mode: 'insensitive' } },
  });
  if (exact) return toProductView(exact);

  const matches = await searchProducts(needle, 5);
  return matches[0] ?? null;
}

/**
 * Hindi / Hinglish shopping words → the English catalogue terms they mean.
 * Catalogue titles are English, but customers ask in their own language
 * ("केतली", "ketli", "हेडफोन"); every matched word is replaced by its English
 * search terms before scoring, so the agent finds the product either way.
 */
const SEARCH_ALIASES: Record<string, string> = {
  // Home & Kitchen
  'केतली': 'kettle', 'केटली': 'kettle', 'ketli': 'kettle',
  'मिक्सर': 'mixer grinder', 'ग्राइंडर': 'mixer grinder', 'mixi': 'mixer grinder',
  'तवा': 'tawa', 'tava': 'tawa',
  'कुकर': 'pressure cooker', 'प्रेशर कुकर': 'pressure cooker', 'cooker': 'pressure cooker',
  'बोतल': 'water bottle', 'botal': 'water bottle',
  'चादर': 'bedsheet', 'बेडशीट': 'bedsheet', 'chadar': 'bedsheet',
  'लैंप': 'lamp', 'दीपक': 'lamp', 'lamp': 'lamp',
  'वैक्यूम': 'vacuum cleaner', 'vacuum': 'vacuum cleaner',
  'एयर फ्रायर': 'air fryer', 'airfryer': 'air fryer',
  'डिब्बा': 'storage container', 'कंटेनर': 'storage container', 'container': 'storage container',
  'बरतन': 'storage container', 'kadai': 'tawa', 'कढ़ाई': 'tawa',
  // Electronics
  'हेडफोन': 'headphones', 'हेडफ़ोन': 'headphones', 'headphone': 'headphones',
  'ईयरबड्स': 'earbuds', 'एयरबड्स': 'earbuds', 'earbud': 'earbuds',
  'चार्जर': 'charger', 'चारजर': 'charger',
  'पावरबैंक': 'power bank', 'powerbank': 'power bank',
  'घड़ी': 'watch', 'ghadi': 'watch', 'स्मार्टवॉच': 'smart watch', 'वॉच': 'smart watch',
  'माउस': 'mouse', 'कीबोर्ड': 'keyboard', 'कीबোর্ड': 'keyboard',
  'स्पीकर': 'speaker', 'speaker': 'speaker',
  'वेबकैम': 'webcam', 'कैमरा': 'webcam',
  'टीवी': 'tv', 'टेलीविजन': 'tv', 'tv': 'tv',
  // Fashion
  'जूते': 'shoes', 'जूता': 'shoes', 'joote': 'shoes', 'joota': 'shoes',
  'जुराबें': 'socks', 'जुराबी': 'socks', 'socks': 'socks',
  'साड़ी': 'saree', 'sadi': 'saree', 'sadii': 'saree',
  'जीन्स': 'jeans', 'जींस': 'jeans', 'jeans': 'jeans',
  'कुर्ता': 'kurta', 'kurta': 'kurta', 'कुर्ती': 'kurti', 'kurti': 'kurti',
  'बटुआ': 'wallet', 'batua': 'wallet', 'वॉलेट': 'wallet',
  'चश्मा': 'sunglasses', 'chashma': 'sunglasses', 'सनग्लास': 'sunglasses',
  // Grocery
  'चावल': 'rice', 'chawal': 'rice', 'rice': 'rice',
  'दाल': 'dal', 'dal': 'dal',
  'तेल': 'oil', 'tel': 'oil',
  'चाय': 'tea', 'chai': 'tea', 'tea': 'tea',
  'कॉफी': 'coffee', 'coffee': 'coffee',
  'मेवा': 'dry fruits', 'ड्राई फ्रूट्स': 'dry fruits', 'dryfruit': 'dry fruits',
  'आटा': 'atta flour', 'atta': 'atta flour', 'flour': 'atta flour',
  // Beauty
  'फेसवॉश': 'face wash', 'facewash': 'face wash',
  'हेयर ऑइल': 'hair oil',
  'सनस्क्रीन': 'sunscreen', 'sunscreen': 'sunscreen',
  'ट्रिमर': 'trimmer', 'trimmer': 'trimmer',
  'लिपस्टिक': 'lipstick', 'lipstick': 'lipstick',
  // Sports / Books / Toys
  'योगा मैट': 'yoga mat', 'yogamat': 'yoga mat',
  'डंबल': 'dumbbell', 'dumbbell': 'dumbbell',
  'बैट': 'cricket bat', 'क्रिकेट बैट': 'cricket bat',
  'बैडमिंटन': 'badminton racket', 'रैकेट': 'badminton racket',
  'नोटबुक': 'notebook', 'कॉपी': 'notebook', 'copy': 'notebook',
  'पेन': 'pen', 'कलम': 'pen', 'kalam': 'pen',
  'किताब': 'book', 'kitaab': 'book', 'book': 'book',
  'इतिहास': 'history',
  'खिलौना': 'toy blocks', 'toys': 'toy blocks', 'गुड्डी': 'toy',
  'डायपर': 'diapers', 'नैपी': 'diapers', 'diaper': 'diapers',
};

/** Keyword search over the catalogue (used by the UI filter and the AI tool). */
export async function searchProducts(
  query: string,
  limit = 8,
  opts: { maxPriceInr?: number; category?: string } = {},
): Promise<ProductView[]> {
  await ensureCatalog();
  // Split on non-letters (Unicode — Devanagari included; \p{M} keeps matras
  // attached to their word, "केतली" must not shred into consonants), translate
  // Hindi/Hinglish words to their catalogue terms, then drop single-letter noise.
  const words = String(query ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .flatMap((w) => (SEARCH_ALIASES[w] ?? w).split(' '))
    .filter((w) => w.length > 1);

  const rows = await prisma.product.findMany({
    where: {
      active: true,
      ...(opts.maxPriceInr ? { priceInr: { lte: opts.maxPriceInr } } : {}),
      ...(opts.category ? { category: { equals: opts.category, mode: 'insensitive' } } : {}),
      ...(words.length
        ? {
            OR: words.flatMap((word) => [
              { title: { contains: word, mode: 'insensitive' as const } },
              { description: { contains: word, mode: 'insensitive' as const } },
              { category: { contains: word, mode: 'insensitive' as const } },
            ]),
          }
        : {}),
    },
    take: 60,
  });

  // Rank: how many query words the title matches, then price.
  const scored = rows
    .map((row) => {
      const haystack = `${row.title} ${row.category} ${row.description}`.toLowerCase();
      const score = words.reduce(
        (acc, word) => acc + (row.title.toLowerCase().includes(word) ? 2 : haystack.includes(word) ? 1 : 0),
        0,
      );
      return { row, score };
    })
    .sort((a, b) => b.score - a.score || a.row.priceInr - b.row.priceInr)
    .slice(0, limit);

  return scored.map((s) => toProductView(s.row));
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export async function getCart(clientId: string): Promise<CartView> {
  const rows = await prisma.cartItem.findMany({
    where: { clientId },
    include: { product: true },
    orderBy: { addedAt: 'asc' },
  });
  const lines: CartLineView[] = rows.map((row) => ({
    productId: row.productId,
    sku: row.product.sku,
    title: row.product.title,
    emoji: row.product.emoji,
    qty: row.qty,
    priceInr: row.product.priceInr,
    lineTotalInr: row.product.priceInr * row.qty,
  }));
  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    totalInr: lines.reduce((n, l) => n + l.lineTotalInr, 0),
  };
}

export async function addToCart(clientId: string, productId: string, qty = 1): Promise<CartView> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Product not found');
  await prisma.cartItem.upsert({
    where: { clientId_productId: { clientId, productId } },
    create: { clientId, productId, qty: Math.max(1, qty) },
    update: { qty: { increment: Math.max(1, qty) } },
  });
  return getCart(clientId);
}

export async function setCartQty(clientId: string, productId: string, qty: number): Promise<CartView> {
  if (qty <= 0) {
    await prisma.cartItem.deleteMany({ where: { clientId, productId } });
  } else {
    await prisma.cartItem.upsert({
      where: { clientId_productId: { clientId, productId } },
      create: { clientId, productId, qty },
      update: { qty },
    });
  }
  return getCart(clientId);
}

export async function clearCart(clientId: string): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { clientId } });
}

// ---------------------------------------------------------------------------
// Client preferences
// ---------------------------------------------------------------------------

export const SUPPORTED_LANGUAGES = ['hindi', 'english', 'hinglish'] as const;

/**
 * Saves the language the customer confirmed with the agent on `Client.preferredLanguage`,
 * so the NEXT chat or call starts in it (the greeting in lib/agent-prompt.ts reads it).
 */
export async function setPreferredLanguage(
  clientId: string,
  language: (typeof SUPPORTED_LANGUAGES)[number],
): Promise<void> {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new Error(`Unsupported language "${language}"`);
  }
  await prisma.client.update({ where: { id: clientId }, data: { preferredLanguage: language } });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

type OrderRow = {
  id: string;
  code: string;
  clientId: string;
  status: string;
  totalInr: number;
  shippingAddress: string;
  paymentMethod: string;
  placedAt: Date;
  statusUpdatedAt: Date;
  expectedDelivery: Date;
  deliveredAt: Date | null;
  cancellationReason: string | null;
  history: unknown;
  items: Array<{ productId: string; sku: string; title: string; qty: number; priceInr: number }>;
};

function historyOf(row: { history: unknown }): Array<{ at: number; event: string }> {
  return Array.isArray(row.history)
    ? (row.history as Array<{ at: number; event: string }>).filter((h) => h && typeof h.event === 'string')
    : [];
}

export function toOrderView(row: OrderRow): OrderView {
  const status = row.status as OrderStatus;
  const now = Date.now();
  const placedAt = row.placedAt.getTime();
  const nextChangeAt =
    status === 'PLACED'
      ? placedAt + placedWindowMs()
      : status === 'ON_THE_WAY'
        ? placedAt + placedWindowMs() + transitWindowMs()
        : 0;
  return {
    id: row.id,
    code: row.code,
    status,
    statusText: statusText(status),
    items: row.items.map((i) => ({
      productId: i.productId,
      sku: i.sku,
      title: i.title,
      qty: i.qty,
      priceInr: i.priceInr,
      lineTotalInr: i.priceInr * i.qty,
    })),
    totalInr: row.totalInr,
    placedAt,
    statusUpdatedAt: row.statusUpdatedAt.getTime(),
    expectedDelivery: row.expectedDelivery.getTime(),
    deliveredAt: row.deliveredAt?.getTime(),
    shippingAddress: row.shippingAddress,
    paymentMethod: row.paymentMethod,
    cancellationReason: row.cancellationReason ?? undefined,
    editable: status === 'PLACED',
    nextChangeInMs: nextChangeAt ? Math.max(0, nextChangeAt - now) : 0,
    history: historyOf(row),
  };
}

const ORDER_INCLUDE = { items: { orderBy: { title: 'asc' as const } } };

/**
 * Applies the time-based status changes (PLACED → ON_THE_WAY → DELIVERED).
 * Called before every order read, so the state the client sees, the state the
 * dashboard sees and the state the AI tool sees can never drift apart.
 */
export async function syncOrderStatuses(clientId?: string): Promise<void> {
  const now = Date.now();
  const open = await prisma.order.findMany({
    where: {
      status: { in: ['PLACED', 'ON_THE_WAY'] },
      ...(clientId ? { clientId } : {}),
    },
  });
  for (const row of open) {
    const placedAt = row.placedAt.getTime();
    const shipAt = placedAt + placedWindowMs();
    const deliverAt = shipAt + transitWindowMs();
    const history = historyOf(row);

    if (now >= deliverAt) {
      if (row.status === 'PLACED') history.push({ at: shipAt, event: 'Picked up by courier — on the way' });
      history.push({ at: deliverAt, event: 'Delivered' });
      await prisma.order.update({
        where: { id: row.id },
        data: {
          status: 'DELIVERED',
          statusUpdatedAt: new Date(deliverAt),
          deliveredAt: new Date(deliverAt),
          history,
        },
      });
    } else if (now >= shipAt && row.status === 'PLACED') {
      history.push({ at: shipAt, event: 'Picked up by courier — on the way' });
      await prisma.order.update({
        where: { id: row.id },
        data: { status: 'ON_THE_WAY', statusUpdatedAt: new Date(shipAt), history },
      });
    }
  }
}

async function nextOrderCode(): Promise<string> {
  const counter = await prisma.orderCounter.upsert({
    where: { id: 'order' },
    create: { id: 'order', value: 10001 },
    update: { value: { increment: 1 } },
  });
  return `NM-${counter.value}`;
}

export function normalizeOrderCode(input: string): string {
  const raw = String(input ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d+$/.test(raw)) return `NM-${raw}`;
  return raw.replace(/^NM-?/, 'NM-');
}

export interface PlaceOrderInput {
  shippingAddress: string;
  paymentMethod?: string;
}

/** Turns the client's cart into an order and empties the cart. */
export async function placeOrder(
  clientId: string,
  input: PlaceOrderInput,
): Promise<ServiceResult<OrderView>> {
  const cart = await getCart(clientId);
  if (cart.lines.length === 0) {
    return fail('CART_EMPTY', 'The cart is empty — add a product before placing an order.');
  }
  const address = input.shippingAddress?.trim() ?? '';
  if (address.length < 10) {
    return fail('INVALID_ADDRESS', 'A delivery address with house/flat, area, city and PIN code is required.');
  }
  const paymentMethod = ['UPI', 'CARD', 'COD'].includes(String(input.paymentMethod).toUpperCase())
    ? String(input.paymentMethod).toUpperCase()
    : 'COD';

  const now = Date.now();
  const code = await nextOrderCode();
  const order = await prisma.order.create({
    data: {
      code,
      clientId,
      status: 'PLACED',
      totalInr: cart.totalInr,
      shippingAddress: address,
      paymentMethod,
      placedAt: new Date(now),
      statusUpdatedAt: new Date(now),
      expectedDelivery: new Date(now + placedWindowMs() + transitWindowMs()),
      history: [{ at: now, event: 'Order placed' }],
      items: {
        create: cart.lines.map((line) => ({
          productId: line.productId,
          sku: line.sku,
          title: line.title,
          qty: line.qty,
          priceInr: line.priceInr,
        })),
      },
    },
    include: ORDER_INCLUDE,
  });
  await clearCart(clientId);
  return { ok: true, data: toOrderView(order as OrderRow) };
}

export async function listOrders(clientId: string, limit = 20): Promise<OrderView[]> {
  await syncOrderStatuses(clientId);
  const rows = await prisma.order.findMany({
    where: { clientId },
    include: ORDER_INCLUDE,
    orderBy: { placedAt: 'desc' },
    take: limit,
  });
  return rows.map((row) => toOrderView(row as OrderRow));
}

export async function getOrderForClient(
  clientId: string,
  codeInput: string,
): Promise<ServiceResult<OrderView>> {
  await syncOrderStatuses(clientId);
  const code = normalizeOrderCode(codeInput);
  const row = await prisma.order.findFirst({
    where: { code, clientId },
    include: ORDER_INCLUDE,
  });
  if (!row) {
    return fail(
      'ORDER_NOT_FOUND',
      `No order ${code} on this account. Ask the customer to re-check the order number, or list their recent orders.`,
    );
  }
  return { ok: true, data: toOrderView(row as OrderRow) };
}

async function loadEditableOrder(clientId: string, codeInput: string) {
  const found = await getOrderForClient(clientId, codeInput);
  if (!found.ok) return found;
  if (found.data.status !== 'PLACED') {
    return fail<OrderView>(
      'ORDER_LOCKED',
      `Order ${found.data.code} is already "${found.data.statusText.toLowerCase()}", so its items can no longer be changed. ` +
        'Only orders still in the PLACED stage can be edited.',
    );
  }
  return found;
}

async function recalcOrder(orderId: string, event: string): Promise<OrderView> {
  const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  const total = row.items.reduce((sum, item) => sum + item.priceInr * item.qty, 0);
  const history = [...historyOf(row), { at: Date.now(), event }];
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { totalInr: total, history },
    include: ORDER_INCLUDE,
  });
  return toOrderView(updated as OrderRow);
}

/** Adds a catalogue product to an order that is still PLACED. */
export async function addItemToOrder(
  clientId: string,
  codeInput: string,
  productRef: string,
  qty = 1,
): Promise<ServiceResult<OrderView>> {
  const found = await loadEditableOrder(clientId, codeInput);
  if (!found.ok) return found;
  const product = await findProduct(productRef);
  if (!product) {
    return fail('PRODUCT_NOT_FOUND', `"${productRef}" is not in the NexaMart catalogue. Search the catalogue first.`);
  }
  const amount = Math.min(10, Math.max(1, Math.floor(qty) || 1));
  await prisma.orderItem.upsert({
    where: { orderId_productId: { orderId: found.data.id, productId: product.id } },
    create: {
      orderId: found.data.id,
      productId: product.id,
      sku: product.sku,
      title: product.title,
      qty: amount,
      priceInr: product.priceInr,
    },
    update: { qty: { increment: amount } },
  });
  const order = await recalcOrder(found.data.id, `Added ${amount} x ${product.title}`);
  return { ok: true, data: order };
}

/** Removes a product (or part of its quantity) from an order that is still PLACED. */
export async function removeItemFromOrder(
  clientId: string,
  codeInput: string,
  productRef: string,
  qty?: number,
): Promise<ServiceResult<OrderView>> {
  const found = await loadEditableOrder(clientId, codeInput);
  if (!found.ok) return found;

  const needle = String(productRef ?? '').trim().toLowerCase();
  const line =
    found.data.items.find((i) => i.sku.toLowerCase() === needle) ??
    found.data.items.find((i) => i.title.toLowerCase() === needle) ??
    found.data.items.find((i) => needle.length > 2 && i.title.toLowerCase().includes(needle)) ??
    found.data.items.find((i) => needle.split(/\s+/).some((w) => w.length > 3 && i.title.toLowerCase().includes(w)));

  if (!line) {
    return fail(
      'ITEM_NOT_IN_ORDER',
      `Order ${found.data.code} does not contain "${productRef}". It has: ${found.data.items
        .map((i) => `${i.qty} x ${i.title}`)
        .join(', ')}.`,
    );
  }
  if (found.data.items.length === 1 && (!qty || qty >= line.qty)) {
    return fail(
      'LAST_ITEM',
      `${line.title} is the only item in ${found.data.code}. Removing it would empty the order — cancel the order instead.`,
    );
  }

  const remove = qty && qty > 0 ? Math.min(Math.floor(qty), line.qty) : line.qty;
  if (remove >= line.qty) {
    await prisma.orderItem.deleteMany({ where: { orderId: found.data.id, productId: line.productId } });
  } else {
    await prisma.orderItem.update({
      where: { orderId_productId: { orderId: found.data.id, productId: line.productId } },
      data: { qty: line.qty - remove },
    });
  }
  const order = await recalcOrder(found.data.id, `Removed ${remove} x ${line.title}`);
  return { ok: true, data: order };
}

/** Changes a line quantity on an order that is still PLACED (0 removes it). */
export async function setOrderItemQty(
  clientId: string,
  codeInput: string,
  productId: string,
  qty: number,
): Promise<ServiceResult<OrderView>> {
  const found = await loadEditableOrder(clientId, codeInput);
  if (!found.ok) return found;
  const line = found.data.items.find((i) => i.productId === productId);
  if (!line) return fail('ITEM_NOT_IN_ORDER', 'That product is not part of this order.');
  if (qty <= 0) return removeItemFromOrder(clientId, codeInput, line.sku);
  if (found.data.items.length === 0) return fail('LAST_ITEM', 'An order must keep at least one item.');
  await prisma.orderItem.update({
    where: { orderId_productId: { orderId: found.data.id, productId } },
    data: { qty: Math.min(10, Math.floor(qty)) },
  });
  const order = await recalcOrder(found.data.id, `Quantity of ${line.title} set to ${Math.min(10, Math.floor(qty))}`);
  return { ok: true, data: order };
}

export async function cancelOrder(
  clientId: string,
  codeInput: string,
  reason: string,
): Promise<ServiceResult<OrderView>> {
  const found = await getOrderForClient(clientId, codeInput);
  if (!found.ok) return found;
  if (found.data.status === 'CANCELLED') {
    return fail('ALREADY_CANCELLED', `Order ${found.data.code} is already cancelled.`);
  }
  if (found.data.status !== 'PLACED') {
    return fail(
      'NOT_CANCELLABLE',
      `Order ${found.data.code} is already "${found.data.statusText.toLowerCase()}" and can no longer be cancelled.`,
    );
  }
  const now = Date.now();
  const updated = await prisma.order.update({
    where: { id: found.data.id },
    data: {
      status: 'CANCELLED',
      statusUpdatedAt: new Date(now),
      cancelledAt: new Date(now),
      cancellationReason: reason || 'customer request',
      history: [...found.data.history, { at: now, event: `Cancelled (${reason || 'customer request'})` }],
    },
    include: ORDER_INCLUDE,
  });
  return { ok: true, data: toOrderView(updated as OrderRow) };
}

export async function updateOrderAddress(
  clientId: string,
  codeInput: string,
  newAddress: string,
): Promise<ServiceResult<OrderView>> {
  const found = await loadEditableOrder(clientId, codeInput);
  if (!found.ok) return found;
  const address = String(newAddress ?? '').trim();
  if (address.length < 10) {
    return fail('INVALID_ADDRESS', 'The new address is too short. Collect house/flat, street, city and PIN code.');
  }
  const now = Date.now();
  const updated = await prisma.order.update({
    where: { id: found.data.id },
    data: {
      shippingAddress: address,
      history: [...found.data.history, { at: now, event: 'Delivery address updated' }],
    },
    include: ORDER_INCLUDE,
  });
  return { ok: true, data: toOrderView(updated as OrderRow) };
}

// ---------------------------------------------------------------------------
// Compact shapes for the LLM / handoff summary
// ---------------------------------------------------------------------------

export function summarizeOrderForAgent(order: OrderView) {
  return {
    order_id: order.code,
    status: order.status,
    status_text: order.statusText,
    items: order.items.map((i) => `${i.qty} x ${i.title} (${i.sku}, ${formatInr(i.priceInr)})`),
    total_inr: order.totalInr,
    payment_method: order.paymentMethod,
    placed_at: new Date(order.placedAt).toISOString(),
    expected_delivery: new Date(order.expectedDelivery).toISOString(),
    shipping_address: order.shippingAddress,
    can_edit_items: order.editable,
    can_cancel: order.status === 'PLACED',
    seconds_until_next_status_change: Math.round(order.nextChangeInMs / 1000),
  };
}
