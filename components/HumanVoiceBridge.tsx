'use client';

import { useEffect, useRef, useState } from 'react';
import {
  RemoteUser,
  useJoin,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
} from 'agora-rtc-react';
import { MISSING_APP_ID_MESSAGE, resolveAppId } from '@/lib/agora';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';

export type HumanVoiceBridgeProps = {
  channel: string;
  token: string;
  uid: string;
  agentUid: string;
  customerUid?: string;
  /** App ID served by the API route; falls back to the inlined NEXT_PUBLIC_ value. */
  appId?: string | null;
  /** Called once when the RTC join succeeds — the page then triggers the AI takeover. */
  onJoined: () => void;
  onLeave: () => void;
};

/**
 * Human agent side of a voice takeover: joins the *same* Agora RTC channel as
 * the customer (uid 654321), publishes the mic and plays remote audio. The AI
 * agent is asked to leave via POST /api/cases/:id/takeover after the join.
 * Must be rendered inside an <AgoraRTCProvider>; the provider owns the client
 * lifecycle (no manual client.leave()/track.close() here — see AGENTS.md).
 */
export default function HumanVoiceBridge({
  channel,
  token,
  uid,
  agentUid,
  customerUid,
  appId: appIdFromServer,
  onJoined,
  onLeave,
}: HumanVoiceBridgeProps) {
  // StrictMode guard (same pattern as ConversationComponent): join exactly once.
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

  const appId = resolveAppId(appIdFromServer);
  const { isConnected, error: joinError } = useJoin(
    {
      appid: appId ?? '',
      channel,
      token,
      uid: parseInt(uid, 10),
    },
    isReady && Boolean(appId),
  );

  // A failed join used to leave the panel spinning on "Joining the call…" forever,
  // which is indistinguishable from a slow network when a takeover is needed fast.
  const joinFailure = !appId
    ? MISSING_APP_ID_MESSAGE
    : joinError
      ? (joinError.message ?? 'The RTC join failed. Check the App ID, token and channel.')
      : null;
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);
  usePublish([localMicrophoneTrack]);
  const remoteUsers = useRemoteUsers();
  const [micOn, setMicOn] = useState(true);

  const joinedNotified = useRef(false);
  useEffect(() => {
    if (isConnected && !joinedNotified.current) {
      joinedNotified.current = true;
      onJoined();
    }
  }, [isConnected, onJoined]);

  const toggleMic = async () => {
    const next = !micOn;
    try {
      await localMicrophoneTrack?.setEnabled(next);
    } catch (error) {
      console.error('Failed to toggle mic', error);
    }
    setMicOn(next);
  };

  const aiStillInChannel = remoteUsers.some((u) => u.uid.toString() === agentUid);
  const customerInChannel = customerUid
    ? remoteUsers.some((u) => u.uid.toString() === customerUid)
    : remoteUsers.some((u) => u.uid.toString() !== agentUid);

  return (
    <div className="rounded-lg border border-purple-800 bg-purple-950/30 p-3 text-sm">
      <div className="flex items-center gap-2">
        {isConnected ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-300" />
        )}
        <span className="font-medium text-purple-100">
          {isConnected
            ? 'You are live in the customer call'
            : joinFailure
              ? 'Could not join the call'
              : 'Joining the call…'}
        </span>
        <span className="ml-auto font-mono text-[10px] text-purple-300/70">{channel}</span>
      </div>
      {joinFailure && (
        <p className="mt-2 rounded bg-red-950/60 px-2 py-1.5 text-[11px] text-red-200">
          {joinFailure}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-purple-200/80">
        <span className="rounded bg-purple-900/50 px-1.5 py-0.5">
          Customer: {customerInChannel ? 'connected' : 'not detected'}
        </span>
        <span className="rounded bg-purple-900/50 px-1.5 py-0.5">
          AI agent: {aiStillInChannel ? 'leaving…' : 'left the channel'}
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" className="border-purple-700" onClick={() => void toggleMic()}>
          {micOn ? <Mic className="mr-1.5 h-3.5 w-3.5" /> : <MicOff className="mr-1.5 h-3.5 w-3.5" />}
          {micOn ? 'Mute' : 'Unmute'}
        </Button>
        <Button size="sm" variant="destructive" onClick={onLeave}>
          <PhoneOff className="mr-1.5 h-3.5 w-3.5" /> Leave call
        </Button>
      </div>
      {/* Play remote audio (customer + AI while it says goodbye). */}
      {remoteUsers.map((user) => (
        <RemoteUser key={user.uid} user={user} />
      ))}
    </div>
  );
}
