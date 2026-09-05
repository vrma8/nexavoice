"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Bot,
  Headset,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  ShieldAlert,
  User,
} from "lucide-react";
import { acceptCase, getDashboard, type DashboardSnapshot } from "@/lib/api";
import type { Conversation, ConversationEvent, SupportCase } from "@/lib/support/types";
import { getAgentSession } from "@/lib/session";

const POLL_MS = 3000;
const AGENT_NAME_KEY = "nexavoice.agentName";
/** Matches STALE_AFTER_MS in lib/support/store.ts — a browser beats every 8s. */
const STALE_AFTER_MS = 30_000;

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

const STATE_STYLES: Record<Conversation["state"], string> = {
  AI_HANDLING: "bg-blue-900/50 text-blue-200 border-blue-700",
  WAITING_FOR_HUMAN: "bg-yellow-900/50 text-yellow-200 border-yellow-700",
  HUMAN_HANDLING: "bg-purple-900/50 text-purple-200 border-purple-700",
  RESOLVED: "bg-emerald-900/50 text-emerald-200 border-emerald-700",
  CLOSED: "bg-zinc-800 text-zinc-300 border-zinc-700",
};

const PRIORITY_STYLES: Record<SupportCase["priority"], string> = {
  HIGH: "bg-red-900/60 text-red-200 border-red-700",
  MEDIUM: "bg-amber-900/60 text-amber-200 border-amber-700",
  LOW: "bg-zinc-800 text-zinc-300 border-zinc-700",
};

