"use client";

import React, { useState } from "react";
import { PhoneCall, PhoneOff, Mic, MicOff, Volume2, VolumeX, Bot, UserCheck, Radio } from "lucide-react";

interface AgoraAudioBridgeProps {
  callId: string;
  agoraChannel: string;
  isHumanJoined: boolean;
  onJoinCall: () => Promise<void>;
  onEndCall: () => Promise<void>;
}

export const AgoraAudioBridge: React.FC<AgoraAudioBridgeProps> = ({
  callId,
  agoraChannel,
  isHumanJoined,
  onJoinCall,
  onEndCall,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isAiMuted, setIsAiMuted] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleJoin = async () => {
    setIsConnecting(true);
    try {
      await onJoinCall();
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">Agora RTC Real-Time Voice Bridge</h3>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          <span>Channel:</span>
          <span className="text-cyan-400 font-semibold">{agoraChannel || "channel_01"}</span>
        </div>
      </div>

      {/* Voice Status & Waveform Visualizer */}
      <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-cyan-950/80 border border-cyan-800 flex items-center justify-center">
            {isHumanJoined ? (
              <UserCheck className="w-5 h-5 text-emerald-400 animate-pulse" />
            ) : (
              <Bot className="w-5 h-5 text-cyan-400" />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">
              {isHumanJoined ? "Human Voice Officer Active" : "AI Voice Agent in Control"}
            </p>
            <p className="text-[11px] text-slate-400">
              {isHumanJoined ? "AI agent muted. Human speech streaming live." : "Low-latency telephony audio streaming"}
            </p>
          </div>
        </div>

        {/* Dynamic Waveform Visualizer */}
        <div className="flex items-center gap-1 h-8 px-3">
          {[40, 75, 95, 30, 85, 60, 100, 45, 90, 35].map((h, i) => (
            <span
              key={i}
              className={`w-1 rounded-full transition-all duration-300 ${
                isHumanJoined ? "bg-emerald-400" : "bg-cyan-400"
              }`}
              style={{
                height: `${h}%`,
                animation: `bounceBar ${0.8 + (i % 5) * 0.2}s ease-in-out infinite alternate`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2 pt-1">
        {!isHumanJoined ? (
          <button
            onClick={handleJoin}
            disabled={isConnecting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-500/20 active:scale-98"
          >
            <PhoneCall className="w-4 h-4" />
            {isConnecting ? "Bridging Audio..." : "JOIN CALL (Human Takeover)"}
          </button>
        ) : (
          <>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                isMuted
                  ? "bg-rose-500/20 border-rose-500/50 text-rose-400"
                  : "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
              }`}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {isMuted ? "Unmute Mic" : "Mute Mic"}
            </button>

            <button
              onClick={() => setIsAiMuted(!isAiMuted)}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                isAiMuted
                  ? "bg-slate-800 border-slate-700 text-slate-400"
                  : "bg-cyan-500/20 border-cyan-500/50 text-cyan-400"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              {isAiMuted ? "AI Muted" : "AI Active"}
            </button>

            <button
              onClick={onEndCall}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs transition-all shadow-md shadow-rose-600/20"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              End Call
            </button>
          </>
        )}
      </div>
    </div>
  );
};
