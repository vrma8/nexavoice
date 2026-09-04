/**
 * Optional demo data for the support store.
 *
 * The dashboard is empty until someone actually chats or calls, which makes a fresh
 * deployment look broken. Setting `NEXAVOICE_SEED=demo` writes a small, realistic
 * fixture into whatever durable backend is active (PostgreSQL, or in-memory when no
 * database is configured) the first time any support route runs, so the queue, the
 * handoff summary, the tool audit trail and a resolved voice case are all visible
 * immediately.
 *
 * Three properties matter more than the content:
 *
 *  1. **It runs on the deployment's own credentials.** Seeding happens inside the app,
 *     so nobody has to hand a `BLOB_READ_WRITE_TOKEN` to a script or a laptop.
 *  2. **Fixed conversation ids.** Two cold instances can seed concurrently on a
 *     serverless platform; because every record has the same id in both, the snapshot
 *     merge in `snapshot.ts` collapses them into one set instead of doubling it.
 *  3. **It never overwrites live data.** A record that already exists is left alone, so
 *     re-enabling the flag later (or a redeploy) cannot clobber a real conversation,
 *     and turning it off later changes nothing.
 *
 * Demo conversations reference the same customers/orders as `lib/shop/data.ts`, so a
 * human agent can open a seeded case and the order numbers actually resolve.
 */
import {
  acceptCase,
  appendMessage,
  appendToolAudit,
  createCase,
  createConversation,
  getCase,
  getConversation,
  listConversations,
  listEvents,
  listMessages,
  resolveCase,
  updateConversation,
} from './store';
import type { HandoffSummary } from './types';

/** Any truthy value except these turns the feature off. */
const OFF = new Set(['', '0', 'false', 'off', 'no']);

export function seedEnabled(): boolean {
  return !OFF.has((process.env.NEXAVOICE_SEED ?? '').trim().toLowerCase());
}

export interface SeedResult {
  /** Ids of the conversations this call created. */
  created: string[];
  skipped: boolean;
  reason?: string;
}

export interface SeedStatus extends SeedResult {
  requested: boolean;
  error: string | null;
}

let attempted = false;
let last: SeedStatus = { requested: seedEnabled(), created: [], skipped: false, error: null };

export function getSeedStatus(): SeedStatus {
  return last;
}

/** Test seam: forget that this process already seeded. */
export function resetSeedState(): void {
  attempted = false;
  last = { requested: seedEnabled(), created: [], skipped: false, error: null };
}

/**
 * Called from `withStore()` before the handler runs. One attempt per process, errors
 * swallowed into `getSeedStatus()`: demo data must never take down a real conversation,
 * and `/api/health` is where a failure is meant to be read.
 */
export async function maybeSeedDemoData(): Promise<void> {
  if (attempted) return;
  attempted = true;
  last = { ...last, requested: true };
  if (!seedEnabled()) {
    last = { requested: false, created: [], skipped: true, reason: 'NEXAVOICE_SEED not set', error: null };
    return;
  }
  try {
    const result = seedDemoData({ onlyIfEmpty: true });
    last = { ...result, requested: true, error: null };
  } catch (error) {
    last = {
      requested: true,
      created: [],
      skipped: true,
      reason: 'seeding failed',
      error: error instanceof Error ? error.message : String(error),
    };
    console.warn('[seed] demo data not written:', last.error);
  }
}

/**
 * Creates any missing fixture record. Per-record, so it can never overwrite a
 * conversation that already exists — including a demo one a human deliberately
 * resolved or cleaned up.
 *
 * `onlyIfEmpty` is what the automatic (route) path uses: seed a blank deployment once,
 * then leave the store alone forever. Without it, the 24-hour pruning of finished
 * conversations would resurrect the demo data on the next cold start, and a store that
 * has real traffic would get demo records pushed into it after the fact.
 */
export function seedDemoData(options: { onlyIfEmpty?: boolean } = {}): SeedResult {
  if (options.onlyIfEmpty && listConversations().length > 0) {
    return { created: [], skipped: true, reason: 'store already has data' };
  }

  const created: string[] = [];
  for (const demo of demos()) {
    if (getConversation(demo.id)) continue;
    build(demo);
    created.push(demo.id);
  }

  if (!created.length) {
    return { created, skipped: true, reason: 'demo records already present' };
  }
  return { created, skipped: false };
}

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

const MINUTE = 60 * 1000;

interface DemoTurn {
  role: 'user' | 'ai' | 'human_agent';
  content: string;
  turnId?: number;
}

interface Demo {
  id: string;
  minutesAgo: number;
  mode: 'CHAT' | 'VOICE';
  channel?: string;
  customerUid?: string;
  agentId?: string;
  humanUid?: string;
  humanAgentName?: string;
  context: Parameters<typeof updateConversation>[1]['context'];
  turns: DemoTurn[];
  audit: Array<{ tool: string; args: Record<string, unknown>; summary: string; write: boolean }>;
  case?: {
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    acceptedBy?: string;
    resolutionNote?: string;
    handoff: Omit<HandoffSummary, 'conversation_id'>;
  };
}

