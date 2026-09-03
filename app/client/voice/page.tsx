import Link from "next/link";
import VoiceAgentCall from "@/components/VoiceAgentCall";
import { ArrowLeft } from "lucide-react";

export default function VoicePage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <div className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Link href="/client" className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </Link>
          <h2 className="text-lg font-semibold">NexaVoice</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>Language: Hindi-English</span>
        </div>
      </div>
      
      <main className="flex-1 overflow-hidden relative">
        <VoiceAgentCall />
      </main>
    </div>
  );
}
