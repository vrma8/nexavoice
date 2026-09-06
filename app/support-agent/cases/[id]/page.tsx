import CaseWorkspace from "@/components/CaseWorkspace";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">NexaVoice Support · Case {id}</h1>
        <span className="text-xs text-zinc-500">Human agent workspace</span>
      </header>
      <main className="flex-1 p-6">
        <CaseWorkspace caseId={id} />
      </main>
    </div>
  );
}
