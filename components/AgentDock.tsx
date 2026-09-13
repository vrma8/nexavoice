"use client";

import { useState } from "react";
import { MessageSquare, Mic, Minus, Phone, X } from "lucide-react";
import ClientChat from "@/components/ClientChat";
import VoiceAgentCall from "@/components/VoiceAgentCall";
import type { ClientSession } from "@/lib/session";

export default function AgentDock({
  mode,
  client,
  onClose,
  onSwitch,
  onOrdersMayHaveChanged,
  onConversationSnapshot,
}: {
  mode: "chat" | "voice";
  client: ClientSession;
  onClose: () => void;
  onSwitch: (mode: "chat" | "voice") => void;
  onOrdersMayHaveChanged: () => void;
  onConversationSnapshot?: (conversation: unknown) => void;
}) {
  const [minimized, setMinimized] = useState(false);

  return (
    <>
      {/* Click-away shade on small screens — minimizes (keeps the conversation running) */}
      {!minimized && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMinimized(true)}
        />
      )}

      {/* Minimized pill: the conversation is still live behind it */}
      {minimized && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-0.5 rounded-full border border-[hsl(222_25%_18%)] bg-[hsl(222_35%_9%)] py-1 pl-1.5 pr-1 shadow-2xl">
          <button
            onClick={() => setMinimized(false)}
            className="flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[hsl(222_35%_13%)]"
            title={mode === "chat" ? "Open the chat" : "Open the call"}
            aria-label={mode === "chat" ? "Open the chat" : "Open the call"}
          >
            <span className="relative flex h-2 w-2" aria-hidden>
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  mode === "chat" ? "bg-[hsl(191_100%_55%)]" : "bg-[hsl(142_70%_55%)]"
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  mode === "chat" ? "bg-[hsl(191_100%_55%)]" : "bg-[hsl(142_70%_55%)]"
                }`}
              />
            </span>
            {mode === "chat" ? (
              <MessageSquare className="h-4 w-4 text-[hsl(191_100%_55%)]" />
            ) : (
              <Phone className="h-4 w-4 text-[hsl(142_70%_55%)]" />
            )}
            <span className="max-w-[9.5rem] truncate">
              {mode === "chat" ? "Chat with Nexa" : "Call with Nexa"}
            </span>
            <span className="text-[10px] tracking-wide text-[hsl(220_10%_40%)] uppercase">live</span>
          </button>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[hsl(220_10%_40%)] transition-colors hover:bg-[hsl(222_35%_13%)] hover:text-white"
            title="End and close"
            aria-label="End and close the conversation"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* The panel stays mounted while minimized so the chat/call keeps running. */}
      <aside
        className={`fixed bottom-0 right-0 z-50 flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[hsl(222_25%_18%)] bg-[hsl(222_40%_6%)] shadow-2xl transition-all sm:bottom-4 sm:right-4 sm:h-[600px] sm:w-[420px] sm:rounded-2xl ${
          minimized ? "invisible pointer-events-none opacity-0" : ""
        }`}
        aria-hidden={minimized}
      >
        <header className="flex items-center gap-3 border-b border-[hsl(222_25%_15%)] bg-[hsl(222_40%_7%)] px-4 py-3">
          <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.1)]">
            <Mic className="h-4 w-4 text-[hsl(191_100%_55%)]" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[hsl(191_100%_55%)] animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">NexaVoice support</p>
            <p className="text-[11px] text-[hsl(220_10%_40%)]">
              {client.name} · {mode === "chat" ? "chat with Nexa" : "voice call with Nexa"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onSwitch("chat")}
              className={`rounded-lg p-1.5 transition-colors ${
                mode === "chat"
                  ? "bg-[hsl(191_100%_50%_/_0.12)] text-[hsl(191_100%_55%)]"
                  : "text-[hsl(220_10%_40%)] hover:bg-[hsl(222_35%_12%)] hover:text-white"
              }`}
              title="Chat"
              aria-label="Switch to chat"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
            <button
              onClick={() => onSwitch("voice")}
              className={`rounded-lg p-1.5 transition-colors ${
                mode === "voice"
                  ? "bg-[hsl(142_70%_40%_/_0.12)] text-[hsl(142_70%_55%)]"
                  : "text-[hsl(220_10%_40%)] hover:bg-[hsl(222_35%_12%)] hover:text-white"
              }`}
              title="Voice call"
              aria-label="Switch to a voice call"
            >
              <Phone className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMinimized(true)}
              className="rounded-lg p-1.5 text-[hsl(220_10%_40%)] transition-colors hover:bg-[hsl(222_35%_12%)] hover:text-white"
              title="Minimize — keep the conversation running"
              aria-label="Minimize the support panel"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[hsl(220_10%_40%)] transition-colors hover:bg-[hsl(222_35%_12%)] hover:text-white"
              title="End and close"
              aria-label="Close the support panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="relative flex-1 overflow-hidden bg-[hsl(223_47%_4%)]">
          {mode === "chat" ? (
            <ClientChat
              key="chat"
              active={!minimized}
              onOrdersMayHaveChanged={onOrdersMayHaveChanged}
              onConversationSnapshot={onConversationSnapshot as ((c: import('@/lib/support/types').Conversation | null) => void) | undefined}
            />
          ) : (
            <VoiceAgentCall
              key="voice"
              onCallEnded={() => {
                onOrdersMayHaveChanged();
                onClose();
              }}
              onConversationSnapshot={onConversationSnapshot as ((c: import('@/lib/support/types').Conversation | null) => void) | undefined}
            />
          )}
        </div>
      </aside>
    </>
  );
}
