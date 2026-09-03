"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, UserIcon, Loader2 } from "lucide-react";
import { sendMessage, requestEscalation } from "@/lib/api";

type Message = {
  id: string;
  role: "user" | "ai" | "human_agent";
  content: string;
};

const INITIAL_MESSAGE: Message = {
  id: "0",
  role: "ai",
  content: "Namaste! Main NexaVoice AI assistant hoon. Aaj aapki kaise madad kar sakta hoon? (You can also write in English)",
};

export default function ClientChat() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [waitingForHuman, setWaitingForHuman] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendMessage(userMessage.content);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: response.content,
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error sending message", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "ai",
          content: "Kuch technical problem aa gayi. Thodi der baad dobara try karein.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEscalation = async () => {
    if (waitingForHuman) return;
    setWaitingForHuman(true);

    const escalationMsg: Message = {
      id: Date.now().toString(),
      role: "ai",
      content: "Zaroor! Main aapko ek human support agent se connect kar raha hoon. Please wait karein...",
    };
    setMessages((prev) => [...prev, escalationMsg]);

    try {
      const result = await requestEscalation("User requested human agent");
      setCaseId(result.caseId);
    } catch (error) {
      console.error("Error escalating", error);
      setWaitingForHuman(false);
    }
  };

  return (
    <div className="flex flex-col h-full absolute inset-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role !== "user" && (
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center mr-2 flex-shrink-0 mt-1 text-xs font-bold">
                {msg.role === "human_agent" ? "H" : "AI"}
              </div>
            )}
            <div
              className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
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
        ))}

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

        {waitingForHuman && (
          <div className="flex justify-center my-2">
            <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-400 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {caseId
                ? `Case ${caseId} created — waiting for a support agent...`
                : "Connecting to support agent..."}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-4 bg-zinc-900 border-t border-zinc-800">
        {!waitingForHuman && !escalated && (
          <div className="flex justify-center mb-3">
            <Button
              variant="ghost"
              className="text-xs text-zinc-500 hover:text-zinc-300 h-auto py-1"
              onClick={handleEscalation}
            >
              <UserIcon className="w-3.5 h-3.5 mr-1.5" />
              Talk to a human agent
            </Button>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <input
            type="text"
            className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-2xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none placeholder:text-zinc-500"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={isLoading}
          />
          <Button
            className="rounded-full w-10 h-10 p-0 flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
