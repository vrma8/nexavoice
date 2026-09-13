import Link from "next/link";
import { Mic } from "lucide-react";
import CaseWorkspace from "@/components/CaseWorkspace";

export const metadata = {
  title: "Case — NexaVoice Agent Dashboard",
};

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex min-h-screen flex-col bg-[hsl(223_47%_4%)] text-[hsl(220_15%_95%)]">
      <header className="sticky top-0 z-30 border-b border-[hsl(222_25%_13%)] bg-[hsl(223_47%_4%_/_0.95)] backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.12)]">
              <Mic className="h-3.5 w-3.5 text-[hsl(191_100%_55%)]" />
            </div>
            <span className="font-serif hidden text-lg text-white sm:block">NexaVoice</span>
            <span className="hidden text-[hsl(220_10%_35%)] sm:block">/</span>
            <span className="hidden text-sm text-[hsl(220_10%_50%)] sm:block">Case {id}</span>
          </div>
          <Link
            href="/support-agent"
            className="ml-auto text-xs text-[hsl(220_10%_50%)] transition-colors hover:text-[hsl(220_15%_75%)]"
          >
            ← Dashboard
          </Link>
        </div>
      </header>
      <main className="flex-1 p-4 lg:p-6">
        <CaseWorkspace caseId={id} />
      </main>
    </div>
  );
}
