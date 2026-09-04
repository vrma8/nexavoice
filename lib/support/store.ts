/**
 * Conversation / case store shared by chat, voice, tools and the human dashboard.
 * Backend-owned state (v1.md §21). Lives on `globalThis` so it survives dev hot
 * reloads, and is mirrored to a durable backend (`persist.ts`) so every serverless
 * invocation — on every instance — sees the same conversations.
 *
 * Reads and writes here stay synchronous; routes bracket their work with
 * `hydrateStore()` / `flushStore()` (see `withStore` in `route-store.ts`), which
 * pull and push that mirror. Swap for a database by re-implementing this module's
 * exported functions.
 */
import { randomUUID } from 'crypto';
import { mergeShopSnapshot, snapshotShopDb } from '../shop/data';
import {
  message as describeError,
  resolvePersistence,
  type PersistenceBackend,
} from './persist';
import {
  emptySnapshot,
  mergeSnapshots,
  parseSnapshot,
  pruneSnapshot,
  serializeSnapshot,
  type StoreSnapshot,
} from './snapshot';
import type {
  CasePriority,
  Conversation,
  ConversationEvent,
  ConversationMessage,
  ConversationMode,
  ConversationState,
  CustomerSnapshot,
  HandoffSummary,
  MessageRole,
  SupportCase,
  ToolAuditEntry,
} from './types';

interface SupportDb {
  conversations: Map<string, Conversation>;
  messages: Map<string, ConversationMessage[]>;
  cases: Map<string, SupportCase>;
  events: ConversationEvent[];
  counters: { case: number };
  listeners: Set<(event: ConversationEvent) => void>;
  /** Bumped by every local mutation, so we know when the durable mirror is behind. */
  revision: number;
  /** Revision last pushed to (or pulled from) the durable mirror. */
  syncedRevision: number;
  lastSyncAt: number;
  lastError: string | null;
  /** `rev` of the snapshot we last merged — for logs and /api/health only. */
  remoteRev: number;
}

declare global {
  var __nexavoiceSupportDb: SupportDb | undefined;
}

function db(): SupportDb {
  if (!globalThis.__nexavoiceSupportDb) {
    globalThis.__nexavoiceSupportDb = {
      conversations: new Map(),
      messages: new Map(),
      cases: new Map(),
      events: [],
      counters: { case: 1023 },
      listeners: new Set(),
      revision: 0,
      syncedRevision: 0,
      lastSyncAt: 0,
      lastError: null,
      remoteRev: 0,
    };
  }
  return globalThis.__nexavoiceSupportDb;
}

/** Records that memory is now ahead of the durable mirror. */
function markDirty(): void {
  db().revision += 1;
}

export function resetSupportDb(): void {
  globalThis.__nexavoiceSupportDb = undefined;
}

// ---------------------------------------------------------------------------
// Durable mirror (serverless support)
// ---------------------------------------------------------------------------

export interface StoreSyncStatus {
  backend: string;
  target: string;
  revision: number;
  syncedRevision: number;
  remoteRev: number;
  lastSyncAt: number;
  lastError: string | null;
}

/** Reported by /api/health — the quickest way to tell if state is shared. */
export function getStoreSyncStatus(): StoreSyncStatus {
  const store = db();
  const active = activeBackend();
  return {
    backend: active.kind,
    target: active.target,
    revision: store.revision,
    syncedRevision: store.syncedRevision,
    remoteRev: store.remoteRev,
    lastSyncAt: store.lastSyncAt,
    lastError: store.lastError,
  };
}

let backend: PersistenceBackend | null = null;

function activeBackend(): PersistenceBackend {
  if (!backend) backend = resolvePersistence();
  return backend;
}

/** Tests re-point NEXAVOICE_STORE between cases. */
export function resetPersistenceClient(): void {
  backend = null;
}

function toSnapshot(store: SupportDb): StoreSnapshot {
  const snapshot = emptySnapshot();
  snapshot.savedAt = Date.now();
  snapshot.rev = store.revision;
  snapshot.caseCounter = store.counters.case;
  snapshot.events = [...store.events];
  snapshot.conversations = [...store.conversations.values()];
  snapshot.messages = Object.fromEntries(store.messages);
  snapshot.cases = [...store.cases.values()];
  snapshot.shop = snapshotShopDb();
  return pruneSnapshot(snapshot);
}

/**
 * Folds a remote snapshot into this instance's memory. Conversations and cases
 * merge newest-first, so another customer's session never vanishes because this
 * instance happened to hold an older copy of the document.
 */
