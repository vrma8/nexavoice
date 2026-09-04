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
  /** Signed-in client details (from /login) attached to the conversation. */
  customerName?: string;
  customerPhone?: string;
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
// Demo shop (read-only helpers for the dashboard)
// ---------------------------------------------------------------------------

export interface DemoCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  tier: string;
  city: string;
  preferredLanguage: string;
  orders: Array<{
    order_id: string;
    status: string;
    items: string[];
    total_inr: number;
    expected_delivery: string;
  }>;
}

export async function getDemoCustomers(): Promise<DemoCustomer[]> {
  const res = await fetch('/api/shop/customers', { cache: 'no-store' });
  return (await json<{ customers: DemoCustomer[] }>(res)).customers;
}
