"use client";

import React, { useEffect, useRef } from "react";
import { MessageItem } from "@/types";
import { MessageSquare, Bot, User, UserCheck, Languages, Clock } from "lucide-react";

interface LiveTranscriptProps {
  messages: MessageItem[];
  isAiActive?: boolean;
}

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({ messages, isAiActive = true }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">Real-Time Conversation Transcript</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-mono">{messages.length} messages</span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1 max-h-[460px]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs gap-2">
            <MessageSquare className="w-8 h-8 opacity-30 text-slate-400" />
            <p>Waiting for caller speech stream...</p>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isCaller = m.speaker === "CALLER";
            const isAI = m.speaker === "AI";
            const isHuman = m.speaker === "HUMAN";

            return (
              <div
                key={m.id || idx}
                className={`flex flex-col gap-1 rounded-xl p-3 border transition-all ${
                  isCaller
                    ? "bg-slate-900/80 border-slate-800 text-slate-100 ml-4"
                    : isAI
                    ? "bg-cyan-950/30 border-cyan-800/40 text-cyan-100 mr-4"
                    : "bg-emerald-950/30 border-emerald-800/40 text-emerald-100 mx-2"
                }`}
              >
                {/* Message Header */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 font-medium">
                    {isCaller && <User className="w-3.5 h-3.5 text-amber-400" />}
                    {isAI && <Bot className="w-3.5 h-3.5 text-cyan-400" />}
                    {isHuman && <UserCheck className="w-3.5 h-3.5 text-emerald-400" />}

                    <span
                      className={
                        isCaller ? "text-amber-400 font-semibold" : isAI ? "text-cyan-400 font-semibold" : "text-emerald-400 font-semibold"
                      }
                    >
                      {isCaller ? "Caller (Citizen)" : isAI ? "NexaVoice AI" : "Human Support Officer"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400 font-mono">
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-300">
                      <Languages className="w-2.5 h-2.5" />
                      {m.language}
                    </span>
                    <span className="text-[10px]">{formatTime(m.timestamp)}</span>
                  </div>
                </div>

                {/* Message Body */}
                <p className="text-xs leading-relaxed mt-0.5 whitespace-pre-wrap">{m.transcript}</p>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
