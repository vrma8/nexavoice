import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <div className="max-w-md w-full p-8 space-y-8 text-center bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-white">NexaVoice</h1>
          <p className="text-zinc-400">Multilingual AI support for NexaMart shoppers</p>
          <p className="text-xs text-zinc-600">Voice powered by Agora Conversational AI Engine</p>
        </div>

        <div className="flex flex-col gap-4 pt-4">
          <Link href="/login?role=client" className="w-full">
            <Button className="w-full text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white transition-all">
              Get Support
            </Button>
          </Link>

          <Link href="/login?role=agent" className="w-full">
            <Button variant="outline" className="w-full text-lg py-6 border-zinc-700 hover:bg-zinc-800 text-zinc-300">
              Support Agent Login
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
