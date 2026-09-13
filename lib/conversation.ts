import {
  type AgentState,
  type AgentTranscription,
  TurnStatus,
  type TranscriptHelperItem,
  type UserTranscription,
} from 'agora-agent-client-toolkit';
import { spokenNumbersToDigits } from './numbers';

export interface TranscriptMessage {
  turn_id?: string | number;
  uid: number | string;
  text?: string;
  status?: string;
  createdAt?: number;
}

export function normalizeTranscriptSpacing(text: string): string {
  return text
    .replace(/([.!?])([A-Za-z])/g, '$1 $2')
    .replace(/,([A-Za-z])/g, ', $1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalizeTranscriptText(text: string): string {
  return spokenNumbersToDigits(normalizeTranscriptSpacing(text));
}

export function normalizeTimestampMs(timestamp: number): number {
  return timestamp > 1e12 ? timestamp : timestamp * 1000;
}

export type CallDisplayState =
  | 'disconnected'
  | 'connecting'
  | 'not-joined'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'idle';

export function resolveCallDisplayState(
  agentState: AgentState | string | null,
  isAgentConnected: boolean,
  connectionState: string,
): CallDisplayState {
  if (
    connectionState === 'DISCONNECTED' ||
    connectionState === 'DISCONNECTING'
  ) {
    return 'disconnected';
  }

  if (
    connectionState === 'CONNECTING' ||
    connectionState === 'RECONNECTING'
  ) {
    return 'connecting';
  }

  if (!isAgentConnected) {
    return 'not-joined';
  }

  switch (agentState) {
    case 'listening':
      return 'listening';
    case 'thinking':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'idle':
    case 'silent':
    default:
      return 'idle';
  }
}

export function toMessageListItem(
  item: TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>,
): TranscriptMessage {
  return {
    turn_id: item.turn_id,
    uid: Number(item.uid) || 0,
    text: typeof item.text === 'string' ? normalizeTranscriptText(item.text) : '',
    status: item.status as unknown as TranscriptMessage['status'],
    createdAt:
      typeof item._time === 'number'
        ? normalizeTimestampMs(item._time)
        : undefined,
  };
}

export function normalizeTranscript(
  transcript: TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[],
  localUID: string,
) {
  return transcript.map((item) => {
    const remappedUID = item.uid === '0' ? localUID : item.uid;
    const normalizedText =
      typeof item.text === 'string' ? normalizeTranscriptText(item.text) : item.text;
    return { ...item, uid: remappedUID, text: normalizedText };
  });
}

export function getMessageList(
  transcript: TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[],
): TranscriptMessage[] {
  return transcript
    .filter((item) => item.status !== TurnStatus.IN_PROGRESS)
    .map(toMessageListItem);
}

export function getCurrentInProgressMessage(
  transcript: TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[],
): TranscriptMessage | null {
  const item = transcript.find((entry) => entry.status === TurnStatus.IN_PROGRESS);
  return item ? toMessageListItem(item) : null;
}
