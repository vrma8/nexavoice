"use client";

import React from "react";
import { HandoffSummary } from "@/types";
import { FileText, AlertCircle, CheckCircle2, XCircle, ArrowRight, Activity } from "lucide-react";

interface HandoffSummaryCardProps {
  summary?: HandoffSummary | null;
  callerNumber?: string;
  agoraChannel?: string;
}

export const HandoffSummaryCard: React.FC<HandoffSummaryCardProps> = ({
  summary,
  callerNumber,
  agoraChannel,
}) => {
  if (!summary) {
    return (
      <div className="glass-panel rounded-xl p-4 flex flex-col items-center justify-center h-48 text-center text-slate-500 text-xs">
        <FileText className="w-8 h-8 opacity-25 mb-2 text-slate-400" />
        <p>No escalation triggered yet.</p>
        <p className="text-[11px] text-slate-600 mt-0.5">AI is currently handling caller independently.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel-urgent rounded-xl p-5 flex flex-col gap-4">
      {/* Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-400 animate-pulse" />
          <h3 className="font-semibold text-sm text-slate-100">Live AI Handoff Context</h3>
        </div>
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 uppercase tracking-wide">
          {summary.reason_for_escalation}
        </span>
      </div>

      {/* AI Summary Box */}
      <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800 space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">AI Context Summary</span>
        <p className="text-xs text-slate-200 leading-relaxed font-sans">{summary.summary}</p>
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Caller Name</span>
          <p className="font-medium text-slate-200 mt-0.5">{summary.caller_name || "Unspecified / Inferred"}</p>
        </div>
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Phone Number</span>
          <p className="font-medium text-slate-200 mt-0.5">{summary.phone || callerNumber || "+919876543210"}</p>
        </div>
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Primary Language</span>
          <p className="font-medium text-slate-200 mt-0.5">{summary.language}</p>
        </div>
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Reference ID</span>
          <p className="font-medium text-cyan-300 font-mono mt-0.5">{summary.reference_id || "None / Incomplete"}</p>
        </div>
      </div>

      {/* Checklists: Collected vs Missing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
        {/* Collected */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Verified Information
          </span>
          {summary.information_collected.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">None verified yet</p>
          ) : (
            <ul className="space-y-1">
              {summary.information_collected.map((item, i) => (
                <li key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Missing */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />
            Missing / Unconfirmed
          </span>
          {summary.missing_information.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">All required data collected</p>
          ) : (
            <ul className="space-y-1">
              {summary.missing_information.map((item, i) => (
                <li key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
