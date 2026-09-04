import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Phone, MessageSquare } from "lucide-react";

export default function ClientLandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <div className="max-w-md w-full p-8 space-y-8 text-center bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800">
        <div className="flex justify-between items-center pb-4 border-b border-zinc-800">
          <div className="text-left">
            <h2 className="text-xl font-bold tracking-tight">NexaVoice</h2>
            <p className="text-xs text-zinc-500">NexaMart customer support</p>
          </div>
          <Link href="/" className="text-zinc-500 text-sm hover:text-zinc-300">
            Home
          </Link>
        </div>

        <div className="space-y-2 py-2">
          <h3 className="text-2xl font-medium">How can we help you today?</h3>
          <p className="text-sm text-zinc-400">Hindi · English · Hinglish</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Link href="/client/chat" className="w-full">
            <Button className="w-full h-28 flex flex-col items-center justify-center gap-3 bg-zinc-800 hover:bg-zinc-700 text-white transition-all border border-zinc-700">
              <MessageSquare className="w-8 h-8 text-blue-400" />
              <span className="text-lg">Chat with AI</span>
            </Button>
          </Link>
          <Link href="/client/voice" className="w-full">
            <Button className="w-full h-28 flex flex-col items-center justify-center gap-3 bg-zinc-800 hover:bg-zinc-700 text-white transition-all border border-zinc-700">
              <Phone className="w-8 h-8 text-green-400" />
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
