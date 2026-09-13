'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AgoraRTC, {
  useRTCClient,
  useLocalMicrophoneTrack,
  useRemoteUsers,
  useClientEvent,
  useJoin,
  usePublish,
  RemoteUser,
  UID,
} from 'agora-rtc-react';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  AgentState,
  MessageSalStatus,
  TranscriptHelperMode,
  type TranscriptHelperItem,
  type UserTranscription,
  type AgentTranscription,
} from 'agora-agent-client-toolkit';
import { DEFAULT_AGENT_UID, DEFAULT_HUMAN_UID, MISSING_APP_ID_MESSAGE, resolveAppId } from '@/lib/agora';
import {
  getCurrentInProgressMessage,
  getMessageList,
  normalizeTimestampMs,
  normalizeTranscript,
  resolveCallDisplayState,
  type CallDisplayState,
  type TranscriptMessage,
} from '@/lib/conversation';
import { MicrophoneSelector } from './MicrophoneSelector';
import {
  getConversationIssueSeverity,
  type ConnectionIssue,
} from './ConversationErrorCard';
import { ConnectionStatusPanel } from './ConnectionStatusPanel';
import { HandoffBanner } from './HandoffBanner';
import { useConversationSync } from './useConversationSync';
import { requestEscalation } from '@/lib/api';
import { Headset, Loader2, Mic, MicOff, PhoneOff, Sparkles } from 'lucide-react';
import type { ConversationComponentProps } from '@/types/conversation';

const MAX_CONNECTION_ISSUES = 6;

export type AgentMetric = {
  type: string;
  name: string;
  value: number;
  timestamp: number;
};

type AgoraRtcWithParameters = typeof AgoraRTC & {
  setParameter?: (key: string, value: unknown) => void;
};

type RtmMessageErrorPayload = {
  object: 'message.error';
  module?: string;
  code?: number;
  message?: string;
  send_ts?: number;
};

type RtmSalStatusPayload = {
  object: 'message.sal_status';
  status?: string;
  timestamp?: number;
};

function isRtmMessageErrorPayload(
  value: unknown,
): value is RtmMessageErrorPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.error'
  );
}

function isRtmSalStatusPayload(value: unknown): value is RtmSalStatusPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.sal_status'
  );
}

