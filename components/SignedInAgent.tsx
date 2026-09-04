"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Headset, LogOut } from "lucide-react";
import { clearAgentSession, getAgentSession, type AgentSession } from "@/lib/session";

/**
 * Shows the signed-in support agent's details (from the database record saved
 * at /login) in the dashboard header, with a sign-out action.
 */
export default function SignedInAgent() {
  const [agent, setAgent] = useState<AgentSession | null>(null);

  useEffect(() => {
    setAgent(getAgentSession());
  }, []);

  if (!agent) {
    return (
      <Link href="/login?role=agent" className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300">
        <Headset className="h-3.5 w-3.5" /> Sign in
      </Link>
    );
  }

  const signOut = () => {
    clearAgentSession();
    setAgent(null);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-xs text-zinc-300">
        <Headset className="h-3.5 w-3.5 text-purple-400" />
        <span className="font-medium">{agent.name}</span>
        <span className="text-zinc-600">· {agent.email}</span>
        {agent.title && agent.title !== "Support Agent" && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">{agent.title}</span>
        )}
      </div>
      <button
        onClick={signOut}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        aria-label="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" /> Sign out
      </button>
    </div>
  );
}