function StateBadge({ state }: { state: Conversation["state"] }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATE_STYLES[state]}`}>
      {state.replace(/_/g, " ")}
    </span>
  );
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

  // Poll (fallback) + SSE (instant updates on escalation / state changes).
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
    <div className="flex h-[calc(100vh-80px)] gap-4 text-zinc-100">
      {/* Left column: live activity */}
      <div className="flex w-[30%] min-w-[300px] flex-col gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Activity className="h-4 w-4 text-emerald-400" /> Live activity
            </h2>
            <span className="flex items-center gap-1 text-[11px] text-zinc-500">
              <span className={`h-2 w-2 rounded-full ${liveFeed === "sse" ? "bg-emerald-400" : "bg-yellow-400"}`} />
              {liveFeed === "sse" ? "realtime" : "polling"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Calls" value={snapshot?.liveCalls.length ?? 0} icon={<Phone className="h-3.5 w-3.5" />} />
            <Stat label="Chats" value={snapshot?.activeChats.length ?? 0} icon={<MessageSquare className="h-3.5 w-3.5" />} />
            <Stat label="Waiting" value={waiting.length} icon={<ShieldAlert className="h-3.5 w-3.5" />} highlight={waiting.length > 0} />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 p-3">
            <p className="text-sm font-semibold text-zinc-300">Ongoing conversations</p>
            <p className="text-[11px] text-zinc-500">
              Live sessions only — a conversation disappears as soon as the customer signs out or closes the page.
            </p>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {[...(snapshot?.liveCalls ?? []), ...(snapshot?.activeChats ?? [])].map((c) => (
              <ConversationRow key={c.id} conversation={c} now={now} />
            ))}
            {snapshot && snapshot.liveCalls.length + snapshot.activeChats.length === 0 && (
              <p className="p-4 text-center text-sm text-zinc-500">No active calls or chats.</p>
            )}
            {!snapshot && !error && (
              <p className="flex items-center justify-center gap-2 p-4 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </p>
            )}
          </div>
        </div>

        <div className="max-h-[30%] rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 p-3 text-sm font-semibold text-zinc-300">Event feed</div>
          <ul className="max-h-40 space-y-1 overflow-y-auto p-2 text-[11px] text-zinc-400">
            {[...(snapshot?.recentEvents ?? [])].reverse().slice(0, 30).map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
            {snapshot && snapshot.recentEvents.length === 0 && <li className="p-2 text-center">No events yet.</li>}
          </ul>
        </div>
      </div>

      {/* Middle column: queue */}
      <div className="flex w-[30%] min-w-[280px] flex-col rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 p-3">
          <h2 className="font-semibold text-zinc-200">Escalation queue</h2>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-zinc-400" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          {waiting.length > 0 && <p className="px-1 pt-1 text-[11px] uppercase tracking-wide text-yellow-400">Waiting for human</p>}
          {waiting.map((c) => (
            <CaseRow key={c.id} c={c} now={now} selected={selectedCase?.id === c.id} onClick={() => setSelectedCaseId(c.id)} />
          ))}
          {handling.length > 0 && <p className="px-1 pt-2 text-[11px] uppercase tracking-wide text-purple-400">Being handled</p>}
          {handling.map((c) => (
            <CaseRow key={c.id} c={c} now={now} selected={selectedCase?.id === c.id} onClick={() => setSelectedCaseId(c.id)} />
          ))}
          {(snapshot?.recentResolved.length ?? 0) > 0 && (
            <p className="px-1 pt-2 text-[11px] uppercase tracking-wide text-emerald-400">Recently resolved</p>
          )}
          {snapshot?.recentResolved.map((c) => (
            <CaseRow key={c.id} c={c} now={now} selected={selectedCase?.id === c.id} onClick={() => setSelectedCaseId(c.id)} />
          ))}
          {snapshot && allCases.length === 0 && (
            <p className="p-4 text-center text-sm text-zinc-500">
              No escalations. When the AI hands off a customer, the case appears here instantly.
            </p>
          )}
        </div>
      </div>

      {/* Right column: case detail */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-zinc-800 bg-zinc-950">
        {selectedCase ? (
          <>
            <div className="flex items-start justify-between border-b border-zinc-800 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{selectedCase.handoff.client_name}</h2>
                  <StateBadge state={selectedCase.status} />
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${PRIORITY_STYLES[selectedCase.priority]}`}>
                    {selectedCase.priority}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {selectedCase.id} · {selectedCase.mode === "VOICE" ? "Voice call" : "Chat"} ·{" "}
                  {selectedCase.handoff.language} · created {formatAge(selectedCase.createdAt, now)} ago
                  {selectedCase.assignedTo
                    ? ` · assigned to ${selectedCase.assignedTo}${selectedCase.assignedAgentEmail ? ` (${selectedCase.assignedAgentEmail})` : ""}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedCase.status === "WAITING_FOR_HUMAN" ? (
                  <>
                    <input
                      className="h-9 w-36 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm placeholder:text-zinc-600"
                      placeholder="Your name"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                    />
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => void handleAccept(selectedCase)}
                      disabled={accepting === selectedCase.id}
                    >
                      {accepting === selectedCase.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Headset className="mr-2 h-4 w-4" />}
                      {selectedCase.mode === "VOICE" ? "Accept & join call" : "Accept chat"}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" className="border-zinc-700" onClick={() => openCase(selectedCase)}>
                    Open case
                  </Button>
                )}
              </div>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2">
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AI handoff summary</h3>
                <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm leading-relaxed">{selectedCase.handoff.summary}</p>
                <Field label="Reason for escalation" value={selectedCase.handoff.reason_for_escalation} />
                <Field label="Intent" value={selectedCase.handoff.intent} />
                <Field label="AI confidence" value={`${Math.round(selectedCase.handoff.confidence * 100)}%`} />
                <ListField label="Information collected" items={selectedCase.handoff.information_collected} />
                <ListField label="Actions taken by AI" items={selectedCase.handoff.actions_taken} emptyText="No changes were made." />
                <ListField label="Missing information" items={selectedCase.handoff.missing_information} emptyText="Nothing missing." />
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Customer details</h3>
                {selectedCase.customer ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <User className="h-4 w-4 text-zinc-400" /> {selectedCase.customer.name}
                      <span className="ml-auto rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-300">
                        {selectedCase.customer.tier}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-[90px_1fr] gap-y-1 text-zinc-300">
                      <dt className="text-zinc-500">Phone</dt>
                      <dd>{selectedCase.customer.phone}</dd>
                      <dt className="text-zinc-500">Email</dt>
                      <dd>{selectedCase.customer.email}</dd>
                      <dt className="text-zinc-500">City</dt>
                      <dd>{selectedCase.customer.city}</dd>
                      <dt className="text-zinc-500">Customer ID</dt>
                      <dd className="font-mono text-xs">{selectedCase.customer.id}</dd>
                    </dl>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
                    Customer was not verified before escalation — ask for the registered mobile number.
                  </p>
                )}

                {selectedConversation && (
                  <>
                    <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Live conversation</h3>
                    <ConversationRow conversation={selectedConversation} now={now} />
                    {selectedConversation.toolAudit.length > 0 && (
                      <ul className="space-y-1 text-xs text-zinc-400">
                        {selectedConversation.toolAudit.slice(-8).map((t) => (
                          <li key={t.id} className="flex items-start gap-2">
                            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${t.ok ? (t.write ? "bg-amber-400" : "bg-emerald-400") : "bg-red-400"}`} />
                            <span>
                              <span className="font-mono text-zinc-300">{t.tool}</span> — {t.summary}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-500">
            <Bot className="h-10 w-10 text-zinc-700" />
            <p className="text-sm">Select a case to see the AI handoff summary and customer details.</p>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, icon, highlight }: { label: string; value: number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${highlight ? "border-yellow-700 bg-yellow-900/20" : "border-zinc-800 bg-zinc-950"}`}>
      <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-500">
        {icon} {label}
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function ConversationRow({ conversation, now }: { conversation: Conversation; now: number }) {
  const name = conversation.context.customer?.name ?? conversation.context.customerName ?? "Unverified caller";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
      <div className="flex items-center gap-2">
        {conversation.mode === "VOICE" ? (
          <Phone className="h-3.5 w-3.5 text-green-400" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
        )}
        <span className="truncate font-medium">{name}</span>
        <PresenceDot conversation={conversation} now={now} />
        <span className="ml-auto text-[11px] text-zinc-500">{formatAge(conversation.createdAt, now)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
        <StateBadge state={conversation.state} />
        {conversation.mode === "VOICE" && conversation.agentState && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5">AI: {conversation.agentState}</span>
        )}
        {conversation.context.language && <span className="rounded bg-zinc-800 px-1.5 py-0.5">{conversation.context.language}</span>}
        {conversation.context.intent && <span className="rounded bg-zinc-800 px-1.5 py-0.5">{conversation.context.intent}</span>}
        {conversation.context.orderIds.length > 0 && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5">{conversation.context.orderIds.join(", ")}</span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-zinc-600">
        <span className="truncate">
          {conversation.id}
          {conversation.channel ? ` · ${conversation.channel}` : ""}
        </span>
        <span className="ml-auto shrink-0">seen {formatAge(conversation.lastSeenAt ?? conversation.lastActivityAt, now)} ago</span>
      </div>
    </div>
  );
}

/**
 * Green while the customer's browser is still sending heartbeats, amber once they
 * go quiet — the sweep closes the conversation a few seconds later.
 */
function PresenceDot({ conversation, now }: { conversation: Conversation; now: number }) {
  const lastSeen = conversation.lastSeenAt ?? conversation.lastActivityAt;
  const quiet = now - lastSeen > STALE_AFTER_MS / 2;
  return (
    <span
      title={quiet ? "No heartbeat — the customer may have left" : "Customer is on the page"}
      className={`h-2 w-2 shrink-0 rounded-full ${quiet ? "bg-amber-400" : "animate-pulse bg-emerald-400"}`}
    />
  );
}

function CaseRow({ c, now, selected, onClick }: { c: SupportCase; now: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        selected ? "border-blue-600 bg-blue-950/40" : "border-zinc-800 bg-zinc-950 hover:bg-zinc-800/60"
      }`}
    >
      <div className="flex items-center gap-2">
        {c.mode === "VOICE" ? <Phone className="h-3.5 w-3.5 text-green-400" /> : <MessageSquare className="h-3.5 w-3.5 text-blue-400" />}
        <span className="truncate font-medium">{c.handoff.client_name}</span>
        <span className={`ml-auto rounded-full border px-1.5 py-0.5 text-[10px] ${PRIORITY_STYLES[c.priority]}`}>{c.priority}</span>
      </div>
      <p className="mt-1 truncate text-xs text-zinc-400">{c.handoff.intent} · {c.handoff.reason_for_escalation}</p>
      <p className="mt-1 text-[11px] text-zinc-500">
        {c.id} · {c.status === "WAITING_FOR_HUMAN" ? `waiting ${formatAge(c.createdAt, now)}` : c.status.replace(/_/g, " ").toLowerCase()}
        {c.customerLeftAt && c.status !== "RESOLVED" && <span className="ml-1 text-red-400">· customer left</span>}
      </p>
    </button>
  );
}

function EventRow({ event }: { event: ConversationEvent }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 font-mono text-zinc-600">{formatTime(event.at)}</span>
      <span className="truncate">
        <span className="text-zinc-300">{event.type}</span>
        {event.detail ? ` — ${event.detail}` : ""}
      </span>
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="text-zinc-500">{label}: </span>
      <span className="text-zinc-200">{value}</span>
    </div>
  );
}

function ListField({ label, items, emptyText }: { label: string; items: string[]; emptyText?: string }) {
  return (
    <div className="text-sm">
      <p className="text-zinc-500">{label}</p>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-600">{emptyText ?? "—"}</p>
      ) : (
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-zinc-200">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
