"use client";

import React, { useState, useEffect } from "react";
import { CallItem, MessageItem, ConfidenceBreakdown, HandoffSummary } from "@/types";
import { LiveTranscript } from "./LiveTranscript";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { HandoffSummaryCard } from "./HandoffSummaryCard";
import { AgoraAudioBridge } from "./AgoraAudioBridge";
import { Phone, CheckCircle, Clock, ShieldAlert, Check, RefreshCw } from "lucide-react";

interface CallDetailViewProps {
  call: CallItem;
  messages: MessageItem[];
  confidence?: ConfidenceBreakdown;
  handoffSummary?: HandoffSummary | null;
  onRefresh: () => void;
  onHumanTakeover: (callId: string) => Promise<void>;
  onEndCall: (callId: string) => Promise<void>;
}

export const CallDetailView: React.FC<CallDetailViewProps> = ({
  call,
  messages,
  confidence,
  handoffSummary,
  onRefresh,
  onHumanTakeover,
  onEndCall,
}) => {
  const isHumanJoined = call.status === "HUMAN_IN_CALL";
  const isWaitingHuman = call.status === "WAITING_FOR_HUMAN";

  const getStatusBadge = () => {
    switch (call.status) {
      case "WAITING_FOR_HUMAN":
        return { label: "Waiting for Human", bg: "bg-rose-500/20 text-rose-400 border-rose-500/40" };
      case "HUMAN_IN_CALL":
        return { label: "Human in Call", bg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
      case "AI_HANDLING":
        return { label: "AI Handling", bg: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" };
      default:
        return { label: call.status, bg: "bg-slate-800 text-slate-300 border-slate-700" };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="flex flex-col gap-4">
      {/* Top Banner for Active Call */}
      <div className={`rounded-xl p-4 border flex items-center justify-between transition-all ${
        isWaitingHuman ? "glass-panel-urgent" : "glass-panel"
      }`}>
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center">
            <Phone className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-slate-100">{call.caller_number}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge.bg}`}>
                {statusBadge.label}
              </span>
              {call.latest_intent && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  {call.latest_intent.replace("_", " ")}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-3">
              <span>Call ID: <span className="font-mono text-slate-300">{call.id.slice(0, 8)}...</span></span>
              <span>Agora: <span className="font-mono text-cyan-400">{call.agora_channel}</span></span>
            </p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Live Transcript & Voice Bridge (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <LiveTranscript messages={messages} isAiActive={!isHumanJoined} />
          <AgoraAudioBridge
            callId={call.id}
            agoraChannel={call.agora_channel}
            isHumanJoined={isHumanJoined}
            onJoinCall={() => onHumanTakeover(call.id)}
            onEndCall={() => onEndCall(call.id)}
          />
        </div>

        {/* Right Column: AI Handoff Summary & Confidence Engine (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <HandoffSummaryCard
            summary={handoffSummary}
            callerNumber={call.caller_number}
            agoraChannel={call.agora_channel}
          />
          <ConfidenceMeter confidence={confidence} />
        </div>
      </div>
    </div>
  );
};
