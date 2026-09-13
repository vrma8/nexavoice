// @ts-nocheck
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import {
  chargeWallet,
  chargeWalletOn,
  getWallet,
  refundWallet,
  refundWalletOn,
  type WalletTx,
} from './wallet';
import { CATALOG } from './catalog-data';

type PrismaTx = Prisma.TransactionClient;

export type OrderStatus = 'PLACED' | 'ON_THE_WAY' | 'DELIVERED' | 'CANCELLED';

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function fail<T = never>(code: string, message: string): ServiceResult<T> {
  return { ok: false, error: { code, message } };
}

function seconds(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : fallback * 1000;
}

export function placedWindowMs(): number {
  return seconds('ORDER_PLACED_SECONDS', 120);
}

export function placedEditWindowMs(): number {
  return seconds('ORDER_EDIT_SECONDS', 60);
}

export function maxEditPauseMs(): number {
  return seconds('ORDER_EDIT_PAUSE_MAX_SECONDS', 600);
}

export function transitWindowMs(): number {
  return seconds('ORDER_TRANSIT_SECONDS', 180);
}

/**
 * The timestamp at which the current status should advance to the next one.
 *
 * `statusUpdatedAt` is the anchor: it equals `placedAt` on creation and is moved
 * forward whenever the order is edited (PLACED) or changes status, so we can
 * detect "the customer started changing the order" purely from the row. An edit
 * while PLACED restarts the countdown to `placedEditWindowMs()` (default 1 min).
 * While `pausedSince` is set (customer is editing right now) there is no next
 * change at all — the timer is stopped, not just restarted.
 */
function nextStatusChangeAt(row: {
  status: string;
  placedAt: Date;
  statusUpdatedAt: Date;
  pausedSince: Date | null;
}): number {
  const status = row.status as OrderStatus;
  const placedAt = row.placedAt.getTime();
  const statusUpdatedAt = row.statusUpdatedAt.getTime();
  if (status === 'PLACED') {
    if (row.pausedSince) return 0; 
    const edited = statusUpdatedAt > placedAt;
    return statusUpdatedAt + (edited ? placedEditWindowMs() : placedWindowMs());
  }
  if (status === 'ON_THE_WAY') {
    return statusUpdatedAt + transitWindowMs();
  }
  return 0;
}

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
  caution?: string;
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
  editable: boolean;
  paused: boolean;
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

let catalogEnsured = false;

export async function ensureCatalog(): Promise<void> {
  if (catalogEnsured) return;
  const count = await prisma.product.count();
  if (count >= CATALOG.length) {
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
  caution?: string;
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
    caution: row.caution || undefined,
  };
}

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