function demos(): Demo[] {
  return [
    {
      // A live AI chat: the dashboard should show it under "active" with the transcript.
      id: 'conv_demo_active_chat',
      minutesAgo: 12,
      mode: 'CHAT',
      context: {
        language: 'english',
        intent: 'order_status',
        customerName: 'Priya Nair',
        orderIds: ['NM-10030'],
        confidence: 0.9,
        missingInformation: [],
        confirmedInformation: ['registered mobile 9123456780'],
      },
      turns: [
        {
          role: 'user',
          content: 'Hi, my saree order NM-10030 was supposed to arrive today. Where is it?',
        },
        {
          role: 'ai',
          content:
            "Thanks, Priya! Order NM-10030 (1 x Banarasi Silk Saree (Blue)) is out for delivery — the courier is scheduled for today, 6–9 pm. Anything else I can check for you?",
        },
      ],
      audit: [
        { tool: 'verify_customer', args: { phone: '9123456780' }, summary: 'Verified Priya Nair', write: false },
        { tool: 'get_order_status', args: { orderId: 'NM-10030' }, summary: 'Order NM-10030 is OUT_FOR_DELIVERY', write: false },
      ],
    },
    {
      // An escalated chat waiting for a human, with the handoff summary filled in.
      id: 'conv_demo_waiting_case',
      minutesAgo: 55,
      mode: 'CHAT',
      context: {
        language: 'hinglish',
        intent: 'refund',
        customerName: 'Rahul Sharma',
        orderIds: ['NM-10023'],
        confidence: 0.4,
        missingInformation: ['whether the box and invoice are available'],
        confirmedInformation: ['registered mobile 9876543210', 'order NM-10023 delivered on 2026-08-31'],
      },
      turns: [
        {
          role: 'user',
          content: 'Jo headphones maine order kiye the (NM-10023), unme se ek side se awaaz nahi aa rahi. Mujhe refund chahiye.',
        },
        {
          role: 'ai',
          content:
            "I'm sorry the NexaSound Bluetooth Headphones arrived faulty. Since they were delivered on 31 Aug, a replacement is still within the 7-day window — would you like me to book that, or do you want a refund only?",
        },
        {
          role: 'user',
          content: 'Refund only. Replacement mein phir se wahi problem aa gayi toh? Please escalate.',
        },
      ],
      audit: [
        { tool: 'verify_customer', args: { phone: '9876543210' }, summary: 'Verified Rahul Sharma', write: false },
        { tool: 'get_order_status', args: { orderId: 'NM-10023' }, summary: 'Order NM-10023 is DELIVERED', write: false },
        {
          tool: 'escalate_to_human',
          args: { reason: 'Customer wants a refund for a faulty item, declined replacement' },
          summary: 'Escalated to a human agent',
          write: true,
        },
      ],
      case: {
        priority: 'HIGH',
        handoff: {
          mode: 'chat',
          language: 'hinglish',
          client_name: 'Rahul Sharma',
          intent: 'refund',
          summary:
            'Rahul received NM-10023 (NexaSound Bluetooth Headphones, ₹3,999) with one side not working. He declined the replacement offer and wants a refund only. Order is 4 days past delivery, inside the 7-day window.',
          information_collected: [
            'Mobile 9876543210 verified',
            'Order NM-10023, delivered 31 Aug',
            'Fault: left channel silent',
          ],
          actions_taken: ['Looked up order status', 'Offered replacement (declined)'],
          reason_for_escalation: 'Customer wants a refund for a faulty item — needs finance approval',
          confidence: 0.4,
          missing_information: ['Whether the box and invoice are available for pickup'],
        },
      },
    },
    {
      // A voice call that a human already resolved: proves the voice path of the
      // dashboard (transcript turns, human replies, resolution note) renders.
      id: 'conv_demo_voice_resolved',
      minutesAgo: 180,
      mode: 'VOICE',
      channel: 'nv-demo-voice-call',
      customerUid: '123456',
      agentId: 'demo-agent-not-running',
      humanUid: '654321',
      humanAgentName: 'Kavya R.',
      context: {
        language: 'hindi',
        intent: 'address_change',
        customerName: 'Amit Verma',
        orderIds: ['NM-10035'],
        confidence: 0.8,
        missingInformation: [],
        confirmedInformation: ['registered mobile 9988776655'],
      },
      turns: [
        {
          role: 'user',
          content: 'मेरा ऑर्डर NM-10035 अभी packed है। क्या मैंका पता बदल सकते हैं?',
          turnId: 1,
        },
        {
          role: 'ai',
          content:
            'मैं पता बदलने के लिए तैयार हूँ, Amit जी। कृपया नया पूरा पता बताइए। मैं तब तक कुछ बदलूँगी नहीं, पहले आपकी पुष्टि लूँगी।',
          turnId: 1,
        },
        {
          role: 'user',
          content: 'नया पता: H-14, Gomti Nagar, Lucknow 226010।',
          turnId: 2,
        },
        {
          role: 'human_agent',
          content:
            'यहाँ Kavya बोल रही हूँ। आपका पता बदल दिया है — NM-10035 अब H-14, Gomti Nagar, Lucknow 226010 पर भेजा जाएगा।',
          turnId: 3,
        },
      ],
      audit: [
        { tool: 'verify_customer', args: { phone: '9988776655' }, summary: 'Verified Amit Verma', write: false },
        {
          tool: 'update_shipping_address',
          args: { orderId: 'NM-10035' },
          summary: 'Address updated before dispatch',
          write: true,
        },
      ],
      case: {
        priority: 'LOW',
        acceptedBy: 'Kavya R.',
        resolutionNote: 'Address updated for NM-10035 and confirmed with the customer on the call.',
        handoff: {
          mode: 'voice',
          language: 'hindi',
          client_name: 'Amit Verma',
          intent: 'address_change',
          summary:
            'Amit called to change the delivery address on NM-10035 (packed, not yet shipped). AI collected the new address and handed over so a human could apply the change in the warehouse system.',
          information_collected: ['Mobile 9988776655 verified', 'New address collected on the call'],
          actions_taken: ['Collected new address', 'Transferred the call to a human agent'],
          reason_for_escalation: 'Address changes on packed orders need warehouse access',
          confidence: 0.8,
          missing_information: [],
        },
      },
    },
  ];
}

