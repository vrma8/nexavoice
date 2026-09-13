"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  CheckCircle,
  Clock,
  ExternalLink,
  Headset,
  Loader2,
  MessageSquare,
  Mic,
  Phone,
  Radio,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  User,
  Zap,
} from "lucide-react";
import SignedInAgent from "@/components/SignedInAgent";
import { acceptCase, getDashboard, type DashboardSnapshot } from "@/lib/api";
import type { Conversation, ConversationEvent, SupportCase } from "@/lib/support/types";
import { getAgentSession } from "@/lib/session";

const POLL_MS = 3000;
const AGENT_NAME_KEY = "nexavoice.agentName";
const STALE_AFTER_MS = 120_000;

function formatAge(from: number, now: number) {
  const s = Math.max(0, Math.round((now - from) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const STATE_STYLES: Record<Conversation["state"], { bg: string; text: string; dot: string }> = {
  AI_HANDLING: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-300", dot: "bg-blue-400" },
  WAITING_FOR_HUMAN: { bg: "bg-yellow-500/10 border-yellow-500/20", text: "text-yellow-300", dot: "bg-yellow-400" },
  HUMAN_HANDLING: { bg: "bg-violet-500/10 border-violet-500/20", text: "text-violet-300", dot: "bg-violet-400" },
  RESOLVED: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-300", dot: "bg-emerald-400" },
  CLOSED: { bg: "bg-zinc-500/10 border-zinc-500/20", text: "text-zinc-400", dot: "bg-zinc-500" },
};

const PRIORITY_STYLES: Record<SupportCase["priority"], string> = {
  HIGH: "text-red-300 bg-red-500/10 border-red-500/20",
  MEDIUM: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  LOW: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
};

function StatusBadge({ status }: { status: Conversation["state"] }) {
  const style = STATE_STYLES[status] ?? STATE_STYLES.AI_HANDLING;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

function eventLevel(type: string): "warn" | "success" | "info" {
  if (type === "ESCALATED") return "warn";
  if (type === "RESOLVED" || type === "CONVERSATION_ENDED") return "success";
  return "info";
}

export default function SupportDashboard() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [accepting, setAccepting] = useState<string | null>(null);
  const [liveFeed, setLiveFeed] = useState<"sse" | "poll">("poll");
  const [clock, setClock] = useState(() => Date.now());
  const refreshing = useRef(false);

  useEffect(() => {
    const session = getAgentSession();
    const saved = window.localStorage.getItem(AGENT_NAME_KEY);
    setAgentName(session?.name ?? saved ?? "");
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const data = await getDashboard();
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      refreshing.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, POLL_MS);
    let source: EventSource | null = null;
    if (typeof EventSource !== "undefined") {
      source = new EventSource("/api/dashboard/events");
      source.addEventListener("ready", () => setLiveFeed("sse"));
      source.addEventListener("conversation", () => void refresh());
      source.onerror = () => setLiveFeed("poll");
    }
    return () => {
      clearInterval(id);
      source?.close();
    };
  }, [refresh]);

  const waiting = snapshot?.waitingCases ?? [];
  const handling = snapshot?.handlingCases ?? [];
  const allCases = [...waiting, ...handling, ...(snapshot?.recentResolved ?? [])];
  const selectedCase = allCases.find((c) => c.id === selectedCaseId) ?? waiting[0] ?? handling[0] ?? null;
  const selectedConversation =
    selectedCase &&
    [...(snapshot?.liveCalls ?? []), ...(snapshot?.activeChats ?? [])].find((c) => c.id === selectedCase.conversationId);
  const now = clock;
  const liveCalls = snapshot?.liveCalls ?? [];
  const activeChats = snapshot?.activeChats ?? [];
  const aiHandlingCount = [...liveCalls, ...activeChats].filter((c) => c.state === "AI_HANDLING").length;

  const handleAccept = async (c: SupportCase) => {
    const name = agentName.trim() || getAgentSession()?.name || "Support Agent";
    window.localStorage.setItem(AGENT_NAME_KEY, name);
    setAccepting(c.id);
    try {
      await acceptCase(c.id, name, getAgentSession()?.email);
      router.push(`/support-agent/cases/${c.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept case");
      setAccepting(null);
    }
  };

  const openCase = (c: SupportCase) => router.push(`/support-agent/cases/${c.id}`);

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(223_47%_4%)] text-[hsl(220_15%_95%)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[hsl(222_25%_13%)] bg-[hsl(223_47%_4%_/_0.95)] backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.12)]">
              <Mic className="h-3.5 w-3.5 text-[hsl(191_100%_55%)]" />
            </div>
            <span className="font-serif hidden text-lg text-white sm:block">NexaVoice</span>
            <span className="hidden text-[hsl(220_10%_35%)] sm:block">/</span>
            <span className="hidden text-sm text-[hsl(220_10%_50%)] sm:block">Agent Dashboard</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Live indicator */}
            <div
              className={`hidden items-center gap-2 rounded-full border px-3 py-1 text-xs sm:flex ${
                liveFeed === "sse"
                  ? "border-[hsl(191_100%_50%_/_0.2)] bg-[hsl(191_100%_50%_/_0.06)] text-[hsl(191_100%_60%)]"
                  : "border-yellow-500/20 bg-yellow-500/5 text-yellow-300"
              }`}
            >
              <Radio className={`h-3 w-3 ${liveFeed === "sse" ? "animate-pulse" : ""}`} />
              {liveFeed === "sse" ? "Live feed" : "Polling"}
            </div>
            <div className="font-mono hidden text-xs text-[hsl(220_10%_35%)] sm:block">
              {new Date(clock).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[hsl(260_30%_25%)] bg-[hsl(260_60%_60%_/_0.06)] px-2.5 py-1.5">
              <Headset className="h-3.5 w-3.5 text-[hsl(260_70%_65%)]" />
              <SignedInAgent />
            </div>
          </div>
        </div>
      </header>

      {/* Stat bar */}
      <div className="border-b border-[hsl(222_25%_13%)] bg-[hsl(222_40%_6%)]">
        <div className="mx-auto flex max-w-7xl items-center divide-x divide-[hsl(222_25%_13%)] overflow-x-auto px-4">
          {[
            { icon: Phone, label: "Live calls", value: liveCalls.length, color: "text-[hsl(142_70%_55%)]", highlight: false },
            { icon: MessageSquare, label: "Active chats", value: activeChats.length, color: "text-[hsl(191_100%_55%)]", highlight: false },
            { icon: ShieldAlert, label: "Waiting", value: waiting.length, color: "text-yellow-400", highlight: waiting.length > 0 },
            { icon: TrendingUp, label: "Resolved", value: snapshot?.recentResolved.length ?? 0, color: "text-emerald-400", highlight: false },
            { icon: Zap, label: "AI handling", value: aiHandlingCount, color: "text-violet-400", highlight: false },
          ].map(({ icon: Icon, label, value, color, highlight }) => (
            <div key={label} className={`flex flex-shrink-0 items-center gap-3 px-5 py-3 ${highlight ? "bg-yellow-500/5" : ""}`}>
              <Icon className={`h-4 w-4 ${color}`} />
              <div>
                <p className="text-[11px] text-[hsl(220_10%_40%)]">{label}</p>
                <p className={`text-xl leading-none font-bold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main 3-column layout */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden lg:flex-row lg:divide-x lg:divide-[hsl(222_25%_13%)] lg:h-[calc(100vh-118px)]">
        {/* Column 1 — live activity */}
        <div className="flex w-full flex-shrink-0 flex-col lg:w-72">
          {/* Live conversations */}
          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-[hsl(222_25%_13%)] px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[hsl(220_10%_40%)] uppercase">
                <Activity className="h-3.5 w-3.5 text-emerald-400" /> Live conversations
              </h2>
            </div>
            <div className="space-y-2 p-3">
              {[...liveCalls, ...activeChats].map((c) => (
                <ConversationRow key={c.id} conversation={c} now={now} />
              ))}
              {snapshot && liveCalls.length + activeChats.length === 0 && (
                <p className="py-8 text-center text-xs text-[hsl(220_10%_35%)]">No active conversations</p>
              )}
              {!snapshot && !error && (
                <p className="flex items-center justify-center gap-2 py-8 text-xs text-[hsl(220_10%_35%)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              )}
            </div>
          </div>

          {/* Event feed */}
          <div className="flex-shrink-0 border-t border-[hsl(222_25%_13%)]">
            <div className="border-b border-[hsl(222_25%_13%)] px-4 py-3">
              <h2 className="text-xs font-semibold tracking-wide text-[hsl(220_10%_40%)] uppercase">Event feed</h2>
            </div>
            <ul className="max-h-44 space-y-1.5 overflow-y-auto p-3">
              {[...(snapshot?.recentEvents ?? [])].reverse().slice(0, 30).map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
              {snapshot && snapshot.recentEvents.length === 0 && (
                <li className="text-center text-[11px] text-[hsl(220_10%_35%)]">No events yet.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Column 2 — escalation queue */}
        <div className="flex w-full flex-shrink-0 flex-col lg:w-72">
          <div className="flex items-center justify-between border-b border-[hsl(222_25%_13%)] px-4 py-3">
            <h2 className="text-xs font-semibold tracking-wide text-[hsl(220_10%_40%)] uppercase">Escalation queue</h2>
            <button
              onClick={() => void refresh()}
              className="rounded-lg p-1 text-[hsl(220_10%_40%)] transition-colors hover:bg-[hsl(222_35%_12%)] hover:text-white"
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-3">
            {/* Waiting section */}
            {waiting.length > 0 && (
              <p className="flex items-center gap-1.5 px-1 pt-1 pb-2 text-[10px] font-semibold tracking-wide text-yellow-400 uppercase">
                <AlertCircle className="h-3 w-3" /> Waiting for human
              </p>
            )}
            {waiting.map((c) => (
              <CaseCard key={c.id} c={c} now={now} selected={selectedCase?.id === c.id} onClick={() => setSelectedCaseId(c.id)} />
            ))}

            {handling.length > 0 && (
              <p className="flex items-center gap-1.5 px-1 pt-3 pb-2 text-[10px] font-semibold tracking-wide text-violet-400 uppercase">
                <Headset className="h-3 w-3" /> Being handled
              </p>
            )}
            {handling.map((c) => (
              <CaseCard key={c.id} c={c} now={now} selected={selectedCase?.id === c.id} onClick={() => setSelectedCaseId(c.id)} />
            ))}

            {(snapshot?.recentResolved.length ?? 0) > 0 && (
              <p className="flex items-center gap-1.5 px-1 pt-3 pb-2 text-[10px] font-semibold tracking-wide text-emerald-400 uppercase">
                <CheckCircle className="h-3 w-3" /> Recently resolved
              </p>
            )}
            {snapshot?.recentResolved.map((c) => (
              <CaseCard key={c.id} c={c} now={now} selected={selectedCase?.id === c.id} onClick={() => setSelectedCaseId(c.id)} />
            ))}

            {snapshot && allCases.length === 0 && (
              <p className="p-4 text-center text-xs text-[hsl(220_10%_35%)]">
                No escalations. When the AI hands off a customer, the case appears here instantly.
              </p>
            )}
          </div>
        </div>

        {/* Column 3 — case detail */}
        <div className="flex min-h-[24rem] min-w-0 flex-1 flex-col overflow-hidden">
          {selectedCase ? (
            <>
              {/* Case header */}
              <div className="border-b border-[hsl(222_25%_13%)] p-5">
                <div className="flex items-start gap-3 justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-xl font-semibold text-white">{selectedCase.handoff.client_name}</h2>
                      <StatusBadge status={selectedCase.status} />
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${PRIORITY_STYLES[selectedCase.priority]}`}>
                        {selectedCase.priority}
                      </span>
                    </div>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[hsl(220_10%_35%)]">
                      <span>{selectedCase.id}</span>
                      <span>·</span>
                      <span>{selectedCase.mode === "VOICE" ? "Voice call" : "Chat"}</span>
                      <span>·</span>
                      <span>{selectedCase.handoff.language}</span>
                      <span>·</span>
                      <Clock className="h-3 w-3" />
                      <span>{formatAge(selectedCase.createdAt, now)} ago</span>
                      {selectedCase.assignedTo ? (
                        <span className="text-violet-300">
                          · assigned to {selectedCase.assignedTo}
                          {selectedCase.assignedAgentEmail ? ` (${selectedCase.assignedAgentEmail})` : ""}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  {selectedCase.status === "WAITING_FOR_HUMAN" ? (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <input
                        className="input-field w-36 py-2 text-xs"
                        placeholder="Your name"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                      />
                      <button
                        className="btn-primary flex-shrink-0 py-2 text-xs"
                        style={{ background: "hsl(142 70% 40%)", color: "white" }}
                        onClick={() => void handleAccept(selectedCase)}
                        disabled={accepting === selectedCase.id}
                      >
                        {accepting === selectedCase.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Headset className="h-4 w-4" />
                        )}
                        {accepting === selectedCase.id ? "Joining…" : selectedCase.mode === "VOICE" ? "Accept call" : "Accept chat"}
                      </button>
                    </div>
                  ) : (
                    <button className="btn-secondary flex-shrink-0 py-2 text-xs" onClick={() => openCase(selectedCase)}>
                      <ExternalLink className="h-3.5 w-3.5" /> Open case
                    </button>
                  )}
                </div>
              </div>

              {/* Case body */}
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
                  {/* AI handoff summary */}
                  <section className="space-y-4">
                    <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-[hsl(220_10%_40%)] uppercase">
                      <Bot className="h-3.5 w-3.5 text-[hsl(191_100%_55%)]" /> AI handoff summary
                    </h3>

                    <div className="rounded-xl border border-[hsl(222_25%_15%)] bg-[hsl(222_35%_8%)] p-4">
                      <p className="text-sm leading-relaxed text-[hsl(220_15%_80%)]">{selectedCase.handoff.summary}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <InfoBlock label="Intent" value={selectedCase.handoff.intent} />
                      <InfoBlock
                        label="AI confidence"
                        value={`${Math.round(selectedCase.handoff.confidence * 100)}%`}
                        valueClass={selectedCase.handoff.confidence > 0.8 ? "text-emerald-300" : "text-yellow-300"}
                      />
                    </div>
                    <InfoBlock label="Reason for escalation" value={selectedCase.handoff.reason_for_escalation} />

                    <div className="space-y-2">
                      <p className="text-[11px] font-medium text-[hsl(220_10%_40%)]">Information collected</p>
                      {selectedCase.handoff.information_collected.length === 0 ? (
                        <p className="text-xs text-[hsl(220_10%_35%)]">Nothing collected.</p>
                      ) : (
                        <ul className="space-y-1">
                          {selectedCase.handoff.information_collected.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-[hsl(220_15%_75%)]">
                              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[hsl(191_100%_50%)]" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-medium text-[hsl(220_10%_40%)]">Actions taken by AI</p>
                      {selectedCase.handoff.actions_taken.length === 0 ? (
                        <p className="text-xs text-[hsl(220_10%_35%)]">No changes were made.</p>
                      ) : (
                        <ul className="space-y-1">
                          {selectedCase.handoff.actions_taken.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-[hsl(220_15%_75%)]">
                              <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {selectedCase.handoff.missing_information.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium text-[hsl(220_10%_40%)]">Missing information</p>
                        <ul className="space-y-1">
                          {selectedCase.handoff.missing_information.map((m, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-[hsl(220_15%_75%)]">
                              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-yellow-400" />
                              {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>

                  {/* Customer details */}
                  <section className="space-y-4">
                    <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-[hsl(220_10%_40%)] uppercase">
                      <User className="h-3.5 w-3.5 text-[hsl(191_100%_55%)]" /> Customer details
                    </h3>
                    {selectedCase.customer ? (
                      <div className="space-y-3 rounded-xl border border-[hsl(222_25%_15%)] bg-[hsl(222_35%_8%)] p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.1)] text-sm font-semibold text-[hsl(191_100%_55%)]">
                            {selectedCase.customer.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-white">{selectedCase.customer.name}</p>
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${
                                selectedCase.customer.tier === "prime"
                                  ? "border-[hsl(40_100%_50%_/_0.3)] bg-[hsl(40_100%_50%_/_0.08)] text-[hsl(40_100%_55%)]"
                                  : "border-[hsl(222_25%_20%)] bg-[hsl(222_35%_12%)] text-[hsl(220_10%_50%)]"
                              }`}
                            >
                              {selectedCase.customer.tier}
                            </span>
                          </div>
                        </div>
                        <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
                          <dt className="text-[hsl(220_10%_40%)]">Phone</dt>
                          <dd className="text-[hsl(220_15%_80%)]">{selectedCase.customer.phone}</dd>
                          <dt className="text-[hsl(220_10%_40%)]">Email</dt>
                          <dd className="truncate text-[hsl(220_15%_80%)]">{selectedCase.customer.email}</dd>
                          <dt className="text-[hsl(220_10%_40%)]">City</dt>
                          <dd className="text-[hsl(220_15%_80%)]">{selectedCase.customer.city}</dd>
                          <dt className="text-[hsl(220_10%_40%)]">Customer ID</dt>
                          <dd className="font-mono text-xs text-[hsl(220_15%_80%)]">{selectedCase.customer.id}</dd>
                        </dl>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-[hsl(222_25%_20%)] p-4 text-sm text-[hsl(220_10%_45%)]">
                        Customer was not verified before escalation — ask for the registered mobile number.
                      </p>
                    )}

                    {selectedConversation && (
                      <>
                        <h3 className="pt-2 text-[11px] font-semibold tracking-wide text-[hsl(220_10%_40%)] uppercase">
                          Live conversation
                        </h3>
                        <ConversationRow conversation={selectedConversation} now={now} />
                        {selectedConversation.toolAudit.length > 0 && (
                          <ul className="space-y-1 text-xs text-[hsl(220_10%_55%)]">
                            {selectedConversation.toolAudit.slice(-8).map((t) => (
                              <li key={t.id} className="flex items-start gap-2">
                                <span
                                  className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                                    t.ok ? (t.write ? "bg-amber-400" : "bg-emerald-400") : "bg-red-400"
                                  }`}
                                />
                                <span>
                                  <span className="font-mono text-[hsl(220_15%_80%)]">{t.tool}</span> — {t.summary}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </section>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[hsl(220_10%_35%)]">
              <Bot className="h-12 w-12 text-[hsl(222_25%_18%)]" />
              <p className="text-sm">Select a case to see the AI handoff summary and customer details.</p>
              {error && <p className="text-xs text-red-400">{error}</p>}
              {!snapshot && (
                <p className="flex items-center gap-2 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading the dashboard…
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationRow({ conversation, now }: { conversation: Conversation; now: number }) {
  const name = conversation.context.customer?.name ?? conversation.context.customerName ?? "Unverified caller";
  const style = STATE_STYLES[conversation.state] ?? STATE_STYLES.AI_HANDLING;
  return (
    <div className={`rounded-xl border p-3 text-sm ${style.bg}`}>
      <div className="mb-1.5 flex items-center gap-2">
        {conversation.mode === "VOICE" ? (
          <Phone className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 text-[hsl(191_100%_55%)]" />
        )}
        <span className="flex-1 truncate font-medium text-white">{name}</span>
        <PresenceDot conversation={conversation} now={now} />
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className={`rounded-full border px-2 py-0.5 ${style.bg} ${style.text}`}>
          {conversation.state.replace(/_/g, " ")}
        </span>
        {conversation.context.language && (
          <span className="rounded-full border border-[hsl(222_25%_20%)] bg-[hsl(222_35%_10%)] px-2 py-0.5 text-[hsl(220_10%_50%)]">
            {conversation.context.language}
          </span>
        )}
        {conversation.context.intent && (
          <span className="rounded-full border border-[hsl(222_25%_20%)] bg-[hsl(222_35%_10%)] px-2 py-0.5 text-[hsl(220_10%_50%)]">
            {conversation.context.intent}
          </span>
        )}
        {conversation.mode === "VOICE" && conversation.agentState && (
          <span className="rounded-full border border-[hsl(222_25%_20%)] bg-[hsl(222_35%_10%)] px-2 py-0.5 text-[hsl(220_10%_50%)]">
            AI: {conversation.agentState}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-[hsl(220_10%_35%)]">
        <span className="truncate">
          {conversation.id}
          {conversation.channel ? ` · ${conversation.channel}` : ""}
        </span>
        <span className="ml-2 flex-shrink-0">seen {formatAge(conversation.lastSeenAt ?? conversation.lastActivityAt, now)} ago</span>
      </div>
    </div>
  );
}

function PresenceDot({ conversation, now }: { conversation: Conversation; now: number }) {
  const lastSeen = conversation.lastSeenAt ?? conversation.lastActivityAt;
  const quiet = now - lastSeen > STALE_AFTER_MS / 2;
  return (
    <span
      title={quiet ? "No heartbeat — the customer may have left" : "Customer is on the page"}
      className={`h-2 w-2 flex-shrink-0 rounded-full ${quiet ? "bg-amber-400" : "animate-pulse bg-emerald-400"}`}
    />
  );
}

function CaseCard({
  c,
  now,
  selected,
  onClick,
}: {
  c: SupportCase;
  now: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-all ${
        selected
          ? "border-[hsl(191_100%_50%_/_0.3)] bg-[hsl(191_100%_50%_/_0.06)] shadow-[0_0_12px_hsl(191_100%_50%_/_0.06)]"
          : "border-[hsl(222_25%_14%)] bg-[hsl(222_35%_7%)] hover:border-[hsl(222_25%_20%)] hover:bg-[hsl(222_35%_9%)]"
      }`}
    >
      <div className="flex items-center gap-2">
        {c.mode === "VOICE" ? (
          <Phone className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-[hsl(191_100%_55%)]" />
        )}
        <span className="flex-1 truncate text-sm font-medium text-white">{c.handoff.client_name}</span>
        <span className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_STYLES[c.priority]}`}>
          {c.priority}
        </span>
      </div>
      <p className="mt-1 truncate text-[11px] text-[hsl(220_10%_45%)]">
        {c.handoff.intent} · {c.handoff.reason_for_escalation.substring(0, 45)}…
      </p>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-[hsl(220_10%_30%)]">
        <span>
          {c.id}
          {c.customerLeftAt && c.status !== "RESOLVED" && <span className="ml-1 text-red-400">· customer left</span>}
        </span>
        <span>
          {c.status === "WAITING_FOR_HUMAN" ? `waiting ${formatAge(c.createdAt, now)}` : formatAge(c.createdAt, now)}
        </span>
      </div>
    </button>
  );
}

function EventRow({ event }: { event: ConversationEvent }) {
  const level = eventLevel(event.type);
  return (
    <li className="flex gap-2.5 text-[11px]">
      <span className="flex-shrink-0 font-mono text-[hsl(220_10%_35%)]">{formatTime(event.at)}</span>
      <span
        className={`flex-1 truncate ${
          level === "warn" ? "text-yellow-300" : level === "success" ? "text-emerald-300" : "text-[hsl(220_10%_55%)]"
        }`}
      >
        {event.type.replace(/_/g, " ")}
        {event.detail && <span className="text-[hsl(220_10%_40%)]"> — {event.detail}</span>}
      </span>
    </li>
  );
}

function InfoBlock({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-[hsl(222_25%_15%)] bg-[hsl(222_35%_8%)] px-3 py-2.5">
      <p className="mb-0.5 text-[11px] text-[hsl(220_10%_40%)]">{label}</p>
      <p className={`text-sm font-medium ${valueClass ?? "text-[hsl(220_15%_80%)]"}`}>{value}</p>
    </div>
  );
}
