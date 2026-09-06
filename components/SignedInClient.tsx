"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { getClientSession, type ClientSession } from "@/lib/session";

/**
 * Shows the signed-in client's name (from the database record saved at /login)
 * in the chat / voice headers. Falls back to a sign-in link when no session.
 */
export default function SignedInClient() {
  const [client, setClient] = useState<ClientSession | null>(null);

  useEffect(() => {
    setClient(getClientSession());
  }, []);

  if (!client) {
    return (
      <Link href="/login?role=client" className="text-xs text-blue-400 hover:text-blue-300">
        Sign in
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-300">
      <UserRound className="h-3.5 w-3.5 text-blue-400" />
      <span className="max-w-[180px] truncate">{client.name}</span>
      <span className="text-zinc-600">· {client.phone}</span>
    </span>
  );
}
