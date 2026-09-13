"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { getClientSession, type ClientSession } from "@/lib/session";

export default function SignedInClient() {
  const [client, setClient] = useState<ClientSession | null>(null);

  useEffect(() => {
    setClient(getClientSession());
  }, []);

  if (!client) {
    return (
      <Link href="/login?role=client" className="text-xs text-[hsl(191_100%_55%)] hover:text-[hsl(191_100%_65%)]">
        Sign in
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-[hsl(220_15%_80%)]">
      <UserRound className="h-3.5 w-3.5 text-[hsl(191_100%_55%)]" />
      <span className="max-w-[180px] truncate">{client.name}</span>
      <span className="text-[hsl(220_10%_40%)]">· {client.phone}</span>
    </span>
  );
}
