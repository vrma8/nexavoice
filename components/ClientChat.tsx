"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, Headset, Send, UserIcon } from "lucide-react";
import {
  createConversation,
  endConversation,
  getConversation,
  requestEscalation,
  sendHeartbeat,
  sendMessage,
} from "@/lib/api";
import type { Conversation, ConversationMessage, SupportCase } from "@/lib/support/types";
import { buildChatGreeting } from "@/lib/agent-prompt";
import { getClientSession } from "@/lib/session";

type Message = {
  id: string;
  role: "user" | "ai" | "human_agent" | "system";
  content: string;
};

const POLL_MS = 2500;

export default function ClientChat({
  onOrdersMayHaveChanged,
  active = true,
  onConversationSnapshot,
}: {
  onOrdersMayHaveChanged?: () => void;
  active?: boolean;
  onConversationSnapshot?: (conversation: Conversation | null) => void;
} = {}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [supportCase, setSupportCase] = useState<SupportCase | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => {
    const session = getClientSession();
    return [
      {
        id: "greeting",
        role: "ai",
        content: buildChatGreeting(session?.preferredLanguage, session?.name),
      },
    ];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const lastSyncRef = useRef(0);

  const canType =
    Boolean(conversation) && conversation?.state !== "RESOLVED" && conversation?.state !== "CLOSED";
  useEffect(() => {
    if (!active || !canType) return;
    const focus = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(focus);
  }, [active, canType]);

  useEffect(() => {
    let cancelled = false;
    const session = getClientSession();
    createConversation("CHAT", {
      clientId: session?.id,
      customerName: session?.name,
    })
      .then((c) => {
        if (!cancelled) setConversation(c);
      })
      .catch((err) => {
        console.error("Failed to create conversation", err);
        if (!cancelled) setError("Could not start the chat. Please refresh.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const conversationId = conversation?.id;
  useEffect(() => {
    if (!conversationId) return;
    void sendHeartbeat(conversationId);
    const beat = setInterval(() => void sendHeartbeat(conversationId), 8000);
    const leave = () => endConversation(conversationId, true);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(beat);
      window.removeEventListener("pagehide", leave);
      endConversation(conversationId);
    };
  }, [conversationId]);

  const mergeMessages = useCallback((incoming: ConversationMessage[]) => {
    const fresh = incoming.filter((m) => !seenIds.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => seenIds.current.add(m.id));
    setMessages((prev) => [
      ...prev,
      ...fresh.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    ]);
  }, []);

  useEffect(() => {
    if (!conversation) return;
    const state = conversation.state;
    if (state === "CLOSED" || state === "RESOLVED") return;
    const tick = async () => {
      try {
        const snapshot = await getConversation(conversation.id, lastSyncRef.current);
        lastSyncRef.current = snapshot.now - 1000;
        mergeMessages(snapshot.messages.filter((m) => m.role === "human_agent" || m.role === "system"));
        setConversation(snapshot.conversation);
        setSupportCase(snapshot.case);
        onConversationSnapshot?.(snapshot.conversation);
      } catch {
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [conversation?.id, conversation?.state, mergeMessages, conversation, onConversationSnapshot]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || isLoading || !conversation) return;
    setInput("");
    setError(null);
    const localId = `local-${Date.now()}`;
    setMessages((prev) => [...prev, { id: localId, role: "user", content }]);
    setIsLoading(true);
    try {
      const result = await sendMessage(conversation.id, content);
      seenIds.current.add(result.message.id);
      if (result.reply) {
        seenIds.current.add(result.reply.id);
        setMessages((prev) => [...prev, { id: result.reply!.id, role: "ai", content: result.reply!.content }]);
      }
      setConversation(result.conversation);
      setSupportCase(result.case);
      onOrdersMayHaveChanged?.();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("Error sending message", detail);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "ai",
          content: `Technical problem: ${detail}. Dobara try karein — ya page refresh karke naye sire se shuru karein.`,
        },
      ]);
      setError(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEscalation = async () => {
    if (!conversation || conversation.state !== "AI_HANDLING") return;
    setIsLoading(true);
    try {
      const result = await requestEscalation(conversation.id, "Customer pressed 'Talk to a human'");
      setConversation(result.conversation);
      setSupportCase(result.case);
      setMessages((prev) => [
        ...prev,
        {
          id: `esc-${Date.now()}`,
          role: "ai",
          content: `Zaroor! Maine case ${result.caseId} bana diya hai. Ek human support agent thodi der mein isi chat mein aapse baat karenge.`,
        },
      ]);
    } catch (err) {
      console.error("Error escalating", err);
      setError("Could not reach a human agent right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const state = conversation?.state ?? "AI_HANDLING";
  const humanName = conversation?.humanAgentName;
  const banner =
    state === "WAITING_FOR_HUMAN"
      ? {
          tone: "border-yellow-500/25 bg-yellow-500/10 text-yellow-300",
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: `Case ${supportCase?.id ?? ""} created — waiting for a support agent…`,
        }
      : state === "HUMAN_HANDLING"
        ? {
            tone: "border-purple-500/25 bg-purple-500/10 text-purple-200",
            icon: <Headset className="w-4 h-4" />,
            text: `You are now chatting with ${humanName ?? "a human support agent"}.`,
          }
        : state === "RESOLVED" || state === "CLOSED"
          ? {
              tone: "border-[hsl(222_25%_20%)] bg-[hsl(222_35%_10%)] text-[hsl(220_15%_75%)]",
              icon: <UserIcon className="w-4 h-4" />,
              text: "This conversation has been resolved. Thank you!",
            }
          : null;

  return (
    <div className="flex flex-col h-full absolute inset-0">
      {/* Status strip */}
      <div className="flex items-center justify-between border-b border-[hsl(222_25%_15%)] bg-[hsl(222_40%_7%)] px-4 py-2 text-xs">
        <span className="flex items-center gap-2 text-[hsl(220_10%_50%)]">
          {state === "HUMAN_HANDLING" ? (
            <>
              <Headset className="w-3.5 h-3.5 text-[hsl(260_70%_70%)]" /> Human agent
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5 text-[hsl(191_100%_55%)]" /> AI Online
            </>
          )}
        </span>
        <span className="font-mono text-[hsl(220_10%_35%)]">{conversation?.id ?? "connecting…"}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) =>
          msg.role === "system" ? (
            <div key={msg.id} className="text-center text-xs text-[hsl(220_10%_45%)]">
              {msg.content}
            </div>
          ) : (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role !== "user" && (
                <div
                  className={`mr-2 mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    msg.role === "human_agent"
                      ? "border border-[hsl(260_60%_60%_/_0.25)] bg-[hsl(260_60%_60%_/_0.15)] text-[hsl(260_70%_75%)]"
                      : "border border-[hsl(191_100%_50%_/_0.2)] bg-[hsl(191_100%_50%_/_0.12)] text-[hsl(191_100%_55%)]"
                  }`}
                  title={msg.role === "human_agent" ? humanName ?? "Human agent" : "Nexa (AI)"}
                >
                  {msg.role === "human_agent" ? <Headset className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </div>
              )}
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === "user"
                    ? "border border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.12)] text-white rounded-tr-sm"
                    : msg.role === "human_agent"
                      ? "border border-[hsl(260_60%_60%_/_0.2)] bg-[hsl(260_60%_60%_/_0.1)] text-[hsl(260_40%_85%)] rounded-tl-sm"
                      : "border border-[hsl(222_25%_16%)] bg-[hsl(222_35%_10%)] text-[hsl(220_15%_85%)] rounded-tl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ),
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="mr-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[hsl(191_100%_50%_/_0.2)] bg-[hsl(191_100%_50%_/_0.12)] text-[hsl(191_100%_55%)]">
              <Mic className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-[hsl(222_25%_16%)] bg-[hsl(222_35%_10%)] px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-[hsl(220_10%_45%)] rounded-full animate-bounce [animation-delay:0ms]"></span>
                <span className="w-2 h-2 bg-[hsl(220_10%_45%)] rounded-full animate-bounce [animation-delay:150ms]"></span>
                <span className="w-2 h-2 bg-[hsl(220_10%_45%)] rounded-full animate-bounce [animation-delay:300ms]"></span>
              </div>
            </div>
          </div>
        )}

        {banner && (
          <div className="flex justify-center my-2">
            <div className={`border rounded-lg px-4 py-2 text-sm flex items-center gap-2 ${banner.tone}`}>
              {banner.icon}
              {banner.text}
            </div>
          </div>
        )}

        {error && <div className="text-center text-xs text-red-400">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-[hsl(222_25%_13%)] bg-[hsl(222_40%_6%)] p-4">
        {state === "AI_HANDLING" && (
          <div className="mb-3 flex justify-center">
            <Button
              variant="ghost"
              className="h-auto py-1 text-xs text-[hsl(220_10%_45%)] hover:text-[hsl(220_15%_75%)]"
              onClick={handleEscalation}
              disabled={!conversation || isLoading}
            >
              <UserIcon className="w-3.5 h-3.5 mr-1.5" />
              Talk to a human agent
            </Button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            type="text"
            className="flex-1 rounded-xl border border-[hsl(222_25%_15%)] bg-[hsl(223_47%_4%)] px-3 py-2 text-sm text-white transition-colors placeholder:text-[hsl(220_10%_35%)] focus:border-[hsl(191_100%_50%_/_0.4)] focus:outline-none disabled:opacity-50"
            placeholder={
              state === "RESOLVED" || state === "CLOSED"
                ? "Conversation closed"
                : state === "WAITING_FOR_HUMAN"
                  ? "Waiting for an agent… you can keep typing"
                  : "Type your message… (Hindi / English / Hinglish)"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={isLoading || !conversation || state === "RESOLVED" || state === "CLOSED"}
          />
          <Button
            className="h-10 w-10 flex-shrink-0 rounded-full border-none bg-[hsl(191_100%_50%)] p-0 text-[hsl(223_47%_4%)] hover:bg-[hsl(191_100%_45%)] disabled:opacity-50"
            onClick={handleSend}
            disabled={isLoading || !input.trim() || !conversation || state === "RESOLVED" || state === "CLOSED"}
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-[hsl(220_10%_35%)]">
          Nexa can add or remove products on an order that is still “Placed”.
        </p>
      </div>
    </div>
  );
}
