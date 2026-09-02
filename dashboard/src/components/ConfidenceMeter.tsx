"use client";

import React from "react";
import { ConfidenceBreakdown } from "@/types";
import { ShieldCheck, AlertTriangle, ShieldAlert, Cpu } from "lucide-react";

interface ConfidenceMeterProps {
  confidence?: ConfidenceBreakdown;
}

export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({ confidence }) => {
  const conf = confidence || {
    intent_confidence: 1.0,
    asr_confidence: 1.0,
    entity_confidence: 1.0,
    confirmation_score: 1.0,
    consistency_score: 1.0,
    overall_confidence: 1.0,
    confidence_level: "HIGH",
  };

  const percentage = Math.round(conf.overall_confidence * 100);

  const getLevelStyle = () => {
    if (conf.confidence_level === "HIGH") {
      return {
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
        bar: "from-emerald-500 to-teal-400",
        icon: ShieldCheck,
        action: "Safe to Continue",
      };
    } else if (conf.confidence_level === "MEDIUM") {
      return {
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        bar: "from-amber-500 to-yellow-400",
        icon: AlertTriangle,
        action: "Clarification Needed",
      };
    } else {
      return {
        color: "text-rose-400",
        bg: "bg-rose-500/10",
        border: "border-rose-500/30",
        bar: "from-rose-500 to-red-400",
        icon: ShieldAlert,
        action: "Escalate to Human",
      };
    }
  };

  const style = getLevelStyle();
  const IconComponent = style.icon;

  const factors = [
    { label: "Intent Confidence", weight: "30%", val: conf.intent_confidence },
    { label: "ASR Audio Clarity", weight: "25%", val: conf.asr_confidence },
    { label: "Entity Extraction", weight: "20%", val: conf.entity_confidence },
    { label: "Confirmation Status", weight: "15%", val: conf.confirmation_score },
    { label: "Dialogue Consistency", weight: "10%", val: conf.consistency_score },
  ];

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">5-Factor AI Confidence Engine</h3>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.color} border ${style.border}`}>
          <IconComponent className="w-3.5 h-3.5" />
          <span>{conf.confidence_level}</span>
        </div>
      </div>

      {/* Main Score Bar */}
      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <span className="text-xs text-slate-400">Application Level Confidence</span>
          <span className={`text-2xl font-bold font-mono ${style.color}`}>{percentage}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden p-0.5 border border-slate-700">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${style.bar} transition-all duration-500`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-400 flex items-center justify-between">
          <span>Thresholds: Low &lt; 55% | Med 55-79% | High &ge; 80%</span>
          <span className={`font-medium ${style.color}`}>{style.action}</span>
        </p>
      </div>

      {/* Factor Breakdown */}
      <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Weighted Breakdown</h4>
        <div className="space-y-2">
          {factors.map((f, i) => {
            const factorPct = Math.round(f.val * 100);
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">
                    {f.label} <span className="text-[10px] text-slate-500">({f.weight})</span>
                  </span>
                  <span className="font-mono text-slate-200">{factorPct}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      factorPct >= 80 ? "bg-emerald-400" : factorPct >= 55 ? "bg-amber-400" : "bg-rose-400"
                    }`}
                    style={{ width: `${factorPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