function applySnapshot(store: SupportDb, remote: StoreSnapshot): void {
  // Shop records are process-local globals rather than `store` fields, so they merge
  // here directly; `toSnapshot` re-reads them on the way out.
  mergeShopSnapshot(remote.shop);
  const merged = mergeSnapshots(toSnapshot(store), remote);
  store.counters.case = Math.max(store.counters.case, merged.caseCounter);
  store.conversations = new Map(
    merged.conversations.map((conversation) => [conversation.id, conversation]),
  );
  store.messages = new Map(Object.entries(merged.messages));
  store.cases = new Map(merged.cases.map((supportCase) => [supportCase.id, supportCase]));
  store.events = merged.events;
}

/**
 * Pulls the durable snapshot into memory before a handler reads or writes state.
 *
 * There is deliberately no "read recently enough, skip it" cache here: on Vercel
 * consecutive requests from one browser land on different instances, so a TTL made
 * the next request answer from a copy that was up to a TTL old — a customer would
 * be asked for their phone number again on the very next turn. Every request reads
 * the shared document instead, and concurrent requests on one instance coalesce
 * into the in-flight read (`queueSync`) so a burst of polls costs one round trip.
 */
export async function hydrateStore(): Promise<void> {
  const store = db();
  const active = activeBackend();
  if (active.kind === 'none') return;
  await queueSync(async () => {
    try {
      const remote = parseSnapshot(await active.read());
      if (remote) {
        applySnapshot(store, remote);
        store.remoteRev = remote.rev;
      }
      store.lastSyncAt = Date.now();
      // Hydrating is not a local change: keep the marker level with reality so a
      // read-only request does not write the document straight back.
      store.syncedRevision = store.revision;
      store.lastError = null;
    } catch (error) {
      store.lastError = describeError(error);
      console.error('[store] durable hydration failed, continuing with local state:', store.lastError);
    }
  });
}

/** Pushes local changes to the durable mirror, re-merging remote state first. */
export async function flushStore(): Promise<void> {
  const store = db();
  const active = activeBackend();
  if (active.kind === 'none') return;
  if (store.syncedRevision === store.revision) return;
  await queueSync(async () => {
    if (store.syncedRevision === store.revision) return;
    try {
      const remote = parseSnapshot(await active.read());
      if (remote) applySnapshot(store, remote);
      await active.write(serializeSnapshot(toSnapshot(store)));
      store.syncedRevision = store.revision;
      store.remoteRev += 1;
      store.lastSyncAt = Date.now();
      store.lastError = null;
    } catch (error) {
      store.lastError = describeError(error);
      console.error('[store] durable flush failed (state kept in memory):', store.lastError);
    }
  });
}

let syncChain: Promise<void> = Promise.resolve();

/**
 * Serialises durable reads/writes per instance. Two concurrent requests sharing a
 * warm instance would otherwise interleave `read → merge → write` and the slower
 * one could publish a document that misses the faster one's write.
 */
function queueSync(task: () => Promise<void>): Promise<void> {
  const run = syncChain.then(task, task);
  syncChain = run.catch(() => {});
  return run;
}

const MAX_EVENTS = 500;

function emit(event: Omit<ConversationEvent, 'id' | 'at'>): ConversationEvent {
  const full: ConversationEvent = { id: randomUUID(), at: Date.now(), ...event };
  const store = db();
  markDirty();
  store.events.push(full);
  if (store.events.length > MAX_EVENTS) store.events.splice(0, store.events.length - MAX_EVENTS);
  for (const listener of store.listeners) {
    try {
      listener(full);
    } catch {
      // listeners must never break the store
    }
  }
  return full;
}

export function subscribe(listener: (event: ConversationEvent) => void): () => void {
  db().listeners.add(listener);
  return () => db().listeners.delete(listener);
}

