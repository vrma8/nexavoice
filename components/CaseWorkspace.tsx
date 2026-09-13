'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Headset,
  Loader2,
  MessageSquare,
  Phone,
  Send,
  User,
} from 'lucide-react';
import {
  acceptCase,
  getCase,
  getConversation,
  resolveCase,
  sendMessage,
  takeoverCase,
  type AcceptCaseResult,
  type CaseDetail,
} from '@/lib/api';
import type { ConversationMessage } from '@/lib/support/types';
import { getAgentSession } from '@/lib/session';

const AGENT_NAME_KEY = 'nexavoice.agentName';
const POLL_MS = 2500;

const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } = await import('agora-rtc-react');
    return {
      default: function AgoraProviders({ children }: { children: React.ReactNode }) {
        const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        }
        return <AgoraRTCProvider client={clientRef.current}>{children}</AgoraRTCProvider>;
      },
    };
  },
  { ssr: false },
);
const HumanVoiceBridge = dynamic(() => import('./HumanVoiceBridge'), { ssr: false });

type VoiceSession = NonNullable<AcceptCaseResult['voice']>;

export default function CaseWorkspace({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [agentName, setAgentName] = useState('Support Agent');
  const [voice, setVoice] = useState<VoiceSession | null>(null);
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [takeover, setTakeover] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSync = useRef(0);

  useEffect(() => {
    const session = getAgentSession();
    const saved = window.localStorage.getItem(AGENT_NAME_KEY);
    if (session?.name) setAgentName(session.name);
    else if (saved) setAgentName(saved);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await getCase(caseId);
      setDetail(data);
      setMessages(data.messages);
      lastSync.current = data.now;
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case');
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const conversationId = detail?.conversation?.id;
    if (!conversationId) return;
    const tick = async () => {
      try {
        const snap = await getConversation(conversationId, lastSync.current - 1500);
        lastSync.current = snap.now;
        setDetail((prev) =>
          prev ? { ...prev, conversation: snap.conversation, case: snap.case ?? prev.case, now: snap.now } : prev,
        );
        if (snap.messages.length > 0) {
          setMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            snap.messages.forEach((m) => byId.set(m.id, m));
            return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
          });
        }
      } catch {
        // transient
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [detail?.conversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const supportCase = detail?.case;
  const conversation = detail?.conversation;
  const isVoice = supportCase?.mode === 'VOICE';
  const isOpen = supportCase && (supportCase.status === 'WAITING_FOR_HUMAN' || supportCase.status === 'HUMAN_HANDLING');
  const profile = supportCase?.handoff.customer_profile ?? supportCase?.customer ?? null;

  const handleAccept = async () => {
    window.localStorage.setItem(AGENT_NAME_KEY, agentName);
    try {
      const result = await acceptCase(caseId, agentName, getAgentSession()?.email);
      setDetail((prev) => (prev ? { ...prev, case: result.case, conversation: result.conversation } : prev));
      if (result.voice) setVoice(result.voice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept case');
    }
  };

  const handleJoinCall = async () => {
    await handleAccept();
  };

  const handleJoined = useCallback(async () => {
    setVoiceJoined(true);
    if (!voice) return;
    setTakeover('running');
    try {
      const result = await takeoverCase(caseId, voice.uid);
      setTakeover(result.aiStopped ? 'done' : 'failed');
      setDetail((prev) => (prev ? { ...prev, conversation: result.conversation } : prev));
    } catch (err) {
      setTakeover('failed');
      setError(err instanceof Error ? err.message : 'Takeover failed');
    }
  }, [caseId, voice]);

  const handleLeaveCall = () => {
    setVoice(null);
    setVoiceJoined(false);
  };

  const handleSendReply = async () => {
    const content = reply.trim();
    if (!content || !conversation) return;
    setSending(true);
    try {
      const result = await sendMessage(conversation.id, content, 'human_agent');
      setMessages((prev) => [...prev, result.message]);
      setReply('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async () => {
    setResolving(true);
    try {
      const result = await resolveCase(caseId, note.trim() || undefined, voiceJoined);
      setDetail((prev) => (prev ? { ...prev, case: result.case, conversation: result.conversation } : prev));
      setVoice(null);
      setVoiceJoined(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve');
    } finally {
      setResolving(false);
    }
  };

  const orderedMessages = useMemo(() => [...messages].sort((a, b) => a.createdAt - b.createdAt), [messages]);

  if (!detail && !error) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-[hsl(220_10%_50%)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading case…
      </div>
    );
  }
  if (!supportCase) {
    return (
      <div className="p-6 text-red-400">
        {error ?? 'Case not found.'}{' '}
        <Link href="/support-agent" className="underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-4 text-[hsl(220_15%_95%)] lg:h-[calc(100vh-101px)]">
      {/* Left: handoff summary + customer + controls */}
      <aside className="flex w-[34%] min-w-[320px] flex-col gap-4 overflow-y-auto">
        <div className="card p-4">
          <Link href="/support-agent" className="mb-3 inline-flex items-center gap-1 text-xs text-[hsl(220_10%_45%)] hover:text-[hsl(220_15%_75%)]">
            <ArrowLeft className="h-3 w-3" /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            {isVoice ? <Phone className="h-4 w-4 text-emerald-400" /> : <MessageSquare className="h-4 w-4 text-[hsl(191_100%_55%)]" />}
            <h2 className="text-lg font-semibold text-white">{supportCase.handoff.client_name}</h2>
            <span className="ml-auto rounded-full border border-[hsl(222_25%_20%)] bg-[hsl(222_35%_12%)] px-2 py-0.5 text-[11px] text-[hsl(220_10%_60%)]">
              {supportCase.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-1 text-xs text-[hsl(220_10%_45%)]">
            {supportCase.id} · {supportCase.priority} priority · {supportCase.handoff.language}
            {supportCase.assignedTo
              ? ` · ${supportCase.assignedTo}${supportCase.assignedAgentEmail ? ` (${supportCase.assignedAgentEmail})` : ''}`
              : ''}
          </p>

          {supportCase.status === 'WAITING_FOR_HUMAN' && (
            <div className="mt-3 flex gap-2">
              <input
                className="input-field flex-1 py-2 text-sm"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Your name"
              />
              <button
                className="btn-primary px-4"
                style={{ background: 'hsl(142 70% 40%)', color: 'white' }}
                onClick={() => void handleAccept()}
              >
                <Headset className="mr-1.5 h-4 w-4" /> Accept
              </button>
            </div>
          )}

          {supportCase.customerLeftAt && isOpen && (
            <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-xs text-red-200">
              The customer left the {isVoice ? 'call' : 'chat'} before this case was resolved — call them back on{' '}
              {supportCase.customer?.phone ?? 'their registered number'}.
            </p>
          )}
          {isVoice && isOpen && supportCase.status === 'HUMAN_HANDLING' && !voice && !supportCase.customerLeftAt && (
            <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[0.625rem] bg-[hsl(260_60%_60%)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[hsl(260_60%_55%)]" onClick={() => void handleJoinCall()}>
              <Phone className="mr-1.5 h-4 w-4" /> Join the customer&apos;s call
            </button>
          )}
          {voice && (
            <div className="mt-3 space-y-2">
              <AgoraProvider>
                <HumanVoiceBridge
                  channel={voice.channel}
                  token={voice.token}
                  uid={voice.uid}
                  agentUid={voice.agentUid}
                  appId={voice.appId}
                  customerUid={conversation?.customerUid}
                  onJoined={() => void handleJoined()}
                  onLeave={handleLeaveCall}
                />
              </AgoraProvider>
              <p className="text-[11px] text-[hsl(220_10%_45%)]">
                {takeover === 'running' && 'Asking the AI to hand over and leave the channel…'}
                {takeover === 'done' && 'AI agent has left. Only you and the customer are in the call.'}
                {takeover === 'failed' && 'Could not stop the AI agent automatically — check server logs.'}
              </p>
            </div>
          )}

          {isOpen && (
            <div className="mt-4 space-y-2 border-t border-[hsl(222_25%_15%)] pt-3">
              <textarea
                className="input-field h-16"
                placeholder="Resolution note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button variant="outline" className="w-full border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200" onClick={() => void handleResolve()} disabled={resolving}>
                {resolving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                Mark resolved
              </Button>
            </div>
          )}
          {supportCase.status === 'RESOLVED' && (
            <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2 text-xs text-emerald-200">
              Resolved{supportCase.resolutionNote ? ` — ${supportCase.resolutionNote}` : ''}.
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>

        <div className="card p-4 text-sm">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-[hsl(220_10%_45%)] uppercase">AI handoff summary</h3>
          <p className="leading-relaxed text-[hsl(220_15%_85%)]">{supportCase.handoff.summary}</p>
          <dl className="mt-3 space-y-1 text-xs">
            <div>
              <dt className="inline text-[hsl(220_10%_45%)]">Reason: </dt>
              <dd className="inline">{supportCase.handoff.reason_for_escalation}</dd>
            </div>
            <div>
              <dt className="inline text-[hsl(220_10%_45%)]">Intent: </dt>
              <dd className="inline">{supportCase.handoff.intent}</dd>
            </div>
            <div>
              <dt className="inline text-[hsl(220_10%_45%)]">Confidence: </dt>
              <dd className="inline">{Math.round(supportCase.handoff.confidence * 100)}%</dd>
            </div>
          </dl>
          <Bullets title="Information collected" items={supportCase.handoff.information_collected} />
          <Bullets title="Actions taken by AI" items={supportCase.handoff.actions_taken} />
          <Bullets title="Missing information" items={supportCase.handoff.missing_information} />
          {(supportCase.handoff.transcript_excerpt?.length ?? 0) > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold tracking-wide text-[hsl(220_10%_45%)] uppercase">What was said before the handoff</p>
              <ol className="mt-1 space-y-1 border-l border-[hsl(222_25%_15%)] pl-3 text-xs text-[hsl(220_15%_70%)]">
                {supportCase.handoff.transcript_excerpt!.map((line, i) => (
                  <li key={i} className={line.startsWith('Customer:') ? 'text-[hsl(220_15%_90%)]' : 'text-[hsl(220_10%_50%)]'}>
                    {line}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="card p-4 text-sm">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-[hsl(220_10%_45%)] uppercase">Customer</h3>
          {profile ? (
            <dl className="grid grid-cols-[90px_1fr] gap-y-1 text-[hsl(220_15%_80%)]">
              <dt className="text-[hsl(220_10%_45%)]">Name</dt>
              <dd>{profile.name}</dd>
              <dt className="text-[hsl(220_10%_45%)]">Phone</dt>
              <dd>{profile.phone}</dd>
              <dt className="text-[hsl(220_10%_45%)]">Email</dt>
              <dd className="truncate">{profile.email}</dd>
              <dt className="text-[hsl(220_10%_45%)]">City</dt>
              <dd>{profile.city}</dd>
              {profile.address && (
                <>
                  <dt className="text-[hsl(220_10%_45%)]">Address</dt>
                  <dd>{profile.address}</dd>
                </>
              )}
              <dt className="text-[hsl(220_10%_45%)]">Tier</dt>
              <dd className="uppercase">{profile.tier}</dd>
              <dt className="text-[hsl(220_10%_45%)]">Language</dt>
              <dd>{profile.preferredLanguage ?? supportCase.handoff.language}</dd>
              <dt className="text-[hsl(220_10%_45%)]">Discussed</dt>
              <dd>{conversation?.context.orderIds.join(', ') || '—'}</dd>
            </dl>
          ) : (
            <p className="text-[hsl(220_10%_45%)]">The customer was not signed in — ask for their registered mobile number.</p>
          )}
        </div>

        {/* Their orders exactly as they stood when the AI handed the case over. */}
        {(supportCase.handoff.orders?.length ?? 0) > 0 && (
          <div className="card p-4 text-sm">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-[hsl(220_10%_45%)] uppercase">Their orders</h3>
            <ul className="space-y-2">
              {supportCase.handoff.orders!.map((order) => (
                <li key={order.order_id} className="rounded-lg border border-[hsl(222_25%_15%)] bg-[hsl(223_47%_4%)] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[hsl(220_15%_85%)]">{order.order_id}</span>
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                        order.editable
                          ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                          : 'border-[hsl(222_25%_20%)] bg-[hsl(222_35%_12%)] text-[hsl(220_10%_60%)]'
                      }`}
                    >
                      {order.status_text}
                    </span>
                    <span className="ml-auto text-xs text-[hsl(220_15%_85%)]">₹{order.total_inr.toLocaleString('en-IN')}</span>
                  </div>
                  <p className="mt-1 text-xs text-[hsl(220_10%_50%)]">{order.items.join(', ')}</p>
                  <p className="mt-0.5 text-[11px] text-[hsl(220_10%_45%)]">
                    {order.expected_delivery}
                    {order.editable ? ' · items can still be changed' : ' · items are locked'}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* Right: transcript + reply */}
      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-[hsl(222_25%_15%)] bg-[hsl(222_40%_6%)]">
        <div className="flex items-center justify-between border-b border-[hsl(222_25%_15%)] p-3 text-sm">
          <span className="font-semibold text-white">{isVoice ? 'Live call transcript' : 'Chat transcript'}</span>
          {conversation && (
            <span className="text-xs text-[hsl(220_10%_45%)]">
              {conversation.state.replace(/_/g, ' ')}
              {isVoice && conversation.agentState ? ` · AI ${conversation.agentState}` : ''}
            </span>
          )}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {orderedMessages.map((m) => (
            <TranscriptBubble key={m.id} message={m} />
          ))}
          {orderedMessages.length === 0 && <p className="text-center text-sm text-[hsl(220_10%_40%)]">No transcript yet.</p>}
          <div ref={bottomRef} />
        </div>
        {!isVoice && isOpen && (
          <div className="flex gap-2 border-t border-[hsl(222_25%_15%)] p-3">
            <input
              className="flex-1 rounded-xl border border-[hsl(222_25%_15%)] bg-[hsl(223_47%_4%)] px-4 py-2 text-sm text-white transition-colors placeholder:text-[hsl(220_10%_35%)] focus:border-[hsl(191_100%_50%_/_0.4)] focus:outline-none"
              placeholder={supportCase.status === 'HUMAN_HANDLING' ? 'Reply to the customer…' : 'Accept the case to reply'}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSendReply()}
              disabled={supportCase.status !== 'HUMAN_HANDLING' || sending}
            />
            <button
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(260_60%_60%)] text-white transition-colors hover:bg-[hsl(260_60%_55%)] disabled:opacity-50"
              onClick={() => void handleSendReply()}
              disabled={supportCase.status !== 'HUMAN_HANDLING' || sending || !reply.trim()}
              aria-label="Send reply"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-xs text-[hsl(220_10%_45%)]">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[hsl(220_10%_35%)]">—</p>
      ) : (
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-[hsl(220_15%_80%)]">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TranscriptBubble({ message }: { message: ConversationMessage }) {
  if (message.role === 'system') {
    return <p className="text-center text-[11px] text-[hsl(220_10%_45%)]">{message.content}</p>;
  }
  const mine = message.role === 'human_agent';
  const ai = message.role === 'ai';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && (
        <div className={`mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ai ? 'border border-[hsl(191_100%_50%_/_0.2)] bg-[hsl(191_100%_50%_/_0.12)] text-[hsl(191_100%_55%)]' : 'border border-[hsl(222_25%_25%)] bg-[hsl(222_35%_15%)] text-[hsl(220_15%_70%)]'}`}>
          {ai ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
        </div>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${
          mine
            ? 'bg-[hsl(260_55%_45%)] text-white'
            : ai
              ? 'bg-[hsl(222_35%_10%)] text-[hsl(220_15%_85%)] border border-[hsl(222_25%_16%)]'
              : 'bg-[hsl(222_40%_7%)] border border-[hsl(222_25%_20%)] text-[hsl(220_15%_90%)]'
        }`}
      >
        <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-60">
          {mine ? 'You' : ai ? 'Nexa (AI)' : 'Customer'} · {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        {message.content}
      </div>
    </div>
  );
}
