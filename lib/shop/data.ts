/**
 * Demo shopping backend — in-memory data for "NexaMart", the fictional
 * shopping service company NexaVoice supports.
 *
 * This module is the *only* place that owns the raw records. Everything else
 * (tools, API routes, dashboard) goes through `lib/shop/service.ts`, so the
 * LLM never touches storage directly (v1.md §32).
 *
 * The store lives on `globalThis` so it survives Next.js dev hot reloads and
 * is shared across API routes inside one server process.
 */

export type OrderStatus =
  | 'PLACED'
  | 'PACKED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'REFUNDED';

export interface Customer {
  id: string;
  name: string;
  phone: string; // 10-digit Indian mobile, no country code
  email: string;
  tier: 'standard' | 'prime';
  city: string;
  preferredLanguage: 'hindi' | 'english' | 'hinglish';
  createdAt: number;
}

export interface OrderItem {
  sku: string;
  title: string;
  qty: number;
  priceInr: number;
}

export interface Order {
  id: string; // e.g. NM-10023
  customerId: string;
  items: OrderItem[];
  totalInr: number;
  status: OrderStatus;
  placedAt: number;
  expectedDelivery: string; // ISO date (yyyy-mm-dd)
  deliveredAt?: number;
  shippingAddress: string;
  courier?: string;
  trackingId?: string;
  paymentMethod: 'UPI' | 'CARD' | 'COD';
  cancellationReason?: string;
  returnReason?: string;
  refundStatus?: 'PENDING' | 'INITIATED' | 'COMPLETED';
  history: Array<{ at: number; event: string }>;
}

export interface Ticket {
  id: string; // e.g. TKT-5001
  customerId?: string;
  conversationId?: string;
  orderId?: string;
  category: string;
  summary: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  createdAt: number;
  updatedAt: number;
}

export interface ShopDb {
  customers: Map<string, Customer>;
  orders: Map<string, Order>;
  tickets: Map<string, Ticket>;
  counters: { order: number; ticket: number };
}

const DAY = 24 * 60 * 60 * 1000;

function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function seed(): ShopDb {
  const now = Date.now();
  const customers: Customer[] = [
    {
      id: 'cust_rahul',
      name: 'Rahul Sharma',
      phone: '9876543210',
      email: 'rahul.sharma@example.com',
      tier: 'prime',
      city: 'Delhi',
      preferredLanguage: 'hinglish',
      createdAt: now - 400 * DAY,
    },
    {
      id: 'cust_priya',
      name: 'Priya Nair',
      phone: '9123456780',
      email: 'priya.nair@example.com',
      tier: 'standard',
      city: 'Bengaluru',
      preferredLanguage: 'english',
      createdAt: now - 120 * DAY,
    },
    {
      id: 'cust_amit',
      name: 'Amit Verma',
      phone: '9988776655',
      email: 'amit.verma@example.com',
      tier: 'standard',
      city: 'Lucknow',
      preferredLanguage: 'hindi',
      createdAt: now - 30 * DAY,
    },
  ];

  const orders: Order[] = [
    {
      id: 'NM-10021',
      customerId: 'cust_rahul',
      items: [
        { sku: 'SKU-SHOE-42', title: 'Nexa Runner Shoes (Size 9)', qty: 1, priceInr: 2499 },
        { sku: 'SKU-SOCK-3', title: 'Cotton Socks 3-pack', qty: 1, priceInr: 399 },
      ],
      totalInr: 2898,
      status: 'SHIPPED',
      placedAt: now - 3 * DAY,
      expectedDelivery: isoDate(now + 2 * DAY),
      shippingAddress: 'B-42, Lajpat Nagar II, New Delhi 110024',
      courier: 'BlueDart',
      trackingId: 'BD7781239',
      paymentMethod: 'UPI',
      history: [
        { at: now - 3 * DAY, event: 'Order placed' },
        { at: now - 2 * DAY, event: 'Packed at Gurugram warehouse' },
        { at: now - 1 * DAY, event: 'Shipped via BlueDart' },
      ],
    },
    {
      id: 'NM-10023',
      customerId: 'cust_rahul',
      items: [{ sku: 'SKU-HP-BT', title: 'NexaSound Bluetooth Headphones', qty: 1, priceInr: 3999 }],
      totalInr: 3999,
      status: 'PLACED',
      placedAt: now - 3 * 60 * 60 * 1000,
      expectedDelivery: isoDate(now + 4 * DAY),
      shippingAddress: 'B-42, Lajpat Nagar II, New Delhi 110024',
      paymentMethod: 'CARD',
      history: [{ at: now - 3 * 60 * 60 * 1000, event: 'Order placed' }],
    },
    {
      id: 'NM-10017',
      customerId: 'cust_rahul',
      items: [{ sku: 'SKU-KET-1', title: 'Steel Electric Kettle 1.5L', qty: 1, priceInr: 1299 }],
      totalInr: 1299,
      status: 'DELIVERED',
      placedAt: now - 9 * DAY,
      expectedDelivery: isoDate(now - 5 * DAY),
      deliveredAt: now - 5 * DAY,
      shippingAddress: 'B-42, Lajpat Nagar II, New Delhi 110024',
      courier: 'Delhivery',
      trackingId: 'DL5520981',
      paymentMethod: 'COD',
      history: [
        { at: now - 9 * DAY, event: 'Order placed' },
        { at: now - 7 * DAY, event: 'Shipped via Delhivery' },
        { at: now - 5 * DAY, event: 'Delivered' },
      ],
    },
    {
      id: 'NM-10030',
      customerId: 'cust_priya',
      items: [{ sku: 'SKU-SAREE-B', title: 'Banarasi Silk Saree (Blue)', qty: 1, priceInr: 5499 }],
      totalInr: 5499,
      status: 'OUT_FOR_DELIVERY',
      placedAt: now - 4 * DAY,
      expectedDelivery: isoDate(now),
      shippingAddress: '12, 4th Cross, Indiranagar, Bengaluru 560038',
      courier: 'Ekart',
      trackingId: 'EK3391002',
      paymentMethod: 'UPI',
      history: [
        { at: now - 4 * DAY, event: 'Order placed' },
        { at: now - 2 * DAY, event: 'Shipped via Ekart' },
        { at: now - 2 * 60 * 60 * 1000, event: 'Out for delivery' },
      ],
    },
    {
      id: 'NM-10012',
      customerId: 'cust_priya',
      items: [{ sku: 'SKU-MIX-750', title: 'Nexa Mixer Grinder 750W', qty: 1, priceInr: 3299 }],
      totalInr: 3299,
      status: 'DELIVERED',
      placedAt: now - 20 * DAY,
      expectedDelivery: isoDate(now - 16 * DAY),
      deliveredAt: now - 16 * DAY,
      shippingAddress: '12, 4th Cross, Indiranagar, Bengaluru 560038',
      courier: 'Delhivery',
      trackingId: 'DL4410077',
      paymentMethod: 'CARD',
      history: [
        { at: now - 20 * DAY, event: 'Order placed' },
        { at: now - 16 * DAY, event: 'Delivered' },
      ],
    },
    {
      id: 'NM-10035',
      customerId: 'cust_amit',
      items: [
        { sku: 'SKU-PHN-CASE', title: 'Phone Case (Black)', qty: 2, priceInr: 299 },
        { sku: 'SKU-CHG-20W', title: '20W Fast Charger', qty: 1, priceInr: 899 },
      ],
      totalInr: 1497,
      status: 'PACKED',
      placedAt: now - 1 * DAY,
      expectedDelivery: isoDate(now + 3 * DAY),
      shippingAddress: '221, Gomti Nagar, Lucknow 226010',
      paymentMethod: 'COD',
      history: [
        { at: now - 1 * DAY, event: 'Order placed' },
        { at: now - 6 * 60 * 60 * 1000, event: 'Packed at Kanpur warehouse' },
      ],
    },
  ];

  const db: ShopDb = {
    customers: new Map(customers.map((c) => [c.id, c])),
    orders: new Map(orders.map((o) => [o.id, o])),
    tickets: new Map(),
    counters: { order: 10036, ticket: 5000 },
  };
  return db;
}

