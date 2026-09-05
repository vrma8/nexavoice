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
  /** Client row id (PostgreSQL) — every tool call is scoped to it. */
  id: string;
  name: string;
  phone: string;
  email: string;
  tier: string;
  city: string;
  address?: string;
  preferredLanguage?: string;
}

export interface ConversationContext {
  language?: string;
  intent?: string;
  customerName?: string;
  customer?: CustomerSnapshot;
  /** Orders the AI looked up or changed in this conversation (order codes). */
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
  /** Free-form facts the customer gave during this conversation (for the handoff). */
  notes?: string[];
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
  /** Last heartbeat received from the customer's browser. */
  lastSeenAt?: number;
  /** Human agent uid when a human has joined the voice channel. */
  humanUid?: string;
  humanAgentName?: string;
  caseId?: string;
  context: ConversationContext;
  toolAudit: ToolAuditEntry[];
  lastActivityAt: number;
}

export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Handoff summary generated at escalation time — everything the human agent
 * needs to continue without asking the customer to repeat themselves:
 * who they are (from the database), what they bought, what the AI already did,
 * and the tail of the actual conversation.
 */
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
  /** Client record as stored in PostgreSQL at escalation time. */
  customer_profile?: CustomerSnapshot;
  /** Live orders of that client, newest first. */
  orders?: Array<{
    order_id: string;
    status: string;
    status_text: string;
    items: string[];
    total_inr: number;
    expected_delivery: string;
    editable: boolean;
  }>;
  /** Last turns of the conversation, oldest first ("Customer: …" / "AI: …"). */
  transcript_excerpt?: string[];
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
  /** Email of the signed-in agent who accepted the case (from /login). */
  assignedAgentEmail?: string;
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
