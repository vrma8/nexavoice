import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";

export default function ClientLandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <div className="max-w-md w-full p-8 space-y-8 text-center bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800">
        <div className="flex justify-between items-center pb-4 border-b border-zinc-800">
          <h2 className="text-xl font-bold tracking-tight">NexaVoice</h2>
          <span className="text-zinc-500 text-sm">Help ?</span>
        </div>
        
        <div className="space-y-2 py-4">
          <h3 className="text-2xl font-medium">How can we help you today?</h3>
        </div>

        <div>
          <Link href="/client/voice" className="w-full">
            <Button className="w-full h-32 flex flex-col items-center justify-center gap-3 bg-zinc-800 hover:bg-zinc-700 text-white transition-all border border-zinc-700">
              <Phone className="w-8 h-8 text-green-400" />
              <span className="text-lg">Start AI Voice Call</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
