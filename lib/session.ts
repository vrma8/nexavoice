/**
 * Browser-side login session helpers.
 *
 * The /login page persists the client/agent record (returned by the database
 * through POST /api/auth/login) to localStorage; pages read it here to show the
 * signed-in person's details. The database remains the source of truth —
 * /api/auth/me re-reads the record if a page wants to confirm it.
 */

export interface ClientSession {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: string;
  city: string;
  /** Saved delivery address — pre-fills checkout, updated when an order is placed. */
  address: string;
  preferredLanguage: string;
}

export interface AgentSession {
  id: string;
  name: string;
  email: string;
  title: string;
}

const CLIENT_KEY = 'nexavoice.client';
const AGENT_KEY = 'nexavoice.agent';

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function clear(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

export function getClientSession(): ClientSession | null {
  return read<ClientSession>(CLIENT_KEY);
}

export function saveClientSession(session: ClientSession): void {
  write(CLIENT_KEY, session);
}

export function clearClientSession(): void {
  clear(CLIENT_KEY);
}

export function getAgentSession(): AgentSession | null {
  return read<AgentSession>(AGENT_KEY);
}

export function saveAgentSession(session: AgentSession): void {
  write(AGENT_KEY, session);
}

export function clearAgentSession(): void {
  clear(AGENT_KEY);
}
