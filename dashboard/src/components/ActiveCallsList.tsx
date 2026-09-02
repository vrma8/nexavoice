"use client";

import React from "react";
import { CallItem } from "@/types";
import { PhoneCall, AlertTriangle, UserCheck, Bot, Clock, ChevronRight } from "lucide-react";

interface ActiveCallsListProps {
  calls: CallItem[];
  selectedCallId?: string;
  onSelectCall: (call: CallItem) => void;
  onQuickSimulate: () => void;
}

export const ActiveCallsList: React.FC<ActiveCallsListProps> = ({
  calls,
  selectedCallId,
  onSelectCall,
  onQuickSimulate,
}) => {
  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">Active Helpline Calls</h3>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
          {calls.length} Active
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-2 max-h-[550px]">
        {calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 text-xs gap-3">
            <PhoneCall className="w-8 h-8 opacity-25 text-slate-400" />
            <p>No phone calls currently in progress.</p>
            <button
              onClick={onQuickSimulate}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-md shadow-cyan-600/20"
            >
              Start Simulated Call
            </button>
          </div>
        ) : (
          calls.map((call) => {
            const isSelected = selectedCallId === call.id;
            const isUrgent = call.status === "WAITING_FOR_HUMAN";
            const isHumanInCall = call.status === "HUMAN_IN_CALL";

            return (
              <div
                key={call.id}
                onClick={() => onSelectCall(call)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? "bg-cyan-950/40 border-cyan-500 shadow-md shadow-cyan-500/10"
                    : isUrgent
                    ? "bg-rose-950/20 border-rose-800/60 hover:bg-rose-950/30"
                    : "bg-slate-900/60 border-slate-800 hover:bg-slate-850"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isUrgent
                          ? "bg-rose-950 border border-rose-800 text-rose-400 animate-pulse"
                          : isHumanInCall
                          ? "bg-emerald-950 border border-emerald-800 text-emerald-400"
                          : "bg-cyan-950 border border-cyan-800 text-cyan-400"
                      }`}
                    >
                      {isUrgent ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : isHumanInCall ? (
                        <UserCheck className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100">{call.caller_number}</h4>
                      <p className="text-[11px] text-slate-400 font-mono">Channel: {call.agora_channel}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        isUrgent
                          ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                          : isHumanInCall
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                          : "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                      }`}
                    >
                      {call.status.replace("_", " ")}
                    </span>
                  </div>
                </div>

                {call.latest_intent && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Intent:</span>
                    <span className="text-slate-200 font-medium capitalize">{call.latest_intent.replace("_", " ")}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
