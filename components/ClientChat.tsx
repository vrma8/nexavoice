"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, UserIcon, Loader2, Bot, Headset } from "lucide-react";
import {
  createConversation,
  getConversation,
  requestEscalation,
  sendMessage,
} from "@/lib/api";
import type { Conversation, ConversationMessage, SupportCase } from "@/lib/support/types";
import { CHAT_GREETING } from "@/lib/agent-prompt";
import { getClientSession } from "@/lib/session";

type Message = {
  id: string;
  role: "user" | "ai" | "human_agent" | "system";
  content: string;
};

const GREETING: Message = { id: "greeting", role: "ai", content: CHAT_GREETING };

const POLL_MS = 2500;

export default function ClientChat() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [supportCase, setSupportCase] = useState<SupportCase | null>(null);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const lastSyncRef = useRef(0);

  // Create the backend conversation once, attaching the signed-in client's details.
  useEffect(() => {
    let cancelled = false;
    const session = getClientSession();
    createConversation("CHAT", {
      customerName: session?.name,
      customerPhone: session?.phone,
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

  const mergeMessages = useCallback((incoming: ConversationMessage[]) => {
    const fresh = incoming.filter((m) => !seenIds.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => seenIds.current.add(m.id));
    setMessages((prev) => [
      ...prev,
      ...fresh.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    ]);
  }, []);

  // Poll for human agent messages / state changes once escalated (or always, cheaply).
  useEffect(() => {
    if (!conversation) return;
    const state = conversation.state;
    if (state === "CLOSED" || state === "RESOLVED") return;
    const tick = async () => {
      try {
        const snapshot = await getConversation(conversation.id, lastSyncRef.current);
        lastSyncRef.current = snapshot.now - 1000;
        // Only pull messages we did not author locally (human agent / system).
        mergeMessages(snapshot.messages.filter((m) => m.role === "human_agent" || m.role === "system"));
        setConversation(snapshot.conversation);
        setSupportCase(snapshot.case);
      } catch {
        // transient
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [conversation?.id, conversation?.state, mergeMessages, conversation]);

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
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("Error sending message", detail);
      // The cause matters: "Conversation not found" means the backend lost the
      // session (state is not shared across serverless instances), which no
      // amount of retrying fixes.
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
          tone: "bg-yellow-900/30 border-yellow-700 text-yellow-300",
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: `Case ${supportCase?.id ?? ""} created — waiting for a support agent…`,
        }
      : state === "HUMAN_HANDLING"
        ? {
            tone: "bg-purple-900/30 border-purple-700 text-purple-200",
            icon: <Headset className="w-4 h-4" />,
            text: `You are now chatting with ${humanName ?? "a human support agent"}.`,
          }
        : state === "RESOLVED" || state === "CLOSED"
          ? {
              tone: "bg-zinc-800 border-zinc-700 text-zinc-300",
              icon: <UserIcon className="w-4 h-4" />,
              text: "This conversation has been resolved. Thank you!",
            }
          : null;

  return (
    <div className="flex flex-col h-full absolute inset-0">
      {/* Status strip */}
      <div className="flex items-center justify-between px-4 py-2 text-xs border-b border-zinc-800 bg-zinc-900/60">
        <span className="flex items-center gap-2 text-zinc-400">
          {state === "HUMAN_HANDLING" ? (
            <>
              <Headset className="w-3.5 h-3.5 text-purple-400" /> Human agent
            </>
          ) : (
            <>
              <Bot className="w-3.5 h-3.5 text-blue-400" /> AI Online
            </>
          )}
        </span>
        <span className="text-zinc-600 font-mono">{conversation?.id ?? "connecting…"}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) =>
          msg.role === "system" ? (
            <div key={msg.id} className="text-center text-xs text-zinc-500">
              {msg.content}
            </div>
          ) : (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role !== "user" && (
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center mr-2 flex-shrink-0 mt-1 text-xs font-bold ${
                    msg.role === "human_agent" ? "bg-purple-700" : "bg-blue-600"
                  }`}
                  title={msg.role === "human_agent" ? humanName ?? "Human agent" : "Nexa (AI)"}
                >
                  {msg.role === "human_agent" ? "H" : "AI"}
                </div>
              )}
              <div
                className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : msg.role === "human_agent"
                      ? "bg-purple-700 text-white rounded-tl-sm"
                      : "bg-zinc-800 text-zinc-100 rounded-tl-sm border border-zinc-700"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ),
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center mr-2 flex-shrink-0 text-xs font-bold">
              AI
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0ms]"></span>
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:150ms]"></span>
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:300ms]"></span>
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
      <div className="p-4 bg-zinc-900 border-t border-zinc-800">
        {state === "AI_HANDLING" && (
          <div className="flex justify-center mb-3">
            <Button
              variant="ghost"
              className="text-xs text-zinc-500 hover:text-zinc-300 h-auto py-1"
              onClick={handleEscalation}
              disabled={!conversation || isLoading}
            >
              <UserIcon className="w-3.5 h-3.5 mr-1.5" />
              Talk to a human agent
            </Button>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <input
            type="text"
            className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-2xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none placeholder:text-zinc-500 disabled:opacity-50"
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
            className="rounded-full w-10 h-10 p-0 flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            onClick={handleSend}
            disabled={isLoading || !input.trim() || !conversation || state === "RESOLVED" || state === "CLOSED"}
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-600">
          Demo account: mobile 9876543210 (Rahul) · 9123456780 (Priya) · 9988776655 (Amit)
        </p>
      </div>
    </div>
  );
}
