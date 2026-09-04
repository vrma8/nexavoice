/**
 * Demo shop service layer ("NexaMart").
 *
 * Every read/write the AI agent, the chat path or the human dashboard performs
 * goes through these functions. They encode the business rules that make the
 * agent's write access *controlled*:
 *
 *  - order access is always scoped to a verified customer
 *  - only specific state transitions are allowed (e.g. cancel before shipping)
 *  - results are plain data, never raw storage handles
 */
import {
  getShopDb,
  markShopTouched,
  type Customer,
  type Order,
  type OrderStatus,
  type Ticket
} from './data';

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function fail<T = never>(code: string, message: string): ServiceResult<T> {
  return { ok: false, error: { code, message } };
}

/** Normalises Indian phone numbers to 10 digits (drops +91 / 0 prefix, spaces, dashes). */
export function normalizePhone(input: string): string | null {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

export function maskPhone(phone: string): string {
  return phone.length >= 4 ? `******${phone.slice(-4)}` : '****';
}

export function normalizeOrderId(input: string): string {
  const raw = String(input ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d+$/.test(raw)) return `NM-${raw}`;
  return raw.replace(/^NM-?/, 'NM-');
}

export const CANCELLABLE_STATUSES: OrderStatus[] = ['PLACED', 'PACKED'];
export const ADDRESS_EDITABLE_STATUSES: OrderStatus[] = ['PLACED', 'PACKED'];
export const RETURN_WINDOW_DAYS = 7;

export function findCustomerByPhone(phoneInput: string): Customer | null {
  const phone = normalizePhone(phoneInput);
  if (!phone) return null;
  for (const customer of getShopDb().customers.values()) {
    if (customer.phone === phone) return customer;
  }
  return null;
}

export function getCustomer(customerId: string): Customer | null {
  return getShopDb().customers.get(customerId) ?? null;
}

export function listCustomers(): Customer[] {
  return [...getShopDb().customers.values()];
}

export function listOrdersForCustomer(customerId: string, limit = 5): Order[] {
  return [...getShopDb().orders.values()]
    .filter((o) => o.customerId === customerId)
    .sort((a, b) => b.placedAt - a.placedAt)
    .slice(0, limit);
}

export function getOrder(orderIdInput: string): Order | null {
  return getShopDb().orders.get(normalizeOrderId(orderIdInput)) ?? null;
}

/** Order scoped to a customer — the AI can never read another customer's order. */
export function getOrderForCustomer(customerId: string, orderIdInput: string): ServiceResult<Order> {
  const order = getOrder(orderIdInput);
  if (!order || order.customerId !== customerId) {
    return fail(
      'ORDER_NOT_FOUND',
      `No order ${normalizeOrderId(orderIdInput)} found for this customer. Ask the customer to re-check the order number.`,
    );
  }
  return { ok: true, data: order };
}

function statusLabel(status: OrderStatus): string {
  switch (status) {
    case 'PLACED':
      return 'Order placed, not yet packed';
    case 'PACKED':
      return 'Packed at warehouse, awaiting pickup';
    case 'SHIPPED':
      return 'Shipped, in transit';
    case 'OUT_FOR_DELIVERY':
      return 'Out for delivery today';
    case 'DELIVERED':
      return 'Delivered';
    case 'CANCELLED':
      return 'Cancelled';
    case 'RETURN_REQUESTED':
      return 'Return requested, pickup pending';
    case 'REFUNDED':
      return 'Refunded';
  }
}

/** Compact, LLM-friendly view of an order (no internal ids beyond the order number). */
export function summarizeOrder(order: Order) {
  return {
    order_id: order.id,
    status: order.status,
    status_text: statusLabel(order.status),
    items: order.items.map((i) => `${i.qty} x ${i.title}`),
    total_inr: order.totalInr,
    payment_method: order.paymentMethod,
    placed_on: new Date(order.placedAt).toISOString().slice(0, 10),
    expected_delivery: order.expectedDelivery,
    delivered_on: order.deliveredAt ? new Date(order.deliveredAt).toISOString().slice(0, 10) : undefined,
    courier: order.courier,
    tracking_id: order.trackingId,
    shipping_address: order.shippingAddress,
    can_cancel: CANCELLABLE_STATUSES.includes(order.status),
    can_change_address: ADDRESS_EDITABLE_STATUSES.includes(order.status),
    can_return: canReturn(order),
    refund_status: order.refundStatus,
    last_update: order.history[order.history.length - 1]?.event,
  };
}

export function canReturn(order: Order): boolean {
  if (order.status !== 'DELIVERED' || !order.deliveredAt) return false;
  return Date.now() - order.deliveredAt <= RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export function cancelOrder(
  customerId: string,
  orderIdInput: string,
  reason: string,
): ServiceResult<ReturnType<typeof summarizeOrder>> {
  const found = getOrderForCustomer(customerId, orderIdInput);
  if (!found.ok) return found;
  const order = found.data;
  if (order.status === 'CANCELLED') {
    return fail('ALREADY_CANCELLED', `Order ${order.id} is already cancelled.`);
  }
  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    return fail(
      'NOT_CANCELLABLE',
      `Order ${order.id} is ${statusLabel(order.status).toLowerCase()} and can no longer be cancelled. ` +
        (order.status === 'DELIVERED'
          ? 'Offer a return instead if within 7 days of delivery.'
          : 'The customer can refuse the package at the door; a refund is issued once it returns to the warehouse.'),
    );
  }
  const now = Date.now();
  order.status = 'CANCELLED';
  order.cancellationReason = reason;
  markShopTouched(order.id);
  order.refundStatus = order.paymentMethod === 'COD' ? undefined : 'INITIATED';
  order.history.push({ at: now, event: `Cancelled by customer via support (${reason})` });
  if (order.refundStatus) {
    order.history.push({ at: now, event: 'Refund initiated to original payment method (5-7 business days)' });
  }
  return { ok: true, data: summarizeOrder(order) };
}

export function updateShippingAddress(
  customerId: string,
  orderIdInput: string,
  newAddress: string,
): ServiceResult<ReturnType<typeof summarizeOrder>> {
  const found = getOrderForCustomer(customerId, orderIdInput);
  if (!found.ok) return found;
  const order = found.data;
  if (!ADDRESS_EDITABLE_STATUSES.includes(order.status)) {
    return fail(
      'ADDRESS_LOCKED',
      `Order ${order.id} has already been ${statusLabel(order.status).toLowerCase()}; the address cannot be changed now. Offer to create a ticket for the courier team.`,
    );
  }
  const address = newAddress.trim();
  if (address.length < 10) {
    return fail('INVALID_ADDRESS', 'The new address is too short. Collect house/flat, street, city and PIN code.');
  }
  order.shippingAddress = address;
  markShopTouched(order.id);
  order.history.push({ at: Date.now(), event: `Shipping address updated via support` });
  return { ok: true, data: summarizeOrder(order) };
}

export function requestReturn(
  customerId: string,
  orderIdInput: string,
  reason: string,
): ServiceResult<ReturnType<typeof summarizeOrder>> {
  const found = getOrderForCustomer(customerId, orderIdInput);
  if (!found.ok) return found;
  const order = found.data;
  if (order.status === 'RETURN_REQUESTED') {
    return fail('RETURN_ALREADY_REQUESTED', `A return is already in progress for ${order.id}.`);
  }
  if (!canReturn(order)) {
    return fail(
      'NOT_RETURNABLE',
      order.status === 'DELIVERED'
        ? `Order ${order.id} was delivered more than ${RETURN_WINDOW_DAYS} days ago and is outside the return window. Escalate to a human if the customer disputes this.`
        : `Order ${order.id} is not delivered yet (${statusLabel(order.status).toLowerCase()}); returns are only possible after delivery.`,
    );
  }
  order.status = 'RETURN_REQUESTED';
  order.returnReason = reason;
  markShopTouched(order.id);
  order.refundStatus = 'PENDING';
  order.history.push({ at: Date.now(), event: `Return requested (${reason}); pickup scheduled within 2 days` });
  return { ok: true, data: summarizeOrder(order) };
}

export interface CreateTicketInput {
  customerId?: string;
  conversationId?: string;
  orderId?: string;
  category: string;
  summary: string;
}

export function createTicket(input: CreateTicketInput): Ticket {
  const db = getShopDb();
  db.counters.ticket += 1;
  const now = Date.now();
  const ticket: Ticket = {
    id: `TKT-${db.counters.ticket}`,
    customerId: input.customerId,
    conversationId: input.conversationId,
    orderId: input.orderId ? normalizeOrderId(input.orderId) : undefined,
    category: input.category.trim().toLowerCase().replace(/\s+/g, '_'),
    summary: input.summary.trim(),
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
  };
  db.tickets.set(ticket.id, ticket);
  markShopTouched(ticket.id);
  return ticket;
}

export function listTickets(customerId?: string): Ticket[] {
  const all = [...getShopDb().tickets.values()].sort((a, b) => b.createdAt - a.createdAt);
  return customerId ? all.filter((t) => t.customerId === customerId) : all;
}

export function toCustomerSnapshot(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    tier: customer.tier,
    city: customer.city,
  };
}
