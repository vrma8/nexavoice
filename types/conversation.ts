import type { RTMClient } from 'agora-rtm';

export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
  /** Backend conversation id registered by /api/invite-agent. */
  conversationId?: string;
  /**
   * Agora App ID, served by /api/generate-agora-token instead of being inlined from
   * NEXT_PUBLIC_AGORA_APP_ID at build time. On Vercel a variable that is set for
   * Runtime but not for Builds leaves the client bundle with `undefined`, and the
   * RTC join then fails with no explanation. Server-supplied removes that class of
   * failure; the env var remains the fallback.
   */
  appId?: string;
  /** Unix seconds when `token` stops being valid (renewal is automatic). */
  expiresAt?: number;
}

export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
}

export interface StopConversationRequest {
  agent_id: string;
  /** Optional: closes the backend conversation as well. */
  conversation_id?: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
  conversation_id?: string;
  tools_enabled?: boolean;
}

export interface AgoraRenewalTokens {
  rtcToken: string;
  rtmToken: string;
}

export interface ConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  onTokenWillExpire: (uid: string) => Promise<AgoraRenewalTokens>;
  onEndConversation: () => void;
}