export function listEvents(since = 0): ConversationEvent[] {
  return db().events.filter((e) => e.at > since);
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export interface CreateConversationInput {
  mode: ConversationMode;
  channel?: string;
  customerUid?: string;
  id?: string;
  /** Signed-in client details (from /login) attached when the conversation starts. */
  customerName?: string;
  customer?: CustomerSnapshot;
}

export function createConversation(input: CreateConversationInput): Conversation {
  const now = Date.now();
  const conversation: Conversation = {
    id: input.id ?? `conv_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    mode: input.mode,
    state: 'AI_HANDLING',
    createdAt: now,
    updatedAt: now,
    channel: input.channel,
    customerUid: input.customerUid,
    context: {
      orderIds: [],
      missingInformation: [],
      confirmedInformation: [],
      customerName: input.customerName,
      customer: input.customer,
    },
    toolAudit: [],
    lastActivityAt: now,
  };
  db().conversations.set(conversation.id, conversation);
  db().messages.set(conversation.id, []);
  emit({ conversationId: conversation.id, type: 'conversation.created', detail: input.mode });
  return conversation;
}

export function getConversation(id: string): Conversation | null {
  return db().conversations.get(id) ?? null;
}

export function findConversationByChannel(channel: string): Conversation | null {
  for (const c of db().conversations.values()) {
    if (c.channel === channel && c.state !== 'CLOSED') return c;
  }
  return null;
}

export function listConversations(filter?: { active?: boolean }): Conversation[] {
  const all = [...db().conversations.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  if (filter?.active) {
    return all.filter((c) => c.state !== 'CLOSED' && c.state !== 'RESOLVED');
  }
  return all;
}

export function updateConversation(
  id: string,
  patch: Partial<Omit<Conversation, 'id' | 'createdAt' | 'context' | 'toolAudit'>> & {
    context?: Partial<Conversation['context']>;
  },
): Conversation | null {
  const conversation = db().conversations.get(id);
  if (!conversation) return null;
  const { context, ...rest } = patch;
  Object.assign(conversation, rest);
  if (context) Object.assign(conversation.context, context);
  conversation.updatedAt = Date.now();
  markDirty();
  return conversation;
}

export function touchConversation(id: string): void {
  const conversation = db().conversations.get(id);
  if (conversation) {
    conversation.lastActivityAt = Date.now();
    conversation.updatedAt = conversation.lastActivityAt;
    markDirty();
  }
}

export function setConversationState(id: string, state: ConversationState): Conversation | null {
  const conversation = db().conversations.get(id);
  if (!conversation) return null;
  conversation.state = state;
  conversation.updatedAt = Date.now();
  if (state === 'CLOSED' || state === 'RESOLVED') conversation.endedAt = conversation.updatedAt;
  markDirty();
  return conversation;
}

export function recordEvent(
  conversationId: string,
  type: ConversationEvent['type'],
  detail?: string,
): ConversationEvent {
  touchConversation(conversationId);
  return emit({ conversationId, type, detail });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function appendMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  opts?: { turnId?: number },
): ConversationMessage | null {
  const store = db();
  if (!store.conversations.has(conversationId)) return null;
  const list = store.messages.get(conversationId) ?? [];
  // Voice transcripts arrive as repeated updates for the same turn — upsert.
  if (opts?.turnId !== undefined) {
    const existing = list.find((m) => m.role === role && m.turnId === opts.turnId);
    if (existing) {
      existing.content = content;
      touchConversation(conversationId);
      return existing;
    }
  }
  const message: ConversationMessage = {
    id: randomUUID(),
    conversationId,
    role,
    content,
    createdAt: Date.now(),
    turnId: opts?.turnId,
  };
  list.push(message);
  store.messages.set(conversationId, list);
  touchConversation(conversationId);
  return message;
}

export function listMessages(conversationId: string, since = 0): ConversationMessage[] {
  return (db().messages.get(conversationId) ?? []).filter((m) => m.createdAt > since);
}

export function appendToolAudit(
  conversationId: string,
  entry: Omit<ToolAuditEntry, 'id' | 'at'>,
): ToolAuditEntry | null {
  const conversation = db().conversations.get(conversationId);
  if (!conversation) return null;
  const full: ToolAuditEntry = { id: randomUUID(), at: Date.now(), ...entry };
  conversation.toolAudit.push(full);
  if (conversation.toolAudit.length > 50) conversation.toolAudit.shift();
  emit({ conversationId, type: 'tool.called', detail: `${entry.tool}: ${entry.summary}` });
  return full;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export interface CreateCaseInput {
  conversationId: string;
  handoff: HandoffSummary;
  priority?: CasePriority;
}

export function createCase(input: CreateCaseInput): SupportCase | null {
  const store = db();
  const conversation = store.conversations.get(input.conversationId);
  if (!conversation) return null;
  // Idempotent: one open case per conversation.
  if (conversation.caseId) {
    const existing = store.cases.get(conversation.caseId);
    if (existing && (existing.status === 'WAITING_FOR_HUMAN' || existing.status === 'HUMAN_HANDLING')) {
      return existing;
    }
  }
  store.counters.case += 1;
  const now = Date.now();
  const supportCase: SupportCase = {
    id: `NV-${store.counters.case}`,
    conversationId: conversation.id,
    mode: conversation.mode,
    status: 'WAITING_FOR_HUMAN',
    priority: input.priority ?? derivePriority(input.handoff),
    createdAt: now,
    updatedAt: now,
    handoff: input.handoff,
    customer: conversation.context.customer,
  };
  store.cases.set(supportCase.id, supportCase);
  conversation.caseId = supportCase.id;
  conversation.state = 'WAITING_FOR_HUMAN';
  conversation.updatedAt = now;
  emit({ conversationId: conversation.id, type: 'escalation.requested', detail: supportCase.id });
  return supportCase;
}

function derivePriority(handoff: HandoffSummary): CasePriority {
  const reason = handoff.reason_for_escalation.toLowerCase();
  if (/refund|payment|fraud|charged|angry|complaint|damaged|urgent|legal/.test(reason)) return 'HIGH';
  if (handoff.confidence < 0.5) return 'HIGH';
  if (handoff.confidence < 0.75) return 'MEDIUM';
  return 'LOW';
}

export function getCase(id: string): SupportCase | null {
  return db().cases.get(id) ?? null;
}

export function listCases(filter?: { status?: SupportCase['status'][] }): SupportCase[] {
  const all = [...db().cases.values()].sort((a, b) => b.createdAt - a.createdAt);
  if (filter?.status?.length) return all.filter((c) => filter.status!.includes(c.status));
  return all;
}

export function acceptCase(id: string, agentName: string, agentEmail?: string): SupportCase | null {
  const store = db();
  const supportCase = store.cases.get(id);
  if (!supportCase) return null;
  if (supportCase.status === 'WAITING_FOR_HUMAN') {
    supportCase.status = 'HUMAN_HANDLING';
    supportCase.acceptedAt = Date.now();
  }
  supportCase.assignedTo = agentName;
  if (agentEmail) supportCase.assignedAgentEmail = agentEmail;
  supportCase.updatedAt = Date.now();
  const conversation = store.conversations.get(supportCase.conversationId);
  if (conversation) {
    conversation.state = 'HUMAN_HANDLING';
    conversation.humanAgentName = agentName;
    conversation.updatedAt = Date.now();
  }
  emit({ conversationId: supportCase.conversationId, type: 'case.accepted', detail: agentName });
  return supportCase;
}

export function resolveCase(id: string, note?: string): SupportCase | null {
  const store = db();
  const supportCase = store.cases.get(id);
  if (!supportCase) return null;
  supportCase.status = 'RESOLVED';
  supportCase.resolvedAt = Date.now();
  supportCase.updatedAt = supportCase.resolvedAt;
  supportCase.resolutionNote = note;
  const conversation = store.conversations.get(supportCase.conversationId);
  if (conversation) {
    conversation.state = 'RESOLVED';
    conversation.endedAt = Date.now();
    conversation.updatedAt = conversation.endedAt;
  }
  emit({ conversationId: supportCase.conversationId, type: 'case.resolved', detail: note });
  return supportCase;
}

export function closeConversation(id: string, detail?: string): Conversation | null {
  const conversation = db().conversations.get(id);
  if (!conversation) return null;
  if (conversation.state !== 'RESOLVED') conversation.state = 'CLOSED';
  conversation.endedAt = Date.now();
  conversation.updatedAt = conversation.endedAt;
  if (conversation.caseId) {
    const supportCase = db().cases.get(conversation.caseId);
    if (supportCase && (supportCase.status === 'WAITING_FOR_HUMAN' || supportCase.status === 'HUMAN_HANDLING')) {
      // Customer hung up before the case was resolved: keep it visible but mark it
      // so the human agent knows to call back instead of joining the channel.
      supportCase.customerLeftAt = Date.now();
      supportCase.updatedAt = supportCase.customerLeftAt;
    }
  }
  emit({ conversationId: id, type: 'conversation.closed', detail });
  return conversation;
}

/** Dashboard snapshot: everything the human UI needs in one round trip. */
export function getDashboardSnapshot() {
  const conversations = listConversations();
  const cases = listCases();
  return {
    now: Date.now(),
    liveCalls: conversations.filter(
      (c) => c.mode === 'VOICE' && c.state !== 'CLOSED' && c.state !== 'RESOLVED',
    ),
    activeChats: conversations.filter(
      (c) => c.mode === 'CHAT' && c.state !== 'CLOSED' && c.state !== 'RESOLVED',
    ),
    waitingCases: cases.filter((c) => c.status === 'WAITING_FOR_HUMAN'),
    handlingCases: cases.filter((c) => c.status === 'HUMAN_HANDLING'),
    recentResolved: cases.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').slice(0, 10),
    recentEvents: db().events.slice(-30).reverse(),
  };
}