declare global {
  var __nexavoiceShopDb: ShopDb | undefined;
}

export function getShopDb(): ShopDb {
  if (!globalThis.__nexavoiceShopDb) {
    globalThis.__nexavoiceShopDb = seed();
  }
  return globalThis.__nexavoiceShopDb;
}

/** Test helper — resets the demo data. */
export function resetShopDb(): void {
  globalThis.__nexavoiceShopDb = seed();
  touchedThisProcess.clear();
}

// ---------------------------------------------------------------------------
// Durable mirror support
// ---------------------------------------------------------------------------

/**
 * Records this process actually changed (`cancel_order`, `update_shipping_address`,
 * `request_return`, `create_ticket`). Every other record in this process's copy of the
 * shop came out of `seed()` a moment ago, built from relative timestamps — so on a tie it
 * has to lose to the shared document, or a cold instance would overwrite a real
 * cancellation with pristine fixture data.
 */
const touchedThisProcess = new Set<string>();

export function markShopTouched(id: string): void {
  touchedThisProcess.add(id);
}

export interface ShopSnapshot {
  customers: Customer[];
  orders: Order[];
  tickets: Ticket[];
  counters: { order: number; ticket: number };
}

export function snapshotShopDb(): ShopSnapshot {
  const db = getShopDb();
  return {
    customers: [...db.customers.values()],
    orders: [...db.orders.values()],
    tickets: [...db.tickets.values()],
    counters: { ...db.counters },
  };
}

/**
 * Folds the shared shop document into this process's copy. Unmutated records take the
 * remote version — that is the point, it carries other instances' cancellations — while a
 * record this process changed keeps its own, so a merge can never undo a write made
 * earlier in the same request. Anything the remote has and this seed does not (a ticket
 * created elsewhere) is added.
 */
export function mergeShopSnapshot(remote: ShopSnapshot | null | undefined): void {
  if (!remote) return;
  const db = getShopDb();
  const takeRemote = (id: string) => !touchedThisProcess.has(id);

  for (const customer of remote.customers ?? []) {
    if (customer && takeRemote(customer.id)) db.customers.set(customer.id, customer);
  }
  for (const order of remote.orders ?? []) {
    if (order && takeRemote(order.id)) db.orders.set(order.id, order);
  }
  for (const ticket of remote.tickets ?? []) {
    if (ticket && takeRemote(ticket.id)) db.tickets.set(ticket.id, ticket);
  }
  db.counters.order = Math.max(db.counters.order, remote.counters?.order ?? 0);
  db.counters.ticket = Math.max(db.counters.ticket, remote.counters?.ticket ?? 0);
}
