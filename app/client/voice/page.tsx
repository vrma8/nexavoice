import Link from "next/link";
import VoiceAgentCall from "@/components/VoiceAgentCall";
import { ArrowLeft } from "lucide-react";

export default function VoicePage() {
  return (
    <div className="flex flex-col h-screen bg-black text-white">
      <div className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/client" className="p-2 hover:bg-zinc-800 rounded-full transition-colors" aria-label="Back">
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </Link>
          <div>
            <h2 className="text-lg font-semibold leading-tight">NexaVoice</h2>
            <p className="text-xs text-zinc-500">NexaMart support · voice</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>Hindi · English · Hinglish</span>
        </div>
      </div>

      <main className="flex-1 overflow-hidden relative">
        <VoiceAgentCall />
      </main>
    </div>
  );
}
