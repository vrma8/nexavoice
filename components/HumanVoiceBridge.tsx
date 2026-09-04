'use client';

import { useEffect, useRef, useState } from 'react';
import {
  RemoteUser,
  useJoin,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
} from 'agora-rtc-react';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';

export type HumanVoiceBridgeProps = {
  channel: string;
  token: string;
  uid: string;
  agentUid: string;
  customerUid?: string;
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

  const { isConnected } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      channel,
      token,
      uid: parseInt(uid, 10),
    },
    isReady,
  );
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
          {isConnected ? 'You are live in the customer call' : 'Joining the call…'}
        </span>
        <span className="ml-auto font-mono text-[10px] text-purple-300/70">{channel}</span>
      </div>
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
