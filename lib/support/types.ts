import type { ShoppingUiState } from '@/lib/shopping/types';

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
  turnId?: number;
}

export interface ToolAuditEntry {
  id: string;
  at: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
  write: boolean;
}

export interface CustomerSnapshot {
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
  languageConfirmed?: boolean;
  intent?: string;
  customerName?: string;
  customer?: CustomerSnapshot;
  orderIds: string[];
  confidence?: number;
  missingInformation: string[];
  confirmedInformation: string[];
  pendingAction?: {
    tool: string;
    args: Record<string, unknown>;
    stage: 'collect_address' | 'confirm';
  };
  misunderstandings?: number;
  notes?: string[];
  shopping?: ShoppingUiState;
}

export interface Conversation {
  id: string;
  mode: ConversationMode;
  state: ConversationState;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
  channel?: string;
  customerUid?: string;
  agentId?: string;
  agentState?: string;
  lastSeenAt?: number;
  humanUid?: string;
  humanAgentName?: string;
  caseId?: string;
  context: ConversationContext;
  toolAudit: ToolAuditEntry[];
  lastActivityAt: number;
}

export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH';

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
  customer_profile?: CustomerSnapshot;
  orders?: Array<{
    order_id: string;
    status: string;
    status_text: string;
    items: string[];
    total_inr: number;
    expected_delivery: string;
    editable: boolean;
  }>;
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
  assignedAgentEmail?: string;
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