const SEARCH_ALIASES: Record<string, string> = {
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
  'हेडफोन': 'headphones', 'हेडफ़ोन': 'headphones', 'headphone': 'headphones',
  'ईयरबड्स': 'earbuds', 'एयरबड्स': 'earbuds', 'earbud': 'earbuds',
  'चार्जर': 'charger', 'चारजर': 'charger',
  'पावरबैंक': 'power bank', 'powerbank': 'power bank',
  'घड़ी': 'watch', 'ghadi': 'watch', 'स्मार्टवॉच': 'smart watch', 'वॉच': 'smart watch',
  'माउस': 'mouse', 'कीबोर्ड': 'keyboard', 'कीबোর্ड': 'keyboard',
  'स्पीकर': 'speaker', 'speaker': 'speaker',
  'वेबकैम': 'webcam', 'कैमरा': 'webcam',
  'टीवी': 'tv', 'टेलीविजन': 'tv', 'tv': 'tv',
  'जूते': 'shoes', 'जूता': 'shoes', 'joote': 'shoes', 'joota': 'shoes',
  'जुराबें': 'socks', 'जुराबी': 'socks', 'socks': 'socks',
  'साड़ी': 'saree', 'sadi': 'saree', 'sadii': 'saree',
  'जीन्स': 'jeans', 'जींस': 'jeans', 'jeans': 'jeans',
  'कुर्ता': 'kurta', 'kurta': 'kurta', 'कुर्ती': 'kurti', 'kurti': 'kurti',
  'बटुआ': 'wallet', 'batua': 'wallet', 'वॉलेट': 'wallet',
  'चश्मा': 'sunglasses', 'chashma': 'sunglasses', 'सनग्लास': 'sunglasses',
  'चावल': 'rice', 'chawal': 'rice', 'rice': 'rice',
  'दाल': 'dal', 'dal': 'dal',
  'तेल': 'oil', 'tel': 'oil',
  'चाय': 'tea', 'chai': 'tea', 'tea': 'tea',
  'कॉफी': 'coffee', 'coffee': 'coffee',
  'मेवा': 'dry fruits', 'ड्राई फ्रूट्स': 'dry fruits', 'dryfruit': 'dry fruits',
  'आटा': 'atta flour', 'atta': 'atta flour', 'flour': 'atta flour',
  'फेसवॉश': 'face wash', 'facewash': 'face wash',
  'हेयर ऑइल': 'hair oil',
  'सनस्क्रीन': 'sunscreen', 'sunscreen': 'sunscreen',
  'ट्रिमर': 'trimmer', 'trimmer': 'trimmer',
  'लिपस्टिक': 'lipstick', 'lipstick': 'lipstick',
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
  'पैरासिटामोल': 'paracetamol', 'paracetamol': 'paracetamol', 'dolo': 'paracetamol', 'पेरासिटामोल': 'paracetamol',
  'इबुप्रोफेन': 'ibuprofen', 'ibuprofen': 'ibuprofen', 'brufen': 'ibuprofen',
  'कफ सिरप': 'cough syrup', 'खांसी': 'cough syrup', 'cough': 'cough syrup', 'सिरप': 'cough syrup', 'syrup': 'cough syrup',
  'एसिडिटी': 'antacid', 'एंटासिड': 'antacid', 'antacid': 'antacid', 'digene': 'antacid', 'गैस': 'antacid', 'acidity': 'antacid',
  'मल्टीविटामिन': 'multivitamin', 'multivitamin': 'multivitamin', 'विटामिन': 'multivitamin', 'vitamin': 'multivitamin',
  'सिटीरिज़िन': 'cetirizine', 'cetirizine': 'cetirizine', 'एलर्जी': 'cetirizine', 'allergy': 'cetirizine', 'एंटीहिस्टामिन': 'cetirizine',
  'ओआरएस': 'ors', 'ors': 'ors', 'इलेक्ट्रोलाइट': 'ors', 'निर्जलीकरण': 'ors',
  'एंटीसेप्टिक': 'antiseptic', 'antiseptic': 'antiseptic', 'dettol': 'antiseptic', 'पट्टी': 'antiseptic', 'चोट': 'antiseptic',
  'सैनिटाइज़र': 'hand sanitizer', 'sanitizer': 'hand sanitizer', 'सैनिटाइजर': 'hand sanitizer', 'साफ': 'hand sanitizer',
  'थर्मामीटर': 'thermometer', 'thermometer': 'thermometer', 'बुखार': 'thermometer', 'पारा': 'thermometer',
};

export async function searchProducts(
  query: string,
  limit = 8,
  opts: { maxPriceInr?: number; category?: string } = {},
): Promise<ProductView[]> {
  await ensureCatalog();
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

export async function ensureClientExists(clientId: string, name = 'Rahul Sharma'): Promise<void> {
  if (!clientId || !clientId.trim()) return;
  try {
    const existing = await prisma.client.findUnique({ where: { id: clientId } });
    if (!existing) {
      await prisma.client.create({
        data: {
          id: clientId,
          name,
          email: `${clientId.toLowerCase().replace(/[^a-z0-9]/g, '')}@nexamart.example`,
          phone: '9876543210',
          tier: 'prime',
          city: 'Delhi',
          address: 'B-42, Lajpat Nagar II, New Delhi 110024',
          preferredLanguage: 'hinglish',
          walletBalanceInr: 5000,
          walletTransactions: {
            create: {
              amountInr: 5000,
              label: 'Initial NexaCash balance',
            },
          },
        },
      });
    }
  } catch (error) {
    console.warn('[ensureClientExists] client check ignored:', error);
  }
}

export async function getCart(clientId: string): Promise<CartView> {
  await ensureClientExists(clientId);
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
  await ensureClientExists(clientId);
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
  await ensureClientExists(clientId);
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
  await ensureClientExists(clientId);
  await prisma.cartItem.deleteMany({ where: { clientId } });
}

export const SUPPORTED_LANGUAGES = ['hindi', 'english', 'hinglish'] as const;

export async function setPreferredLanguage(
  clientId: string,
  language: (typeof SUPPORTED_LANGUAGES)[number],
): Promise<void> {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new Error(`Unsupported language "${language}"`);
  }
  await prisma.client.update({ where: { id: clientId }, data: { preferredLanguage: language } });
}

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
  pausedSince: Date | null;
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
  const nextChangeAt = nextStatusChangeAt(row);
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
    paused: status === 'PLACED' && row.pausedSince !== null,
    nextChangeInMs: nextChangeAt ? Math.max(0, nextChangeAt - now) : 0,
    history: historyOf(row),
  };
}

