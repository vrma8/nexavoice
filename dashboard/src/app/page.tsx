"use client";

import React, { useState, useEffect, useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { ActiveCallsList } from "@/components/ActiveCallsList";
import { CallDetailView } from "@/components/CallDetailView";
import { CallerSimulator } from "@/components/CallerSimulator";
import { CasesHub } from "@/components/CasesHub";
import { AnalyticsView } from "@/components/AnalyticsView";
import { CallItem, MessageItem, ConfidenceBreakdown, HandoffSummary, CaseItem } from "@/types";

const API_BASE = "http://localhost:8000/api";
const WS_URL = "ws://localhost:8000/ws/live";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<string>("console");
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [agentStatus, setAgentStatus] = useState<"AVAILABLE" | "BUSY" | "OFFLINE">("AVAILABLE");

  const [calls, setCalls] = useState<CallItem[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [confidence, setConfidence] = useState<ConfidenceBreakdown | undefined>(undefined);
  const [handoffSummary, setHandoffSummary] = useState<HandoffSummary | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch active calls
  const fetchActiveCalls = async () => {
    try {
      const res = await fetch(`${API_BASE}/calls/active`);
      const data: CallItem[] = await res.json();
      setCalls(data);

      if (data.length > 0 && !selectedCall) {
        setSelectedCall(data[0]);
        loadCallTranscript(data[0].id);
      } else if (selectedCall) {
        // Refresh selected call status
        const updated = data.find((c) => c.id === selectedCall.id);
        if (updated) {
          setSelectedCall(updated);
        }
      }
    } catch (err) {
      console.error("Failed to load active calls", err);
    }
  };

  // Load transcript for a selected call
  const loadCallTranscript = async (callId: string) => {
    try {
      const res = await fetch(`${API_BASE}/calls/${callId}/transcript`);
      const data = await res.json();
      setMessages(data.messages || []);

      if (data.conversation) {
        const conv = data.conversation;
        setConfidence({
          intent_confidence: 0.95,
          asr_confidence: 0.95,
          entity_confidence: conv.reference_id ? 1.0 : 0.7,
          confirmation_score: conv.confirmed_entities?.length > 0 ? 1.0 : 0.6,
          consistency_score: 1.0,
          overall_confidence: conv.confidence || 1.0,
          confidence_level: conv.confidence >= 0.8 ? "HIGH" : conv.confidence >= 0.55 ? "MEDIUM" : "LOW",
        });

        if (conv.summary) {
          setHandoffSummary({
            language: conv.language || "Hinglish",
            caller_name: conv.collected_entities?.caller_name,
            phone: data.caller_number,
            reference_id: conv.collected_entities?.reference_id,
            intent: conv.intent,
            summary: conv.summary,
            information_collected: Object.entries(conv.collected_entities || {}).map(([k, v]) => `${k}: ${v}`),
            missing_information: [],
            actions_taken: ["Identified caller intent and verified state"],
            reason_for_escalation: "Escalation requested or confidence threshold triggered",
            confidence: conv.confidence || 0.5,
            confidence_level: conv.confidence >= 0.8 ? "HIGH" : conv.confidence >= 0.55 ? "MEDIUM" : "LOW",
          });
        }
      }
    } catch (err) {
      console.error("Failed to load transcript", err);
    }
  };

  // Connect WebSocket for live updates
  useEffect(() => {
    const connectWS = () => {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            const { event: eventType, data } = payload;

            if (eventType === "CALL_STARTED" || eventType === "CALL_ENDED" || eventType === "HUMAN_TAKEOVER") {
              fetchActiveCalls();
              if (selectedCall?.id === data.call_id) {
                loadCallTranscript(data.call_id);
              }
            } else if (eventType === "TRANSCRIPT_UPDATE") {
              fetchActiveCalls();
              if (selectedCall?.id === data.call_id) {
                loadCallTranscript(data.call_id);
              }
            } else if (eventType === "ESCALATION_TRIGGERED") {
              fetchActiveCalls();
              if (selectedCall?.id === data.call_id && data.handoff_summary) {
                setHandoffSummary(data.handoff_summary);
              }
            }
          } catch (e) {
            console.error("WebSocket message parse error", e);
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          setTimeout(connectWS, 3000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (err) {
        console.error("WebSocket connection error", err);
        setWsConnected(false);
      }
    };

    fetchActiveCalls();
    connectWS();

    const interval = setInterval(fetchActiveCalls, 4000);
    return () => {
      clearInterval(interval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [selectedCall?.id]);

  const handleSelectCall = (call: CallItem) => {
    setSelectedCall(call);
    loadCallTranscript(call.id);
  };

  const handleHumanTakeover = async (callId: string) => {
    try {
      await fetch(`${API_BASE}/calls/${callId}/transfer`, { method: "POST" });
      fetchActiveCalls();
      loadCallTranscript(callId);
    } catch (err) {
      console.error("Takeover failed", err);
    }
  };

  const handleEndCall = async (callId: string) => {
    try {
      await fetch(`${API_BASE}/calls/${callId}/end`, { method: "POST" });
      fetchActiveCalls();
      setSelectedCall(null);
    } catch (err) {
      console.error("End call failed", err);
    }
  };

  const handleCallCreated = (callId: string) => {
    fetchActiveCalls();
    loadCallTranscript(callId);
  };

  const escalatedCount = calls.filter((c) => c.status === "WAITING_FOR_HUMAN").length;

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-cyan-500 selection:text-black">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        wsConnected={wsConnected}
        activeCallsCount={calls.length}
        escalatedCount={escalatedCount}
        agentStatus={agentStatus}
        setAgentStatus={setAgentStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {activeTab === "console" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Sidebar: Active Calls (4 cols) */}
            <div className="lg:col-span-4">
              <ActiveCallsList
                calls={calls}
                selectedCallId={selectedCall?.id}
                onSelectCall={handleSelectCall}
                onQuickSimulate={() => setActiveTab("simulator")}
              />
            </div>

            {/* Right Main Area: Selected Call Details (8 cols) */}
            <div className="lg:col-span-8">
              {selectedCall ? (
                <CallDetailView
                  call={selectedCall}
                  messages={messages}
                  confidence={confidence}
                  handoffSummary={handoffSummary}
                  onRefresh={() => loadCallTranscript(selectedCall.id)}
                  onHumanTakeover={handleHumanTakeover}
                  onEndCall={handleEndCall}
                />
              ) : (
                <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center text-center text-slate-400 h-96 gap-4">
                  <div className="w-16 h-16 rounded-full bg-cyan-950/60 border border-cyan-800 flex items-center justify-center text-cyan-400">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-200">No Call Selected</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      Select an incoming helpline call from the sidebar or start a new test call from the Simulator.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("simulator")}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-md shadow-cyan-600/20"
                  >
                    Open Caller Phone Simulator
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "simulator" && (
          <CallerSimulator
            activeCallId={selectedCall?.id}
            onCallCreated={handleCallCreated}
            onTurnProcessed={(callId) => {
              fetchActiveCalls();
              loadCallTranscript(callId);
            }}
          />
        )}

        {activeTab === "cases" && (
          <CasesHub
            onSelectCase={(caseItem) => {
              // Find matching call or switch to console
              const matchingCall = calls.find((c) => c.current_conversation_id === caseItem.conversation_id);
              if (matchingCall) {
                setSelectedCall(matchingCall);
                loadCallTranscript(matchingCall.id);
                setActiveTab("console");
              }
            }}
          />
        )}

        {activeTab === "analytics" && <AnalyticsView />}
      </main>
    </div>
  );
}
