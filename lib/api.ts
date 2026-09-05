/**
 * NexaVoice browser API client — thin wrappers over the Next.js API routes.
 * Voice sessions are started by `VoiceAgentCall` (token → invite-agent); this
 * module covers chat, conversation tracking, escalation and the dashboard.
 */
import type {
  Conversation,
  ConversationEvent,
  ConversationMessage,
  MessageRole,
  SupportCase,
} from '@/lib/support/types';

async function json<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Conversations (chat + voice tracking)
// ---------------------------------------------------------------------------

export interface CreateConversationOptions {
  /** Signed-in client record id (PostgreSQL) the conversation is bound to. */
  clientId?: string;
  customerName?: string;
}

export async function createConversation(
  mode: 'CHAT' | 'VOICE',
  options: CreateConversationOptions = {},
): Promise<Conversation> {
  const res = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, ...options }),
  });
  return (await json<{ conversation: Conversation }>(res)).conversation;
}

export interface ConversationSnapshot {
  conversation: Conversation;
  messages: ConversationMessage[];
  case: SupportCase | null;
  now: number;
}

export async function getConversation(id: string, since = 0): Promise<ConversationSnapshot> {
  const res = await fetch(`/api/conversations/${id}?since=${since}`, { cache: 'no-store' });
  return json<ConversationSnapshot>(res);
}

export interface SendMessageResult {
  message: ConversationMessage;
  reply: ConversationMessage | null;
  conversation: Conversation;
  case: SupportCase | null;
  degraded?: boolean;
}

export async function sendMessage(
  conversationId: string,
  content: string,
  role: Extract<MessageRole, 'user' | 'human_agent'> = 'user',
): Promise<SendMessageResult> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, role }),
  });
  return json<SendMessageResult>(res);
}

export interface TranscriptMirrorItem {
  role: Extract<MessageRole, 'user' | 'ai' | 'human_agent'>;
  content: string;
  turnId?: number;
}

/** Voice client mirrors transcript + agent state so the dashboard sees the live call. */
/**
 * "The customer is still here."
 *
 * Called every few seconds by an open chat panel or voice call. The backend
 * closes any conversation that stops sending these, which is what guarantees the
 * agent dashboard only lists conversations that are genuinely running.
 */
export async function sendHeartbeat(conversationId: string): Promise<void> {
  await fetch(`/api/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ heartbeat: true }),
  }).catch(() => {});
}

/**
 * Ends the conversation for good (panel closed, signed out, tab closing).
 * Uses `sendBeacon` when the page is going away, because a normal fetch is
 * cancelled while the tab unloads.
 */
export function endConversation(conversationId: string, beacon = false): void {
  const url = `/api/conversations/${conversationId}/close`;
  if (beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(url, new Blob([JSON.stringify({})], { type: 'application/json' }));
    return;
  }
  void fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
}

export async function mirrorVoiceState(
  conversationId: string,
  patch: { agentState?: string; transcript?: TranscriptMirrorItem[]; close?: boolean },
): Promise<void> {
  await fetch(`/api/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
    keepalive: Boolean(patch.close),
  }).catch(() => {});
}

export async function requestEscalation(
  conversationId: string,
  reason: string,
): Promise<{ success: boolean; caseId: string; case: SupportCase | null; conversation: Conversation }> {
  const res = await fetch('/api/escalation/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, reason }),
  });
  return json(res);
}

// ---------------------------------------------------------------------------
// Human agent dashboard
// ---------------------------------------------------------------------------

export interface DashboardSnapshot {
  now: number;
  liveCalls: Conversation[];
  activeChats: Conversation[];
  waitingCases: SupportCase[];
  handlingCases: SupportCase[];
  recentResolved: SupportCase[];
  recentEvents: ConversationEvent[];
}

export async function getDashboard(): Promise<DashboardSnapshot> {
  const res = await fetch('/api/dashboard', { cache: 'no-store' });
  return json<DashboardSnapshot>(res);
}

export interface CaseDetail {
  case: SupportCase;
  conversation: Conversation | null;
  messages: ConversationMessage[];
  now: number;
}

export async function getCase(id: string): Promise<CaseDetail> {
  const res = await fetch(`/api/cases/${id}`, { cache: 'no-store' });
  return json<CaseDetail>(res);
}