export default function ConversationComponent({
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEndConversation,
  onConversationSnapshot,
  toolsEnabled = true,
}: ConversationComponentProps) {
  const client = useRTCClient();
  const remoteUsers = useRemoteUsers();
  const [isEnabled, setIsEnabled] = useState(true);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [isConnectionDetailsOpen, setIsConnectionDetailsOpen] = useState(false);

  const [connectionState, setConnectionState] = useState<string>('CONNECTING');
  const agentUID = String(DEFAULT_AGENT_UID);
  const [joinedUID, setJoinedUID] = useState<UID>(0);

  const [rawTranscript, setRawTranscript] = useState<
    TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[]
  >([]);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [agentMetrics, setAgentMetrics] = useState<AgentMetric[]>([]);
  const [connectionIssues, setConnectionIssues] = useState<ConnectionIssue[]>(
    [],
  );
  const addConnectionIssue = useCallback((issue: ConnectionIssue) => {
    setConnectionIssues((prev) => {
      const isDuplicate = prev.some(
        (x) =>
          x.agentUserId === issue.agentUserId &&
          x.code === issue.code &&
          x.message === issue.message &&
          Math.abs(x.timestamp - issue.timestamp) < 1500,
      );
      if (isDuplicate) return prev;
      return [issue, ...prev].slice(0, MAX_CONNECTION_ISSUES);
    });
  }, []);

  useEffect(() => {
    if (connectionIssues.length > 0) {
      setIsConnectionDetailsOpen(true);
    }
  }, [connectionIssues.length]);

  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setIsReady(false);
    };
  }, []);

  const appId = resolveAppId(agoraData.appId);

  const {
    isConnected: joinSuccess,
    isLoading: isJoining,
    error: joinError,
  } = useJoin(
    {
      appid: appId ?? '',
      channel: agoraData.channel,
      token: agoraData.token,
      uid: parseInt(agoraData.uid, 10),
    },
    isReady && Boolean(appId),
  );

  useEffect(() => {
    if (!joinError) return;
    addConnectionIssue({
      id: `${Date.now()}-rtc-join`,
      source: 'rtc',
      agentUserId: String(client?.uid ?? agoraData.uid),
      code: 'RTC_JOIN_FAILED',
      message: joinError.message ?? String(joinError),
      timestamp: Date.now(),
    });
  }, [joinError, addConnectionIssue, client, agoraData.uid]);

  useEffect(() => {
    if (!appId) {
      addConnectionIssue({
        id: 'missing-app-id',
        source: 'session',
        agentUserId: agentUID,
        code: 'MISSING_APP_ID',
        message: MISSING_APP_ID_MESSAGE,
        timestamp: Date.now(),
      });
    }
  }, [appId, addConnectionIssue, agentUID]);

  useEffect(() => {
    if (!isReady || !joinSuccess || isAgentConnected) return;
    const timer = setTimeout(() => {
      addConnectionIssue({
        id: 'agent-not-joined',
        source: 'session',
        agentUserId: agentUID,
        code: 'AGENT_NOT_JOINED',
        message:
          `No Conversational AI agent (uid ${agentUID}) joined channel "${agoraData.channel}" within 20s. ` +
          `If /api/invite-agent returned an error, fix that first; otherwise run \`agora project doctor --deep\` ` +
          `and confirm Conversational AI is enabled for this App ID in Agora Console.`,
        timestamp: Date.now(),
      });
    }, 20000);
    return () => clearTimeout(timer);
  }, [
    isReady,
    joinSuccess,
    isAgentConnected,
    addConnectionIssue,
    agentUID,
    agoraData.channel,
  ]);

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);

  useEffect(() => {
    try {
      AgoraRTC.disableLogUpload();
    } catch {
      // ignore if unsupported
    }
    if (!client) return;
    try {
      (AgoraRTC as AgoraRtcWithParameters).setParameter?.(
        'ENABLE_AUDIO_PTS',
        true,
      );
    } catch (error) {
      console.warn('Could not set ENABLE_AUDIO_PTS:', error);
    }
  }, [client]);

  useEffect(() => {
    if (joinSuccess && client) {
      const uid = client.uid;
      if (uid !== null && uid !== undefined) {
        setJoinedUID(uid);
      }
    }
  }, [joinSuccess, client]);

  useEffect(() => {
    if (!isReady || !joinSuccess) return;

    let cancelled = false;

    (async () => {
      try {
        const ai = await AgoraVoiceAI.init({
          rtcEngine: client,
          rtmConfig: { rtmEngine: rtmClient },
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: true,
        });

        if (cancelled) {
          try {
            if (AgoraVoiceAI.getInstance() === ai) {
              ai.unsubscribe();
              ai.destroy();
            }
          } catch {}
          return;
        }

        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => {
          setRawTranscript([...t]);
        });
        ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) =>
          setAgentState(event.state),
        );
        ai.on(AgoraVoiceAIEvents.AGENT_METRICS, (_, metrics) => {
          setAgentMetrics((prev) => [...prev, metrics].slice(-8));
        });
        ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-message-error-${error.code}`,
            source: 'rtm',
            agentUserId,
            code: error.code,
            message: error.message,
            timestamp: normalizeTimestampMs(error.timestamp),
          });
        });
        ai.on(
          AgoraVoiceAIEvents.MESSAGE_SAL_STATUS,
          (agentUserId, salStatus) => {
            if (
              salStatus.status === MessageSalStatus.VP_REGISTER_FAIL ||
              salStatus.status === MessageSalStatus.VP_REGISTER_DUPLICATE
            ) {
              addConnectionIssue({
                id: `${Date.now()}-${agentUserId}-sal-${salStatus.status}`,
                source: 'rtm',
                agentUserId,
                code: salStatus.status,
                message: `SAL status: ${salStatus.status}`,
                timestamp: normalizeTimestampMs(salStatus.timestamp),
              });
            }
          },
        );
        ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-agent-error-${error.code}`,
            source: 'agent',
            agentUserId,
            code: error.code,
            message: `${error.type}: ${error.message}`,
            timestamp: normalizeTimestampMs(error.timestamp),
          });
        });
        ai.subscribeMessage(agoraData.channel);
      } catch (error) {
        if (!cancelled) {
          console.error('[AgoraVoiceAI] init failed:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        const ai = AgoraVoiceAI.getInstance();
        if (ai) {
          ai.unsubscribe();
          ai.destroy();
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, joinSuccess]);

  useEffect(() => {
    const handleRtmMessage = (event: {
      message: string | Uint8Array;
      publisher: string;
    }) => {
      const payloadText =
        typeof event.message === 'string'
          ? event.message
          : new TextDecoder().decode(event.message);

      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        return;
      }

      if (isRtmMessageErrorPayload(parsed)) {
        const p = parsed;
        addConnectionIssue({
          id: `${Date.now()}-${event.publisher}-rtm-msg-error-${p.code ?? 'unknown'}`,
          source: 'rtm-signaling',
          agentUserId: event.publisher,
          code: p.code ?? 'unknown',
          message: `${p.module ?? 'unknown'}: ${p.message ?? 'Unknown signaling error'}`,
          timestamp: normalizeTimestampMs(p.send_ts ?? Date.now()),
        });
        return;
      }

      if (isRtmSalStatusPayload(parsed)) {
        const p = parsed;
        if (
          p.status === 'VP_REGISTER_FAIL' ||
          p.status === 'VP_REGISTER_DUPLICATE'
        ) {
          addConnectionIssue({
            id: `${Date.now()}-${event.publisher}-rtm-sal-${p.status}`,
            source: 'rtm-signaling',
            agentUserId: event.publisher,
            code: p.status,
            message: `SAL status: ${p.status}`,
            timestamp: normalizeTimestampMs(p.timestamp ?? Date.now()),
          });
        }
      }
    };

    rtmClient.addEventListener('message', handleRtmMessage);
    return () => {
      rtmClient.removeEventListener('message', handleRtmMessage);
    };
  }, [rtmClient, addConnectionIssue]);

  const transcript = useMemo(() => {
    return normalizeTranscript(rawTranscript, String(client.uid));
  }, [rawTranscript, client.uid]);

  const messageList = useMemo(() => getMessageList(transcript), [transcript]);

  const currentInProgressMessage = useMemo(() => {
    return getCurrentInProgressMessage(transcript);
  }, [transcript]);

  const { conversation: backendConversation, supportCase } = useConversationSync({
    conversationId: agoraData.conversationId,
    agentUID,
    localUID: String(client.uid),
    messageList,
    agentState,
    onConversation: onConversationSnapshot,
  });

  const humanUID = String(DEFAULT_HUMAN_UID);
  const isHumanConnected = useMemo(
    () => remoteUsers.some((user) => user.uid.toString() === humanUID),
    [remoteUsers, humanUID],
  );
  const conversationState = backendConversation?.state ?? 'AI_HANDLING';
  const isHumanPhase =
    isHumanConnected || conversationState === 'HUMAN_HANDLING';

  const [isEscalating, setIsEscalating] = useState(false);
  const [escalationError, setEscalationError] = useState<string | null>(null);
  const canEscalate =
    Boolean(agoraData.conversationId) &&
    !isEscalating &&
    conversationState === 'AI_HANDLING';
  const handleRequestHuman = useCallback(async () => {
    if (!agoraData.conversationId) return;
    setIsEscalating(true);
    setEscalationError(null);
    try {
      await requestEscalation(
        agoraData.conversationId,
        "Customer pressed 'Talk to a human' during the call",
      );
    } catch (error) {
      console.error('Escalation request failed:', error);
      setEscalationError(
        error instanceof Error ? error.message : 'Could not reach a human agent queue.',
      );
    } finally {
      setIsEscalating(false);
    }
  }, [agoraData.conversationId]);

  usePublish([localMicrophoneTrack]);

  useClientEvent(client, 'user-joined', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(true);
  });

  useClientEvent(client, 'user-left', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(false);
  });

  useEffect(() => {
    const isAgentInRemoteUsers = remoteUsers.some(
      (user) => user.uid.toString() === agentUID,
    );
    setIsAgentConnected(isAgentInRemoteUsers);
  }, [remoteUsers, agentUID]);

  useClientEvent(client, 'connection-state-change', (curState) => {
    setConnectionState(curState);
  });

  const effectiveConnectionState =
    isJoining && !joinSuccess ? 'CONNECTING' : connectionState;

  const connectionSeverity = useMemo<'normal' | 'warning' | 'error'>(() => {
    if (
      effectiveConnectionState === 'DISCONNECTED' ||
      effectiveConnectionState === 'DISCONNECTING'
    ) {
      return 'error';
    }
    if (
      effectiveConnectionState === 'CONNECTING' ||
      effectiveConnectionState === 'RECONNECTING'
    ) {
      return 'warning';
    }
    if (connectionIssues.length === 0) {
      return 'normal';
    }
    return connectionIssues.some(
      (issue) => getConversationIssueSeverity(issue) === 'error',
    )
      ? 'error'
      : 'warning';
  }, [effectiveConnectionState, connectionIssues]);

  const displayState: CallDisplayState = resolveCallDisplayState(
    agentState,
    isAgentConnected,
    effectiveConnectionState,
  );

  const latestLlmMetric = useMemo(() => {
    const llm = agentMetrics.filter((m) => /llm|mllm/i.test(m.type));
    return llm.length > 0 ? llm[llm.length - 1] : null;
  }, [agentMetrics]);

  const statusLine = useMemo(() => {
    if (isHumanConnected) {
      return isEnabled
        ? `You're talking to ${backendConversation?.humanAgentName ?? 'a human support agent'}`
        : "You're muted — unmute so the agent can hear you";
    }
    if (conversationState === 'HUMAN_HANDLING') {
      return 'A human support agent is joining this call…';
    }
    if (!isEnabled) return "You're muted — Nexa can't hear you";
    switch (displayState) {
      case 'disconnected':
        return 'Connection lost — reconnecting…';
      case 'connecting':
        return 'Connecting to Nexa…';
      case 'not-joined':
        return 'Waiting for Nexa to join…';
      case 'listening':
        return 'Listening — go ahead';
      case 'thinking':
        return 'Checking that for you…';
      case 'speaking':
        return 'Nexa is speaking';
      default:
        return 'Ready when you are';
    }
  }, [isHumanConnected, conversationState, displayState, isEnabled, backendConversation?.humanAgentName]);

  const handleMicToggle = useCallback(async () => {
    const next = !isEnabled;
    const track = localMicrophoneTrack;
    if (!track) {
      setIsEnabled(next);
      return;
    }
    try {
      await track.setEnabled(next);
      setIsEnabled(next);
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
    }
  }, [isEnabled, localMicrophoneTrack]);

  const handleTokenWillExpire = useCallback(async () => {
    if (!onTokenWillExpire || !joinedUID) return;
    try {
      const { rtcToken, rtmToken } = await onTokenWillExpire(
        joinedUID.toString(),
      );
      await client?.renewToken(rtcToken);
      await rtmClient.renewToken(rtmToken);
    } catch (error) {
      console.error('Failed to renew Agora token:', error);
    }
  }, [client, onTokenWillExpire, joinedUID, rtmClient]);

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire);

  const handleEndConversation = useCallback(async () => {
    onEndConversation();
  }, [onEndConversation]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-left">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border bg-card/60 px-4 py-3">
        <VoiceAvatar state={displayState} humanPhase={isHumanPhase} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {isHumanPhase ? backendConversation?.humanAgentName ?? 'Support agent' : 'Nexa'}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                isHumanPhase
                  ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                  : 'border-primary/25 bg-primary/10 text-primary'
              }`}
            >
              {isHumanPhase ? 'human agent' : 'AI'}
            </span>
            {!isEnabled && (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
                <MicOff className="h-3 w-3" /> muted
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{statusLine}</p>
        </div>
        {latestLlmMetric && (
          <span
            className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block"
            title={`${latestLlmMetric.name} — last LLM stage latency`}
          >
            {Math.round(latestLlmMetric.value)}ms
          </span>
        )}
        <ConnectionStatusPanel
          connectionState={effectiveConnectionState}
          connectionSeverity={connectionSeverity}
          connectionIssues={connectionIssues}
          isOpen={isConnectionDetailsOpen}
          onToggle={() => setIsConnectionDetailsOpen((open) => !open)}
        />
        <button
          type="button"
          onClick={handleEndConversation}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 text-xs font-medium text-red-300 transition-colors hover:bg-destructive/20"
          aria-label="End the call"
          title="End the call"
        >
          <PhoneOff className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">End</span>
        </button>
      </header>

      {/* Escalation / takeover banner */}
      <HandoffBanner
        state={backendConversation?.state}
        caseId={supportCase?.id}
        humanName={backendConversation?.humanAgentName}
        isHumanConnected={isHumanConnected}
        isAgentConnected={isAgentConnected}
      />

      {/* Limited-mode notice: tools unreachable means the AI can talk but not act. */}
      {!toolsEnabled && (
        <div className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[11px] leading-relaxed text-amber-200" role="status">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Limited call mode — this deployment has no public URL for the AI&apos;s
            order tools, so Nexa can&apos;t look up or change orders on this call. Use
            the chat tab for full account actions, or ask for a human agent.
          </span>
        </div>
      )}

      {/* Orb + live caption */}
      <section
        className="flex shrink-0 flex-col items-center justify-center gap-3 px-4 py-4"
        aria-label="Call status"
      >
        <VoiceOrb state={displayState} muted={!isEnabled} humanPhase={isHumanPhase} />
        <p className="text-center text-sm font-medium text-foreground" aria-live="polite">
          {statusLine}
        </p>
        <p className="min-h-[1.25rem] max-w-full truncate text-center text-xs text-muted-foreground" aria-live="polite">
          {currentInProgressMessage?.text?.trim() || '\u00A0'}
        </p>
      </section>

      {/* Transcript */}
      <section
        className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border"
        aria-label="Live transcript"
      >
        <TranscriptList
          messageList={messageList}
          agentUID={agentUID}
          humanUID={humanUID}
        />
      </section>

      {/* Controls */}
      <footer className="shrink-0 border-t border-border bg-card/60 px-3 py-3">
        {escalationError && (
          <p className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-center text-[11px] text-red-300">
            {escalationError}
          </p>
        )}
        <div
          className="flex items-center justify-center gap-2"
          role="group"
          aria-label="Call controls"
        >
          {/* Mute / Unmute */}
          <button
            type="button"
            onClick={() => void handleMicToggle()}
            aria-pressed={!isEnabled}
            aria-label={isEnabled ? 'Mute your microphone' : 'Unmute your microphone'}
            className={`flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
              isEnabled
                ? 'border-border bg-secondary text-secondary-foreground hover:border-primary/40 hover:text-foreground'
                : 'border-destructive/50 bg-destructive/15 text-red-300 hover:bg-destructive/25'
            }`}
          >
            {isEnabled ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
            {isEnabled ? 'Mute' : 'Unmute'}
          </button>

          <MicrophoneSelector localMicrophoneTrack={localMicrophoneTrack} />

          {/* Escalate to a human */}
          {agoraData.conversationId && !isHumanPhase && (
            <button
              type="button"
              onClick={() => void handleRequestHuman()}
              disabled={!canEscalate}
              className="flex h-11 items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Talk to a human support agent"
            >
              {isEscalating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Headset className="h-4 w-4" />
              )}
              {conversationState === 'AI_HANDLING'
                ? isEscalating
                  ? 'Connecting…'
                  : 'Human'
                : 'Human notified'}
            </button>
          )}
        </div>
      </footer>

      {/* Remote audio (AI agent + human agent) plays through hidden receivers. */}
      <div className="hidden" aria-hidden="true">
        {remoteUsers.map((user) => (
          <RemoteUser key={user.uid} user={user} />
        ))}
      </div>
    </div>
  );
}

function VoiceAvatar({
  state,
  humanPhase,
}: {
  state: CallDisplayState;
  humanPhase: boolean;
}) {
  const ring =
    humanPhase || state === 'speaking'
      ? 'border-purple-400/50 bg-purple-500/15'
      : state === 'thinking'
        ? 'border-amber-400/50 bg-amber-500/10'
        : state === 'listening'
          ? 'border-primary/50 bg-primary/10'
          : state === 'disconnected'
            ? 'border-destructive/40 bg-destructive/10'
            : 'border-border bg-secondary';
  return (
    <div
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${ring}`}
      aria-hidden="true"
    >
      {humanPhase ? (
        <Headset className="h-4 w-4 text-purple-300" />
      ) : (
        <Mic className={`h-4 w-4 ${state === 'disconnected' ? 'text-red-400' : 'text-primary'}`} />
      )}
      {(state === 'listening' || state === 'speaking') && !humanPhase && (
        <span className="absolute inset-0 animate-ping rounded-full border border-primary/30" style={{ animationDuration: '2.5s' }} />
      )}
    </div>
  );
}

