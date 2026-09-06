"use client";
import VoiceAgentCall from "@/components/VoiceAgentCall";
import { useRouter } from "next/navigation";

export default function CallPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-black w-full flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/90">
        <h1 className="text-lg font-bold text-white">NexaVoice Call</h1>
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">Close</button>
      </header>
      <div className="flex-1 relative">
        <VoiceAgentCall onCallEnded={() => router.back()} />
      </div>
    </div>
  );
}