export interface AcceptCaseResult {
  case: SupportCase;
  conversation: Conversation | null;
  voice: { token: string; uid: string; channel: string; agentUid: string; appId?: string } | null;
}

export async function acceptCase(id: string, agentName: string, agentEmail?: string): Promise<AcceptCaseResult> {
  const res = await fetch(`/api/cases/${id}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentName, agentEmail }),
  });
  return json<AcceptCaseResult>(res);
}

export async function takeoverCase(
  id: string,
  humanUid: string,
): Promise<{ ok: boolean; aiStopped: boolean; announcement: string; conversation: Conversation }> {
  const res = await fetch(`/api/cases/${id}/takeover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ humanUid }),
  });
  return json(res);
}

export async function resolveCase(
  id: string,
  note?: string,
  humanLeft = false,
): Promise<{ case: SupportCase; conversation: Conversation | null }> {
  const res = await fetch(`/api/cases/${id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, humanLeft }),
  });
  return json(res);
}

// ---------------------------------------------------------------------------
// Shopping (catalogue, cart, orders) — all scoped to the signed-in client
// ---------------------------------------------------------------------------

import type { CartView, OrderView, ProductView } from '@/lib/shop/service';

export type { CartView, OrderView, ProductView };

const CLIENT_ID_HEADER = 'x-nexavoice-client-id';

function shopHeaders(clientId: string, body = false): HeadersInit {
  return body
    ? { 'Content-Type': 'application/json', [CLIENT_ID_HEADER]: clientId }
    : { [CLIENT_ID_HEADER]: clientId };
}

export async function getProducts(): Promise<ProductView[]> {
  const res = await fetch('/api/shop/products', { cache: 'no-store' });
  return (await json<{ products: ProductView[] }>(res)).products;
}

export async function getCart(clientId: string): Promise<CartView> {
  const res = await fetch('/api/shop/cart', { headers: shopHeaders(clientId), cache: 'no-store' });
  return (await json<{ cart: CartView }>(res)).cart;
}

export async function addToCart(clientId: string, productId: string, qty = 1): Promise<CartView> {
  const res = await fetch('/api/shop/cart', {
    method: 'POST',
    headers: shopHeaders(clientId, true),
    body: JSON.stringify({ productId, qty }),
  });
  return (await json<{ cart: CartView }>(res)).cart;
}

export async function setCartQty(clientId: string, productId: string, qty: number): Promise<CartView> {
  const res = await fetch('/api/shop/cart', {
    method: 'PATCH',
    headers: shopHeaders(clientId, true),
    body: JSON.stringify({ productId, qty }),
  });
  return (await json<{ cart: CartView }>(res)).cart;
}

export async function clearCart(clientId: string): Promise<CartView> {
  const res = await fetch('/api/shop/cart', { method: 'DELETE', headers: shopHeaders(clientId) });
  return (await json<{ cart: CartView }>(res)).cart;
}

export async function getOrders(clientId: string): Promise<OrderView[]> {
  const res = await fetch('/api/shop/orders', { headers: shopHeaders(clientId), cache: 'no-store' });
  return (await json<{ orders: OrderView[] }>(res)).orders;
}

export async function placeOrder(
  clientId: string,
  input: { shippingAddress: string; paymentMethod: string },
): Promise<{ order: OrderView; orders: OrderView[]; cart: CartView }> {
  const res = await fetch('/api/shop/orders', {
    method: 'POST',
    headers: shopHeaders(clientId, true),
    body: JSON.stringify(input),
  });
  return json(res);
}

export type OrderEdit =
  | { action: 'add_item'; product: string; qty?: number }
  | { action: 'remove_item'; product: string; qty?: number }
  | { action: 'set_qty'; productId: string; qty: number }
  | { action: 'cancel'; reason?: string }
  | { action: 'address'; address: string };

/** Customer-driven order changes — the same rules the AI agent's tools obey. */
export async function editOrder(
  clientId: string,
  code: string,
  edit: OrderEdit,
): Promise<{ order: OrderView; orders: OrderView[] }> {
  const res = await fetch(`/api/shop/orders/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: shopHeaders(clientId, true),
    body: JSON.stringify(edit),
  });
  return json(res);
}
