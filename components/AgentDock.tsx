"use client";

import { MessageSquare, Phone, X } from "lucide-react";
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
 * as it did before. Closing the dock ends the conversation, which is what keeps
 * the human agent dashboard free of abandoned sessions.
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
  return (
    <>
      {/* Click-away shade on small screens */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />

      <aside className="fixed bottom-0 right-0 z-50 flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:bottom-4 sm:right-4 sm:h-[640px] sm:w-[420px] sm:rounded-2xl">
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
            <ClientChat key="chat" onOrdersMayHaveChanged={onOrdersMayHaveChanged} />
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
