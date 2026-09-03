"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getActiveCases } from "@/lib/api";

type Case = {
  id: string;
  name: string;
  language: string;
  intent: string;
  confidence: number;
  summary: string;
  status: "WAITING_FOR_HUMAN" | "IN_PROGRESS";
};

export default function SupportDashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  useEffect(() => {
    // Poll or fetch cases
    const fetchCases = async () => {
      try {
        const data = await getActiveCases();
        setCases(data);
      } catch (error) {
        console.error("Failed to fetch cases", error);
      }
    };
    fetchCases();
  }, []);

  return (
    <div className="flex h-[calc(100vh-80px)] bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Sidebar - Active Cases */}
      <div className="w-1/3 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="font-semibold text-zinc-200">Active Cases</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {cases.map((c) => (
            <div 
              key={c.id} 
              className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedCase?.id === c.id ? "bg-blue-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
              onClick={() => setSelectedCase(c)}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium">● {c.name}</span>
                <span className="text-xs opacity-75">{c.status === "WAITING_FOR_HUMAN" ? "Waiting" : "Active"}</span>
              </div>
              <p className="text-sm opacity-80 truncate">{c.intent}</p>
            </div>
          ))}
          {cases.length === 0 && (
            <div className="text-center p-4 text-zinc-500 text-sm">
              No active cases.
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Case Details */}
      <div className="flex-1 bg-zinc-950 p-6 flex flex-col">
        {selectedCase ? (
          <div className="space-y-6">
            <div className="border-b border-zinc-800 pb-4">
              <h2 className="text-2xl font-bold">Case #{selectedCase.id}</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800">
                <p className="text-sm text-zinc-400 mb-1">Language</p>
                <p className="font-medium">{selectedCase.language}</p>
              </div>
              <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800">
                <p className="text-sm text-zinc-400 mb-1">Intent</p>
                <p className="font-medium">{selectedCase.intent}</p>
              </div>
              <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800">
                <p className="text-sm text-zinc-400 mb-1">Confidence</p>
                <p className="font-medium">{selectedCase.confidence}%</p>
              </div>
            </div>

            <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800 mt-4">
              <p className="text-sm text-zinc-400 mb-2">Summary</p>
              <p className="text-zinc-200">{selectedCase.summary}</p>
            </div>

            <div className="mt-8 flex justify-end">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg">
                JOIN CONVERSATION
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            Select a case to view details and join the conversation.
          </div>
        )}
      </div>
    </div>
  );
}
