"use client";

import React from "react";
import { PhoneCall, Shield, Activity, Users, Radio, BarChart3, Sliders, CheckCircle2 } from "lucide-react";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  wsConnected: boolean;
  activeCallsCount: number;
  escalatedCount: number;
  agentStatus: "AVAILABLE" | "BUSY" | "OFFLINE";
  setAgentStatus: (status: "AVAILABLE" | "BUSY" | "OFFLINE") => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  wsConnected,
  activeCallsCount,
  escalatedCount,
  agentStatus,
  setAgentStatus,
}) => {
  return (
    <header className="border-b border-surface-border bg-surface/90 backdrop-blur-md sticky top-0 z-50 px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo & Tag */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-300 bg-clip-text text-transparent">
                NexaVoice
              </h1>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                Agent Console v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">Multilingual Real-Time Assistance Line</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-surface-card/80 p-1 rounded-xl border border-surface-border">
          <button
            onClick={() => setActiveTab("console")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === "console"
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            Live Calls & Console
            {activeCallsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-700">
                {activeCallsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("simulator")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === "simulator"
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            Caller Phone Simulator
          </button>

          <button
            onClick={() => setActiveTab("cases")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === "cases"
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Cases & Handoffs
            {escalatedCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-950 text-rose-300 border border-rose-700">
                {escalatedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === "analytics"
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Analytics
          </button>
        </nav>

        {/* Status Indicators & Human Agent Toggle */}
        <div className="flex items-center gap-4">
          {/* WebSocket Status */}
          <div className="flex items-center gap-2 text-xs px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" : "bg-rose-500"
              }`}
            />
            <span className="text-slate-300">{wsConnected ? "Live Sync" : "Connecting..."}</span>
          </div>

          {/* Agent Status Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setAgentStatus("AVAILABLE")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                agentStatus === "AVAILABLE"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Available
            </button>
            <button
              onClick={() => setAgentStatus("BUSY")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                agentStatus === "BUSY"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Busy
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
