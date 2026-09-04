/**
 * Shared conversation / case model used by chat, voice and the human dashboard.
 * The backend (Next.js API routes) owns this state — the browser never does.
 * See "Nexavoice Docs/v1.md" §20–§24.
 */

export type ConversationMode = 'CHAT' | 'VOICE';

export type ConversationState =
  | 'AI_HANDLING'
  | 'WAITING_FOR_HUMAN'
  | 'HUMAN_HANDLING'
  | 'RESOLVED'
  | 'CLOSED';

export type MessageRole = 'user' | 'ai' | 'human_agent' | 'system';

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  /** Voice transcript turn id (dedupes RTM turn updates). */
  turnId?: number;
}

export interface ToolAuditEntry {
  id: string;
  at: number;
  tool: string;
  /** Sanitised arguments (never secrets). */
  args: Record<string, unknown>;
  ok: boolean;
  /** One-line human readable description of what happened. */
  summary: string;
  /** Whether the tool mutated demo backend data. */
  write: boolean;
}

export interface CustomerSnapshot {
  id: string;
  name: string;
  phone: string;
  email: string;
  tier: 'standard' | 'prime';
  city: string;
}

export interface ConversationContext {
  language?: string;
  intent?: string;
  customerName?: string;
  customer?: CustomerSnapshot;
  /** Orders the AI looked up or changed in this conversation. */
  orderIds: string[];
  confidence?: number;
  missingInformation: string[];
  confirmedInformation: string[];
  /**
   * Chat-path only: a write action the assistant proposed and is waiting for
   * the customer to confirm (never executed without an explicit yes).
   */
  pendingAction?: {
    tool: string;
    args: Record<string, unknown>;
    stage: 'collect_address' | 'confirm';
  };
  /** Consecutive turns the rule-based chat agent failed to understand. */
  misunderstandings?: number;
}

export interface Conversation {
  id: string;
  mode: ConversationMode;
  state: ConversationState;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
  /** Agora RTC/RTM channel (voice only). */
  channel?: string;
  /** Customer RTC uid (voice only). */
  customerUid?: string;
  /** Agora Conversational AI agent id (voice only). */
  agentId?: string;
  /** Latest agent state reported by the client (listening/thinking/speaking…). */
  agentState?: string;
  /** Human agent uid when a human has joined the voice channel. */
  humanUid?: string;
  humanAgentName?: string;
  caseId?: string;
  context: ConversationContext;
  toolAudit: ToolAuditEntry[];
  lastActivityAt: number;
}

export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH';

/** Handoff summary — v1.md §24 shape, generated at escalation time. */
export interface HandoffSummary {
  conversation_id: string;
  mode: 'chat' | 'voice';
  language: string;
  client_name: string;
  intent: string;
  summary: string;
  information_collected: string[];
  actions_taken: string[];
  reason_for_escalation: string;
  confidence: number;
  missing_information: string[];
}

export interface SupportCase {
  id: string;
  conversationId: string;
  mode: ConversationMode;
  status: Extract<ConversationState, 'WAITING_FOR_HUMAN' | 'HUMAN_HANDLING' | 'RESOLVED' | 'CLOSED'>;
  priority: CasePriority;
  createdAt: number;
  updatedAt: number;
  acceptedAt?: number;
  resolvedAt?: number;
  assignedTo?: string;
  /** Set when the customer ended the chat/call while the case was still open. */
  customerLeftAt?: number;
  handoff: HandoffSummary;
  customer?: CustomerSnapshot;
  resolutionNote?: string;
}

export interface ConversationEvent {
  id: string;
  conversationId: string;
  at: number;
  type:
    | 'conversation.created'
    | 'agent.started'
    | 'agent.stopped'
    | 'tool.called'
    | 'escalation.requested'
    | 'case.accepted'
    | 'human.joined'
    | 'human.left'
    | 'case.resolved'
    | 'conversation.closed';
  detail?: string;
}
