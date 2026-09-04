import Link from "next/link";
import SupportDashboard from "@/components/SupportDashboard";
import SignedInAgent from "@/components/SignedInAgent";

export default function SupportAgentPage() {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">NexaVoice Support</h1>
          <p className="text-xs text-zinc-500">Human agent dashboard · live calls, chats and AI escalations</p>
        </div>
        <div className="flex items-center gap-4">
          <SignedInAgent />
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
            Home
          </Link>
        </div>
      </header>

      <main className="flex-1 p-6">
        <SupportDashboard />
      </main>
    </div>
  );
}
