"use client";

import React from "react";
import { BarChart3, TrendingUp, PhoneCall, AlertTriangle, ShieldCheck, Clock, CheckCircle } from "lucide-react";

export const AnalyticsView: React.FC = () => {
  const stats = [
    { title: "Total Calls Processed", val: "148", change: "+12% today", icon: PhoneCall, color: "text-cyan-400" },
    { title: "Average AI Confidence", val: "88.4%", change: "+3.2%", icon: ShieldCheck, color: "text-emerald-400" },
    { title: "Escalation Rate", val: "14.2%", change: "-2.1%", icon: AlertTriangle, color: "text-amber-400" },
    { title: "Avg Resolution Latency", val: "1.2s", change: "Fast TTS/ASR", icon: Clock, color: "text-indigo-400" },
  ];

  const languages = [
    { name: "Hindi (हिंदी)", pct: 45, color: "bg-cyan-500" },
    { name: "Hinglish (Code-Switching)", pct: 35, color: "bg-amber-500" },
    { name: "English", pct: 20, color: "bg-emerald-500" },
  ];

  const intents = [
    { name: "Application Status Inquiries", count: "72 calls", pct: 48 },
    { name: "Complaint & Grievance Registration", count: "34 calls", pct: 23 },
    { name: "General Public Scheme Information", count: "28 calls", pct: 19 },
    { name: "Human Agent Direct Escalations", count: "14 calls", pct: 10 },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{s.title}</span>
                <div className={`p-2 rounded-lg bg-slate-900 ${s.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-bold font-mono text-slate-100">{s.val}</h3>
                <span className="text-[11px] text-emerald-400 font-medium">{s.change}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2-Column Analytics Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Language Distribution */}
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Language & Code-Switching Distribution
          </h3>

          <div className="space-y-3 pt-2">
            {languages.map((l, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{l.name}</span>
                  <span className="font-mono text-slate-200">{l.pct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full ${l.color}`} style={{ width: `${l.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-800">
            NexaVoice dynamically adapts to mid-conversation language switching without asking the caller to repeat.
          </p>
        </div>

        {/* Top Citizen Intents */}
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            Top Citizen Service Intents
          </h3>

          <div className="space-y-3 pt-2">
            {intents.map((it, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{it.name}</span>
                  <span className="font-mono text-slate-400">{it.count}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${it.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-800">
            92% of application status queries are resolved by AI in under 3 turns with zero human overhead.
          </p>
        </div>
      </div>
    </div>
  );
};
