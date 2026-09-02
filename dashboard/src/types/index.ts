export interface ConfidenceBreakdown {
  intent_confidence: number;
  asr_confidence: number;
  entity_confidence: number;
  confirmation_score: number;
  consistency_score: number;
  overall_confidence: number;
  confidence_level: "HIGH" | "MEDIUM" | "LOW";
}

export interface MessageItem {
  id?: string;
  speaker: "CALLER" | "AI" | "HUMAN";
  language: string;
  transcript: string;
  timestamp: string;
}

export interface HandoffSummary {
  language: string;
  caller_name?: string;
  phone?: string;
  reference_id?: string;
  intent?: string;
  summary: string;
  information_collected: string[];
  missing_information: string[];
  actions_taken: string[];
  reason_for_escalation: string;
  confidence: number;
  confidence_level: string;
}

export interface CaseDetail {
  field_name: string;
  field_value: string;
  confirmed: boolean;
}

export interface CaseItem {
  id: string;
  conversation_id: string;
  category: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "OPEN" | "AI_HANDLING" | "WAITING_FOR_HUMAN" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  summary: string;
  confidence: number;
  escalation_reason?: string;
  assigned_agent_id?: string;
  assigned_agent_name?: string;
  created_at: string;
  updated_at: string;
  details: CaseDetail[];
  handoff_summary?: HandoffSummary;
}

export interface CallItem {
  id: string;
  caller_number: string;
  telephony_call_id?: string;
  agora_channel: string;
  status: "IN_PROGRESS" | "AI_HANDLING" | "WAITING_FOR_HUMAN" | "HUMAN_IN_CALL" | "COMPLETED" | "FAILED";
  started_at: string;
  ended_at?: string;
  current_conversation_id?: string;
  latest_confidence?: number;
  latest_intent?: string;
}

export interface AgentState {
  language: string;
  intent?: string;
  caller_name?: string;
  phone?: string;
  reference_id?: string;
  problem_description?: string;
  confidence_breakdown: ConfidenceBreakdown;
  collected_entities: Record<string, any>;
  missing_entities: string[];
  confirmed_entities: string[];
  escalation_required: boolean;
  escalation_reason?: string;
  turns_count: number;
  correction_count: number;
}
