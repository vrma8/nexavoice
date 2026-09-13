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
import { Loader2, Mic, MicOff, PhoneOff, RefreshCw, Users } from 'lucide-react';

export type HumanVoiceBridgeProps = {
  channel: string;
  token: string;
  uid: string;
  agentUid: string;
  customerUid?: string;
  appId?: string | null;
  onJoined: () => void;
  onLeave: () => void;
};

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
  const [isReady, setIsReady] = useState(false);
  const [joinEnabled, setJoinEnabled] = useState(true);
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
    isReady && joinEnabled && Boolean(appId),
  );

  const joinFailure = !appId
    ? MISSING_APP_ID_MESSAGE
    : joinError
      ? (joinError.message ?? 'The RTC join failed. Check the App ID, token and channel.')
      : null;

  const retryJoin = () => {
    setJoinEnabled(false);
    setTimeout(() => setJoinEnabled(true), 150);
  };

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady && joinEnabled);
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
        ) : joinFailure ? (
          <span className="h-2 w-2 rounded-full bg-red-400" />
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
        <div className="mt-2 space-y-2">
          <p className="rounded bg-red-950/60 px-2 py-1.5 text-[11px] text-red-200">
            {joinFailure}
          </p>
          <Button size="sm" variant="outline" className="border-purple-700" onClick={retryJoin}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry join
          </Button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-purple-200/80">
        <span className="inline-flex items-center gap-1 rounded bg-purple-900/50 px-1.5 py-0.5">
          <Users className="h-3 w-3" />
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
