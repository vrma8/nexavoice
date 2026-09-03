import SupportDashboard from "@/components/SupportDashboard";

export default function SupportAgentPage() {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 p-4">
        <h1 className="text-xl font-bold tracking-tight">NexaVoice Support</h1>
      </header>
      
      <main className="flex-1 p-6">
        <SupportDashboard />
      </main>
    </div>
  );
}