const ORDER_INCLUDE = { items: { orderBy: { title: 'asc' as const } } };

export async function syncOrderStatuses(clientId?: string): Promise<void> {
  const now = Date.now();
  const open = await prisma.order.findMany({
    where: {
      status: { in: ['PLACED', 'ON_THE_WAY'] },
      ...(clientId ? { clientId } : {}),
    },
  });
  for (const row of open) {
    if (row.status === 'PLACED' && row.pausedSince) {
      if (now - row.pausedSince.getTime() > maxEditPauseMs()) {
        await prisma.order.update({
          where: { id: row.id },
          data: {
            pausedSince: null,
            statusUpdatedAt: new Date(now),
            history: [...historyOf(row), { at: now, event: 'Edit pause expired — timer resumed' }],
          },
        });
      }
      continue;
    }
    const history = historyOf(row);
    const placedAt = row.placedAt.getTime();
    const statusUpdatedAt = row.statusUpdatedAt.getTime();
    const shipAt =
      row.status === 'ON_THE_WAY' ? placedAt + placedWindowMs() : nextStatusChangeAt(row);
    const deliverAt =
      row.status === 'ON_THE_WAY'
        ? statusUpdatedAt + transitWindowMs()
        : shipAt + transitWindowMs();

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

export type CanonicalPaymentMethod = 'WALLET' | 'UPI' | 'CARD' | 'COD';

export function normalizePaymentMethod(input?: string | null): CanonicalPaymentMethod {
  const raw = String(input ?? '').trim().toUpperCase().replace(/[\s_-]+/g, '');
  if (!raw) return 'COD';
  if (/NEXACASH|NEXA|WALLET|BALANCE/.test(raw)) return 'WALLET';
  if (/UPI|GPAY|GOOGLEPAY|PHONEPE|PAYTM|BHIM/.test(raw)) return 'UPI';
  if (/CARD|CREDIT|DEBIT|VISA|MASTERCARD|AMEX/.test(raw)) return 'CARD';
  if (/COD|CASH|DELIVERY/.test(raw)) return 'COD';
  return 'COD';
}

export interface PlaceOrderInput {
  shippingAddress: string;
  paymentMethod?: string;
}

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
  const paymentMethod = normalizePaymentMethod(input.paymentMethod);

  if (paymentMethod === 'WALLET') {
    const wallet = await getWallet(clientId, 1);
    if (wallet.balanceInr < cart.totalInr) {
      return fail(
        'INSUFFICIENT_BALANCE',
        `The wallet holds ₹${wallet.balanceInr.toLocaleString('en-IN')} but the order costs ` +
          `₹${cart.totalInr.toLocaleString('en-IN')}. Add money to the wallet or pick another payment method.`,
      );
    }
  }

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
      history: [
        {
          at: now,
          event: paymentMethod === 'WALLET' ? 'Order placed — paid with NexaCash wallet' : 'Order placed',
        },
      ],
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

  if (paymentMethod === 'WALLET') {
    try {
      await chargeWallet(clientId, cart.totalInr, `Payment — order ${code}`, code);
    } catch (error) {
      await prisma.order.delete({ where: { id: order.id } });
      return fail('INSUFFICIENT_BALANCE', error instanceof Error ? error.message : 'Wallet payment failed.');
    }
  }

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

async function recalcOrder(orderId: string, event: string, tx: PrismaTx = prisma): Promise<OrderView> {
  const row = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  const oldTotal = row.totalInr;
  const now = Date.now();
  const total = row.items.reduce((sum, item) => sum + item.priceInr * item.qty, 0);
  const history = [...historyOf(row), { at: now, event }];
  const restarted = row.status === 'PLACED';
  const statusUpdatedAt = restarted ? new Date(now) : row.statusUpdatedAt;
  const expectedDelivery = restarted ? new Date(now + placedEditWindowMs() + transitWindowMs()) : row.expectedDelivery;
  const updated = await tx.order.update({
    where: { id: orderId },
    data: { totalInr: total, history, statusUpdatedAt, expectedDelivery },
    include: ORDER_INCLUDE,
  });
  if (row.paymentMethod === 'WALLET' && total !== oldTotal) {
    if (total > oldTotal) {
      await chargeWalletOn(tx as unknown as WalletTx, row.clientId, total - oldTotal, `Order ${row.code} edited — extra charge`, row.code);
    } else {
      await refundWalletOn(tx as unknown as WalletTx, row.clientId, oldTotal - total, `Order ${row.code} edited — refund`, row.code);
    }
  }
  return toOrderView(updated as OrderRow);
}

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
  try {
    const order = await prisma.$transaction(async (tx) => {
      await tx.orderItem.upsert({
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
      return recalcOrder(found.data.id, `Added ${amount} x ${product.title}`, tx);
    });
    return { ok: true, data: order };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Not enough NexaCash')) {
      return fail('INSUFFICIENT_BALANCE', error.message);
    }
    throw error;
  }
}

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
  const order = await prisma.$transaction(async (tx) => {
    if (remove >= line.qty) {
      await tx.orderItem.deleteMany({ where: { orderId: found.data.id, productId: line.productId } });
    } else {
      await tx.orderItem.update({
        where: { orderId_productId: { orderId: found.data.id, productId: line.productId } },
        data: { qty: line.qty - remove },
      });
    }
    return recalcOrder(found.data.id, `Removed ${remove} x ${line.title}`, tx);
  });
  return { ok: true, data: order };
}

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
  const order = await prisma.$transaction(async (tx) => {
    await tx.orderItem.update({
      where: { orderId_productId: { orderId: found.data.id, productId } },
      data: { qty: Math.min(10, Math.floor(qty)) },
    });
    return recalcOrder(found.data.id, `Quantity of ${line.title} set to ${Math.min(10, Math.floor(qty))}`, tx);
  });
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
  const wasPaidFromWallet = found.data.paymentMethod === 'WALLET';
  const updated = await prisma.order.update({
    where: { id: found.data.id },
    data: {
      status: 'CANCELLED',
      statusUpdatedAt: new Date(now),
      pausedSince: null, // a cancelled order has nothing left to edit
      cancelledAt: new Date(now),
      cancellationReason: reason || 'customer request',
      history: [
        ...found.data.history,
        { at: now, event: `Cancelled (${reason || 'customer request'})` },
        ...(wasPaidFromWallet
          ? [{ at: now, event: `Refunded ${formatInr(found.data.totalInr)} to the NexaCash wallet` }]
          : []),
      ],
    },
    include: ORDER_INCLUDE,
  });
  if (wasPaidFromWallet) {
    await refundWallet(
      clientId,
      found.data.totalInr,
      `Refund — order ${found.data.code} cancelled`,
      found.data.code,
    );
  }
  return { ok: true, data: toOrderView(updated as OrderRow) };
}