const ORB_STYLES: Record<
  CallDisplayState,
  { core: string; label: string }
> = {
  disconnected: { core: 'from-red-500/70 to-red-900', label: 'disconnected' },
  connecting: { core: 'from-sky-500/70 to-slate-900', label: 'connecting' },
  'not-joined': { core: 'from-sky-500/60 to-slate-900', label: 'waiting' },
  listening: { core: 'from-cyan-400/80 to-sky-900', label: 'listening' },
  thinking: { core: 'from-amber-400/80 to-amber-900', label: 'thinking' },
  speaking: { core: 'from-purple-400/80 to-violet-900', label: 'speaking' },
  idle: { core: 'from-sky-500/50 to-slate-900', label: 'ready' },
};

function VoiceOrb({
  state,
  muted,
  humanPhase,
}: {
  state: CallDisplayState;
  muted: boolean;
  humanPhase: boolean;
}) {
  const style = humanPhase
    ? { core: 'from-purple-400/80 to-violet-900', label: 'human agent' }
    : ORB_STYLES[state];
  const showRings = humanPhase || state === 'listening' || state === 'speaking';
  const showSpinner = !humanPhase && state === 'thinking';

  return (
    <div className="relative flex h-28 w-28 items-center justify-center" role="img" aria-label={`Call status: ${style.label}`}>
      {showRings && (
        <>
          <span className={`voice-orb-ring ${muted ? 'voice-orb-ring--muted' : ''}`} style={{ animationDelay: '0s' }} />
          <span className={`voice-orb-ring ${muted ? 'voice-orb-ring--muted' : ''}`} style={{ animationDelay: '1.1s' }} />
        </>
      )}
      {showSpinner && (
        <span className="absolute inset-[-6px] animate-spin rounded-full border-2 border-transparent border-t-amber-400/80" />
      )}
      <div
        className={`relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${style.core} ${
          muted ? 'opacity-40 saturate-50' : ''
        } shadow-[0_0_36px_-6px_rgba(56,189,248,0.45)] transition-opacity`}
      >
        {humanPhase ? (
          <Headset className="h-7 w-7 text-white/90" />
        ) : state === 'speaking' ? (
          <span className="voice-eq" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
        ) : muted ? (
          <MicOff className="h-7 w-7 text-white/80" />
        ) : (
          <Mic className="h-7 w-7 text-white/80" />
        )}
      </div>
    </div>
  );
}

function TranscriptList({
  messageList,
  agentUID,
  humanUID,
}: {
  messageList: TranscriptMessage[];
  agentUID: string;
  humanUID: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = messageList;

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {messages.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Start speaking — the conversation appears here.
        </p>
      ) : (
        <ol className="space-y-2.5">
          {messages.map((message, index) => {
            const uid = String(message.uid);
            const isAgent = uid === agentUID;
            const isHuman = uid === humanUID;
            const mine = !isAgent && !isHuman;
            const who = isAgent ? 'Nexa' : isHuman ? 'Agent' : 'You';
            return (
              <li
                key={`${message.turn_id ?? message.uid}-${index}`}
                className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                <div className="mb-0.5 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>{who}</span>
                  {message.createdAt && (
                    <span className="font-normal normal-case">
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm leading-relaxed ${
                    mine
                      ? 'border-primary/25 bg-primary/10 text-foreground'
                      : isHuman
                        ? 'border-purple-500/25 bg-purple-500/10 text-foreground'
                        : 'border-border bg-card text-card-foreground'
                  }`}
                >
                  {message.text?.trim() || '…'}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
