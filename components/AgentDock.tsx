"use client";

import { useState } from "react";
import { MessageSquare, Minus, Phone, X } from "lucide-react";
import ClientChat from "@/components/ClientChat";
import VoiceAgentCall from "@/components/VoiceAgentCall";
import type { ClientSession } from "@/lib/session";

/**
 * The agent dock — chat or call with NexaVoice support without leaving the
 * shopping page.
 *
 * Everything below the header is the existing conversation stack (the chat
 * component, or the Agora voice call with its transcript, handoff banner and
 * human takeover), so once the customer is connected the flow continues exactly
 * as it did before.
 *
 * Two ways to put the dock away:
 *   - **Minimize** (−): the panel collapses to a floating pill while the chat or
 *     call keeps running underneath (the components stay mounted — the voice
 *     call stays connected, the chat conversation stays alive). Reopening the
 *     pill restores the same conversation and drops the cursor straight into
 *     the message box.
 *   - **Close** (✕): ends the conversation, which is what keeps the human agent
 *     dashboard free of abandoned sessions.
 */
export default function AgentDock({
  mode,
  client,
  onClose,
  onSwitch,
  onOrdersMayHaveChanged,
}: {
  mode: "chat" | "voice";
  client: ClientSession;
  onClose: () => void;
  onSwitch: (mode: "chat" | "voice") => void;
  onOrdersMayHaveChanged: () => void;
}) {
  const [minimized, setMinimized] = useState(false);

  return (
    <>
      {/* Click-away shade on small screens — minimizes (keeps the conversation running) */}
      {!minimized && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMinimized(true)}
        />
      )}

      {/* Minimized pill: the conversation is still live behind it */}
      {minimized && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-0.5 rounded-full border border-zinc-700 bg-zinc-900 py-1 pl-1.5 pr-1 shadow-2xl">
          <button
            onClick={() => setMinimized(false)}
            className="flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
            title={mode === "chat" ? "Open the chat" : "Open the call"}
            aria-label={mode === "chat" ? "Open the chat" : "Open the call"}
          >
            <span className="relative flex h-2 w-2" aria-hidden>
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  mode === "chat" ? "bg-blue-400" : "bg-green-400"
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  mode === "chat" ? "bg-blue-500" : "bg-green-500"
                }`}
              />
            </span>
            {mode === "chat" ? (
              <MessageSquare className="h-4 w-4 text-blue-400" />
            ) : (
              <Phone className="h-4 w-4 text-green-400" />
            )}
            <span className="max-w-[9.5rem] truncate">
              {mode === "chat" ? "Chat with Nexa" : "Call with Nexa"}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">live</span>
          </button>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            title="End and close"
            aria-label="End and close the conversation"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* The panel stays mounted while minimized so the chat/call keeps running. */}
      <aside
        className={`fixed bottom-0 right-0 z-50 flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:bottom-4 sm:right-4 sm:h-[640px] sm:w-[420px] sm:rounded-2xl ${
          minimized ? "invisible pointer-events-none opacity-0" : ""
        }`}
        aria-hidden={minimized}
      >
        <header className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">NexaVoice support</p>
            <p className="truncate text-[11px] text-zinc-500">
              {client.name} · {mode === "chat" ? "chat with Nexa" : "voice call with Nexa"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onSwitch("chat")}
              className={`rounded-md p-1.5 ${
                mode === "chat" ? "bg-blue-900/60 text-blue-200" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
              title="Chat"
              aria-label="Switch to chat"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
            <button
              onClick={() => onSwitch("voice")}
              className={`rounded-md p-1.5 ${
                mode === "voice"
                  ? "bg-green-900/60 text-green-200"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
              title="Voice call"
              aria-label="Switch to a voice call"
            >
              <Phone className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMinimized(true)}
              className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              title="Minimize — keep the conversation running"
              aria-label="Minimize the support panel"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              title="End and close"
              aria-label="Close the support panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="relative flex-1 overflow-hidden bg-black">
          {mode === "chat" ? (
            <ClientChat key="chat" active={!minimized} onOrdersMayHaveChanged={onOrdersMayHaveChanged} />
          ) : (
            <VoiceAgentCall
              key="voice"
              onCallEnded={() => {
                onOrdersMayHaveChanged();
                onClose();
              }}
            />
          )}
        </div>
      </aside>
    </>
  );
}