function build(demo: Demo): void {
  const base = Date.now() - demo.minutesAgo * MINUTE;
  const conversation = createConversation({
    id: demo.id,
    mode: demo.mode,
    channel: demo.channel,
    customerUid: demo.customerUid,
  });

  for (const turn of demo.turns) {
    appendMessage(conversation.id, turn.role, turn.content, { turnId: turn.turnId });
  }

  updateConversation(conversation.id, {
    ...(demo.agentId ? { agentId: demo.agentId } : {}),
    ...(demo.humanUid ? { humanUid: demo.humanUid } : {}),
    ...(demo.humanAgentName ? { humanAgentName: demo.humanAgentName } : {}),
    ...(demo.mode === 'VOICE' ? { agentState: 'left' } : {}),
    context: demo.context ?? {},
  });

  for (const entry of demo.audit) {
    appendToolAudit(conversation.id, {
      tool: entry.tool,
      args: entry.args,
      ok: true,
      summary: entry.summary,
      write: entry.write,
    });
  }

  let caseId: string | undefined;
  if (demo.case) {
    const created = createCase({
      conversationId: conversation.id,
      priority: demo.case.priority,
      handoff: { conversation_id: conversation.id, ...demo.case.handoff },
    });
    caseId = created?.id;
    // The waiting case needs the "here is your case number" turn the real
    // escalation path appends, and it has to exist before the timestamps below.
    if (created && !demo.case.acceptedBy) {
      appendMessage(
        conversation.id,
        'ai',
        `I've created case ${created.id} and a human support agent will continue this chat here.`,
      );
    }
    if (created && demo.case.acceptedBy) {
      acceptCase(created.id, demo.case.acceptedBy);
      if (demo.case.resolutionNote) resolveCase(created.id, demo.case.resolutionNote);
    }
  }

  // Every function above stamps `Date.now()`, so the whole record set is moved back in
  // time at the end — otherwise the dashboard reads "5 conversations, all just now".
  const messages = listMessages(conversation.id);
  messages.forEach((message, index) => {
    message.createdAt = base + index * 45 * 1000;
    // `appendMessage` mints a random id per call, and `mergeSnapshots` keys messages by
    // id — so two instances that seed at the same moment would each contribute a full
    // copy of the transcript. Fixed ids make the merge collapse them into one.
    message.id = `${conversation.id}-m${index}`;
  });
  // Same trick for the dashboard timeline: events are merged by id, so give the seeded
  // ones stable ids and space them inside the conversation window.
  const seededEvents = listEvents().filter((event) => event.conversationId === conversation.id);
  seededEvents.forEach((event, index) => {
    event.id = `${conversation.id}:${event.type}:${event.detail ?? ''}`;
    event.at = base + index * 10 * 1000;
  });

  const lastTurn = base + Math.max(0, messages.length - 1) * 45 * 1000;
  conversation.createdAt = base;
  conversation.lastActivityAt = lastTurn;
  conversation.updatedAt = lastTurn;
  for (const entry of conversation.toolAudit) entry.at = base + 20 * 1000;

  if (conversation.state === 'RESOLVED' || conversation.state === 'CLOSED') {
    conversation.endedAt = lastTurn + 2 * MINUTE;
    conversation.updatedAt = conversation.endedAt;
  }

  if (caseId) {
    const supportCase = getCase(caseId);
    if (supportCase) {
      supportCase.createdAt = base + 30 * 1000;
      if (supportCase.acceptedAt) supportCase.acceptedAt = base + 60 * 1000;
      if (supportCase.resolvedAt) supportCase.resolvedAt = conversation.endedAt ?? lastTurn + MINUTE;
      supportCase.updatedAt = supportCase.resolvedAt ?? lastTurn;
    }
  }
}
