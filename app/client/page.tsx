"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogOut, Phone, MessageSquare, UserRound } from "lucide-react";
import { clearClientSession, getClientSession, type ClientSession } from "@/lib/session";

export default function ClientLandingPage() {
  const [client, setClient] = useState<ClientSession | null>(null);

  useEffect(() => {
    setClient(getClientSession());
  }, []);

  const signOut = () => {
    clearClientSession();
    setClient(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="text-left">
            <h2 className="text-xl font-bold tracking-tight">NexaVoice</h2>
            <p className="text-xs text-zinc-500">NexaMart customer support</p>
          </div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            Home
          </Link>
        </div>

        {client ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700">
                <UserRound className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{client.name}</p>
                <p className="truncate text-xs text-zinc-500">{client.email}</p>
              </div>
              <button
                onClick={signOut}
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
            <dl className="mt-3 grid grid-cols-[90px_1fr] gap-y-1 text-xs text-zinc-400">
              <dt className="text-zinc-600">Phone</dt>
              <dd className="text-zinc-300">{client.phone}</dd>
              <dt className="text-zinc-600">City</dt>
              <dd className="text-zinc-300">{client.city || "—"}</dd>
              <dt className="text-zinc-600">Tier</dt>
              <dd className="uppercase text-zinc-300">{client.tier}</dd>
              <dt className="text-zinc-600">Language</dt>
              <dd className="text-zinc-300">{client.preferredLanguage}</dd>
            </dl>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
            You are not signed in.
            <Link href="/login?role=client" className="ml-1 font-medium text-blue-400 hover:text-blue-300">
              Sign in as a client →
            </Link>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-2xl font-medium">How can we help you today?</h3>
          <p className="text-sm text-zinc-400">Hindi · English · Hinglish</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Link href="/client/chat" className="w-full">
            <Button className="flex h-24 w-full flex-col items-center justify-center gap-3 border border-zinc-700 bg-zinc-800 text-white transition-all hover:bg-zinc-700">
              <MessageSquare className="h-8 w-8 text-blue-400" />
              <span className="text-lg">Chat with AI</span>
            </Button>
          </Link>
          <Link href="/client/voice" className="w-full">
            <Button className="flex h-24 w-full flex-col items-center justify-center gap-3 border border-zinc-700 bg-zinc-800 text-white transition-all hover:bg-zinc-700">
              <Phone className="h-8 w-8 text-green-400" />
              <span className="text-lg">Voice call with AI</span>
            </Button>
          </Link>
        </div>

        <p className="text-xs text-zinc-600">
          Demo accounts — mobile 9876543210 (Rahul), 9123456780 (Priya), 9988776655 (Amit)
        </p>
      </div>
    </div>
  );
}
