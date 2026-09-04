import Link from "next/link";
import ClientChat from "@/components/ClientChat";
import SignedInClient from "@/components/SignedInClient";
import { ArrowLeft } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex flex-col h-screen bg-black text-white">
      <div className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/client" className="p-2 hover:bg-zinc-800 rounded-full transition-colors" aria-label="Back">
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </Link>
          <div>
            <h2 className="text-lg font-semibold leading-tight">NexaVoice</h2>
            <p className="text-xs text-zinc-500">NexaMart support · chat</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <SignedInClient />
          <Link href="/client/voice" className="text-sm text-blue-400 hover:text-blue-300">
            Switch to voice call →
          </Link>
        </div>
      </div>

      <main className="flex-1 overflow-hidden relative">
        <ClientChat />
      </main>
    </div>
  );
}
