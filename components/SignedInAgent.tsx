"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { clearAgentSession, getAgentSession, type AgentSession } from "@/lib/session";

export default function SignedInAgent() {
  const [agent, setAgent] = useState<AgentSession | null>(null);

  useEffect(() => {
    setAgent(getAgentSession());
  }, []);

  if (!agent) {
    return (
      <Link
        href="/login?role=agent"
        className="text-xs text-[hsl(260_70%_70%)] transition-colors hover:text-[hsl(260_70%_80%)]"
      >
        Sign in
      </Link>
    );
  }

  const signOut = () => {
    clearAgentSession();
    setAgent(null);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[180px] truncate text-xs text-[hsl(220_10%_60%)] sm:block">{agent.name}</span>
      {agent.title && agent.title !== "Support Agent" && (
        <span className="hidden rounded bg-[hsl(260_60%_60%_/_0.1)] px-1.5 py-0.5 text-[10px] uppercase text-[hsl(260_70%_70%)] md:block">
          {agent.title}
        </span>
      )}
      <button
        onClick={signOut}
        className="text-[hsl(220_10%_40%)] transition-colors hover:text-red-400"
        aria-label="Sign out"
      >
        <LogOut className="h-3 w-3" />
      </button>
    </div>
  );
}
