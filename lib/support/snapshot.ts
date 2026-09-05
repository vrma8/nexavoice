/**
 * Snapshot encoding for the durable support-store mirror (see `persist.ts`).
 *
 * Pure data transforms only: no I/O, no `globalThis`, so the merge rules below can
 * be unit-tested and reused by any future backend (database, Redis, …).
 *
 * Merge rule: **newer document wins**. Each conversation/case carries an
 * `updatedAt` that every mutator bumps, so two instances that each served a
 * different customer keep both conversations instead of clobbering the whole
 * snapshot. Within one conversation the write that happened later wins outright —
 * a real multi-writer workload needs a database, not this.
 */
import type {
  Conversation,
  ConversationEvent,
  ConversationMessage,
  SupportCase,
} from './types';

export const SNAPSHOT_VERSION = 1;

/** Closed/resolved conversations older than this are dropped from the snapshot. */
const FINISHED_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CONVERSATIONS = 60;
const MAX_MESSAGES_PER_CONVERSATION = 200;
const MAX_EVENTS = 500;

/**
 * Products, carts and orders are *not* in here: they live in their own
 * PostgreSQL tables (see lib/shop/service.ts). This document only carries the
 * live support state — conversations, messages, cases and events.
 */
export interface StoreSnapshot {
  version: number;
  savedAt: number;
  /** Bumped on every write; lets callers detect a concurrent writer. */
  rev: number;
  conversations: Conversation[];
  messages: Record<string, ConversationMessage[]>;
  cases: SupportCase[];
  events: ConversationEvent[];
  /** Highest case number issued, so `NV-####` ids never repeat across instances. */
  caseCounter: number;
}

export function emptySnapshot(): StoreSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    savedAt: 0,
    rev: 0,
    conversations: [],
    messages: {},
    cases: [],
    events: [],
    caseCounter: 1023,
  };
}

export function parseSnapshot(raw: string | null): StoreSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[snapshot] discarding unreadable persisted state (not JSON)');
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as Partial<StoreSnapshot>;
  if (!Array.isArray(candidate.conversations)) return null;
  return {
    version: typeof candidate.version === 'number' ? candidate.version : SNAPSHOT_VERSION,
    savedAt: typeof candidate.savedAt === 'number' ? candidate.savedAt : 0,
    rev: typeof candidate.rev === 'number' ? candidate.rev : 0,
    conversations: candidate.conversations.filter(isConversation),
    messages: normalizeMessages(candidate.messages, candidate.conversations),
    cases: Array.isArray(candidate.cases) ? candidate.cases.filter(isCase) : [],
    events: Array.isArray(candidate.events) ? candidate.events.filter(isEvent) : [],
    caseCounter:
      typeof candidate.caseCounter === 'number' && candidate.caseCounter > 0
        ? candidate.caseCounter
        : 1023,
  };
}

function normalizeMessages(
  raw: unknown,
  conversations: unknown[],
): Record<string, ConversationMessage[]> {
  const out: Record<string, ConversationMessage[]> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    for (const [conversationId, list] of Object.entries(record)) {
      if (!Array.isArray(list)) continue;
      out[conversationId] = list.filter(
        (m): m is ConversationMessage =>
          !!m && typeof (m as ConversationMessage).id === 'string',
      );
    }
  }
  // Snapshots written by older builds keyed messages by array index.
  for (const conversation of conversations ?? []) {
    const id = (conversation as Conversation | undefined)?.id;
    if (id && !out[id]) out[id] = [];
  }
  return out;
}

function isConversation(value: unknown): value is Conversation {
  const c = value as Conversation | undefined;
  return !!c && typeof c.id === 'string' && typeof c.updatedAt === 'number' && !!c.context;
}

function isCase(value: unknown): value is SupportCase {
  const c = value as SupportCase | undefined;
  return !!c && typeof c.id === 'string' && typeof c.updatedAt === 'number';
}

function isEvent(value: unknown): value is ConversationEvent {
  const e = value as ConversationEvent | undefined;
  return !!e && typeof e.id === 'string' && typeof e.at === 'number';
}

/**
 * Folds `remote` into `local` and returns the union. `local` wins ties so the
 * instance that just served a turn never loses its own write to an older read.
 */
export function mergeSnapshots(local: StoreSnapshot, remote: StoreSnapshot): StoreSnapshot {
  const conversations = new Map<string, Conversation>();
  for (const item of remote.conversations) conversations.set(item.id, item);
  for (const item of local.conversations) {
    const existing = conversations.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) conversations.set(item.id, item);
  }

  const cases = new Map<string, SupportCase>();
  for (const item of remote.cases) cases.set(item.id, item);
  for (const item of local.cases) {
    const existing = cases.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) cases.set(item.id, item);
  }

  const messages: Record<string, ConversationMessage[]> = {};
  for (const id of conversations.keys()) {
    const merged = new Map<string, ConversationMessage>();
    for (const list of [remote.messages[id] ?? [], local.messages[id] ?? []]) {
      for (const message of list) merged.set(message.id, message);
    }
    messages[id] = [...merged.values()]
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .slice(-MAX_MESSAGES_PER_CONVERSATION);
  }

  const eventsById = new Map<string, ConversationEvent>();
  for (const event of [...remote.events, ...local.events]) eventsById.set(event.id, event);
  const events = [...eventsById.values()].sort((a, b) => a.at - b.at).slice(-MAX_EVENTS);

  return {
    version: SNAPSHOT_VERSION,
    savedAt: Math.max(local.savedAt, remote.savedAt),
    rev: Math.max(local.rev, remote.rev),
    conversations: [...conversations.values()],
    messages,
    cases: [...cases.values()],
    events,
    caseCounter: Math.max(local.caseCounter, remote.caseCounter),
  };
}

/**
 * Keeps the document small and bounded: recent conversations first, finished ones
 * dropped after `FINISHED_TTL_MS` unless a case is still open.
 */
export function pruneSnapshot(snapshot: StoreSnapshot, now = Date.now()): StoreSnapshot {
  const keep = snapshot.conversations
    .filter((conversation) => {
      const finished = conversation.state === 'CLOSED' || conversation.state === 'RESOLVED';
      if (!finished) return true;
      const age = now - (conversation.endedAt ?? conversation.updatedAt);
      return age < FINISHED_TTL_MS;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);

  const ids = new Set(keep.map((conversation) => conversation.id));
  const messages: Record<string, ConversationMessage[]> = {};
  for (const conversation of keep) {
    messages[conversation.id] = (snapshot.messages[conversation.id] ?? []).slice(
      -MAX_MESSAGES_PER_CONVERSATION,
    );
  }

  return {
    ...snapshot,
    conversations: keep,
    messages,
    cases: snapshot.cases.filter(
      (supportCase) => ids.has(supportCase.conversationId) || supportCase.status !== 'RESOLVED',
    ),
    events: snapshot.events.filter((event) => ids.has(event.conversationId)).slice(-MAX_EVENTS),
  };
}

export function serializeSnapshot(snapshot: StoreSnapshot): string {
  return JSON.stringify(pruneSnapshot(snapshot));
}