export async function pauseOrderEdit(clientId: string, codeInput: string): Promise<ServiceResult<OrderView>> {
  const found = await loadEditableOrder(clientId, codeInput);
  if (!found.ok) return found;
  if (found.data.paused) return found; 
  const now = Date.now();
  const updated = await prisma.order.update({
    where: { id: found.data.id },
    data: {
      pausedSince: new Date(now),
      history: [...found.data.history, { at: now, event: 'Editing started — status timer paused' }],
    },
    include: ORDER_INCLUDE,
  });
  return { ok: true, data: toOrderView(updated as OrderRow) };
}

export async function resumeOrderEdit(clientId: string, codeInput: string): Promise<ServiceResult<OrderView>> {
  const found = await getOrderForClient(clientId, codeInput);
  if (!found.ok) return found;
  if (found.data.status !== 'PLACED' || !found.data.paused) return found; 
  const now = Date.now();
  const updated = await prisma.order.update({
    where: { id: found.data.id },
    data: {
      pausedSince: null,
      statusUpdatedAt: new Date(now),
      expectedDelivery: new Date(now + placedEditWindowMs() + transitWindowMs()),
      history: [...found.data.history, { at: now, event: 'Editing finished — status timer resumed' }],
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
      statusUpdatedAt: new Date(now),
      expectedDelivery: new Date(now + placedEditWindowMs() + transitWindowMs()),
      history: [...found.data.history, { at: now, event: 'Delivery address updated' }],
    },
    include: ORDER_INCLUDE,
  });
  return { ok: true, data: toOrderView(updated as OrderRow) };
}

export function summarizeOrderForAgent(order: OrderView) {
  return {
    order_id: order.code,
    status: order.status,
    status_text: order.statusText,
    items: order.items.map((i) => `${i.qty} x ${i.title} (${i.sku}, ${formatInr(i.priceInr)})`),
    total_inr: order.totalInr,
    payment_method: order.paymentMethod === 'WALLET' ? 'WALLET (NexaCash)' : order.paymentMethod,
    placed_at: new Date(order.placedAt).toISOString(),
    expected_delivery: new Date(order.expectedDelivery).toISOString(),
    shipping_address: order.shippingAddress,
    can_edit_items: order.editable,
    can_cancel: order.status === 'PLACED',
    status_timer_paused: order.paused,
    seconds_until_next_status_change: order.paused ? null : Math.round(order.nextChangeInMs / 1000),
  };
}
