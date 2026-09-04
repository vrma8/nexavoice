/**
 * Shared, mode-independent tool layer (v1.md §32–§33).
 *
 * The same `executeTool()` serves:
 *   1. Agora Conversational AI voice sessions — the engine's LLM calls our
 *      REST tool endpoints (`/api/agent-tools/<tool>`) declared in
 *      `lib/agent-tools.ts`.
 *   2. The chat / custom-LLM path (`/api/chat/*`) — the server-side LLM loop
 *      executes the same functions in-process.
 *
 * Rules enforced here (not left to the prompt):
 *   - Every order operation requires a verified customer on the conversation
 *     (`verify_customer` first). The LLM cannot pass a customer id itself.
 *   - Write tools (`cancel_order`, `update_shipping_address`, `request_return`)
 *     require `confirmed: true`, which the prompt instructs the model to set
 *     only after the customer explicitly said yes. Missing confirmation returns
 *     a structured "ask for confirmation" result instead of mutating anything.
 *   - Every call is written to the conversation audit trail so the human
 *     dashboard can show exactly what the AI did.
 */
import * as shop from '@/lib/shop/service';
import {
  appendToolAudit,
  createCase,
  getConversation,
  recordEvent,
  updateConversation,
} from './store';
import type { Conversation, HandoffSummary } from './types';

export const TOOL_NAMES = [
  'verify_customer',
  'get_order_status',
  'list_recent_orders',
  'cancel_order',
  'update_shipping_address',
  'request_return',
  'create_ticket',
  'escalate_to_human',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: JsonSchemaObject;
  /** Mutates demo backend data. */
  write: boolean;
}

/**
 * Tool definitions — the single source of truth for both the Agora REST tool
 * declarations and the chat-path function schema.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'verify_customer',
    description:
      'Look up the customer by the mobile number they told you. Call this before any order question. ' +
      'Returns the customer profile when found. Always read back the name to confirm identity.',
    parameters: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Mobile number spoken/typed by the customer, digits only if possible (10 digits, India).',
        },
      },
      required: ['phone'],
    },
    write: false,
  },
  {
    name: 'get_order_status',
    description:
      'Get status, delivery date, tracking and what actions are allowed for one order of the verified customer.',
    parameters: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'Order number like NM-10023 (customers may say only the digits, e.g. "10023").',
        },
      },
      required: ['order_id'],
    },
    write: false,
  },
  {
    name: 'list_recent_orders',
    description:
      'List the verified customer\'s most recent orders when they do not remember the order number.',
    parameters: {
      type: 'object',
      properties: {},
    },
    write: false,
  },
  {
    name: 'cancel_order',
    description:
      'Cancel an order that has not shipped yet. Only call with confirmed=true after the customer explicitly said yes to cancelling this specific order. ' +
      'Refund for prepaid orders is initiated automatically.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order number to cancel.' },
        reason: { type: 'string', description: 'Short reason in English, as stated by the customer.' },
        confirmed: {
          type: 'boolean',
          description: 'true only if the customer clearly confirmed the cancellation in their last message.',
        },
      },
      required: ['order_id', 'reason', 'confirmed'],
    },
    write: true,
  },
  {
    name: 'update_shipping_address',
    description:
      'Change the delivery address of an order that has not shipped yet. Read the full new address back to the customer and only call with confirmed=true after they say it is correct.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order number to update.' },
        new_address: {
          type: 'string',
          description: 'Complete new address including house/flat, street/area, city and 6-digit PIN code.',
        },
        confirmed: {
          type: 'boolean',
          description: 'true only if the customer confirmed the exact new address.',
        },
      },
      required: ['order_id', 'new_address', 'confirmed'],
    },
    write: true,
  },
  {
    name: 'request_return',
    description:
      'Start a return + refund for a delivered order within the 7-day return window. Only call with confirmed=true after the customer agrees to a pickup.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Delivered order number.' },
        reason: { type: 'string', description: 'Reason for return (damaged, wrong item, size issue, not needed…).' },
        confirmed: { type: 'boolean', description: 'true only if the customer confirmed the return.' },
      },
      required: ['order_id', 'reason', 'confirmed'],
    },
    write: true,
  },
  {
    name: 'create_ticket',
    description:
      'Create a support ticket for issues you cannot fix directly (courier complaint, missing item, payment query, feedback). Tell the customer the ticket number.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'One of: delivery_delay, damaged_item, missing_item, payment_issue, refund_status, feedback, other.',
        },
        summary: { type: 'string', description: 'One or two sentences in English describing the issue.' },
        order_id: { type: 'string', description: 'Related order number, if any.' },
      },
      required: ['category', 'summary'],
    },
    write: true,
  },
  {
    name: 'escalate_to_human',
    description:
      'Hand the conversation to a human support agent. Use when the customer asks for a human, is upset, disputes a policy, you lack information after two attempts, or a tool failed. ' +
      'After calling this, tell the customer a human agent is joining shortly and stop taking actions.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why a human is needed (English, one sentence).' },
        intent: {
          type: 'string',
          description: 'Customer intent, e.g. order_status, cancellation, refund, return, address_change, complaint, other.',
        },
        summary: {
          type: 'string',
          description: '2-3 sentence English summary of the conversation so far for the human agent.',
        },
        customer_name: { type: 'string', description: 'Customer name if known.' },
        language: { type: 'string', description: 'Language the customer is using: hindi, english or hinglish.' },
        confidence: {
          type: 'number',
          description: 'Your confidence (0-1) that you understood the customer\'s problem correctly.',
        },
        information_collected: {
          type: 'array',
          items: { type: 'string' },
          description: 'Facts you already collected (e.g. "phone number", "order NM-10023").',
        },
        missing_information: {
          type: 'array',
          items: { type: 'string' },
          description: 'What you could not confirm.',
        },
      },
      required: ['reason', 'summary'],
    },
    write: true,
  },
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name.toLowerCase());
}

export type ToolArgs = Record<string, unknown>;

export interface ToolResult {
  ok: boolean;
  /** Payload handed back to the LLM (plain JSON). */
  result: Record<string, unknown>;
  /** One-line description for the audit trail / dashboard. */
  summary: string;
}

function str(args: ToolArgs, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
}

function bool(args: ToolArgs, key: string): boolean {
  const value = args[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
}

function strArray(args: ToolArgs, key: string): string[] {
  const value = args[key];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    // REST tool bodies flatten arrays to strings sometimes.
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      return value.split(/[,;]\s*/).filter(Boolean);
    }
  }
  return [];
}

function needsVerifiedCustomer(conversation: Conversation): ToolResult | null {
  if (conversation.context.customer) return null;
  return {
    ok: false,
    result: {
      error: 'CUSTOMER_NOT_VERIFIED',
      message:
        'No verified customer on this conversation. Ask the customer for their registered mobile number and call verify_customer first.',
    },
    summary: 'Blocked: customer not verified',
  };
}

function needsConfirmation(action: string, details: Record<string, unknown>): ToolResult {
  return {
    ok: false,
    result: {
      error: 'CONFIRMATION_REQUIRED',
      message: `Do not ${action} yet. Repeat the exact details to the customer, ask "Should I go ahead?" and call again with confirmed=true only after they say yes.`,
      ...details,
    },
    summary: `Awaiting customer confirmation to ${action}`,
  };
}

/**
 * Executes a tool against a conversation. Never throws for business errors —
 * those are returned as structured results so the LLM can explain them.
 */
export async function executeTool(
  conversationId: string,
  name: string,
  rawArgs: ToolArgs,
): Promise<ToolResult> {
  const conversation = getConversation(conversationId);
  if (!conversation) {
    return {
      ok: false,
      result: { error: 'CONVERSATION_NOT_FOUND', message: 'Unknown conversation id.' },
      summary: 'Unknown conversation',
    };
  }
  const definition = getToolDefinition(name);
  if (!definition) {
    return {
      ok: false,
      result: { error: 'UNKNOWN_TOOL', message: `Tool ${name} is not available.` },
      summary: `Unknown tool ${name}`,
    };
  }
  if (
    definition.name !== 'escalate_to_human' &&
    (conversation.state === 'WAITING_FOR_HUMAN' || conversation.state === 'HUMAN_HANDLING')
  ) {
    return {
      ok: false,
      result: {
        error: 'HANDED_OFF',
        message: 'This conversation has been escalated. Do not take further actions; a human agent is handling it.',
      },
      summary: 'Blocked: conversation handed off to human',
    };
  }

  const args = rawArgs ?? {};
  let outcome: ToolResult;
  try {
    outcome = await run(conversation, definition.name, args);
  } catch (error) {
    outcome = {
      ok: false,
      result: {
        error: 'TOOL_FAILED',
        message: error instanceof Error ? error.message : 'Tool execution failed.',
      },
      summary: 'Tool crashed',
    };
  }

  appendToolAudit(conversation.id, {
    tool: definition.name,
    args: sanitizeArgs(args),
    ok: outcome.ok,
    summary: outcome.summary,
    write: definition.write && outcome.ok,
  });
  return outcome;
}

function sanitizeArgs(args: ToolArgs): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === 'phone' && typeof value === 'string') {
      const normalized = shop.normalizePhone(value);
      copy[key] = normalized ? shop.maskPhone(normalized) : '****';
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

async function run(conversation: Conversation, name: ToolName, args: ToolArgs): Promise<ToolResult> {
  switch (name) {
    case 'verify_customer': {
      const phone = str(args, 'phone');
      const customer = shop.findCustomerByPhone(phone);
      if (!customer) {
        return {
          ok: false,
          result: {
            error: 'CUSTOMER_NOT_FOUND',
            message:
              'No NexaMart account matches this mobile number. Ask the customer to repeat the number digit by digit; if it still fails, offer to escalate.',
          },
          summary: `No customer for ${phone ? shop.maskPhone(shop.normalizePhone(phone) ?? phone) : 'empty phone'}`,
        };
      }
      const snapshot = shop.toCustomerSnapshot(customer);
      updateConversation(conversation.id, {
        context: {
          customer: snapshot,
          customerName: customer.name,
          confirmedInformation: uniq([...conversation.context.confirmedInformation, 'phone number', 'customer identity']),
          missingInformation: conversation.context.missingInformation.filter((m) => m !== 'phone number'),
        },
      });
      const recent = shop.listOrdersForCustomer(customer.id, 3).map(shop.summarizeOrder);
      return {
        ok: true,
        result: {
          customer: {
            name: customer.name,
            city: customer.city,
            tier: customer.tier,
            preferred_language: customer.preferredLanguage,
            phone_last4: customer.phone.slice(-4),
          },
          recent_orders: recent.map((o) => ({
            order_id: o.order_id,
            status: o.status,
            items: o.items,
            expected_delivery: o.expected_delivery,
          })),
          instruction: 'Greet the customer by name and confirm you are speaking with them before sharing order details.',
        },
        summary: `Verified ${customer.name} (${shop.maskPhone(customer.phone)})`,
      };
    }

    case 'list_recent_orders': {
      const blocked = needsVerifiedCustomer(conversation);
      if (blocked) return blocked;
      const orders = shop.listOrdersForCustomer(conversation.context.customer!.id, 5).map(shop.summarizeOrder);
      return {
        ok: true,
        result: { orders },
        summary: `Listed ${orders.length} orders`,
      };
    }

    case 'get_order_status': {
      const blocked = needsVerifiedCustomer(conversation);
      if (blocked) return blocked;
      const orderId = str(args, 'order_id');
      const found = shop.getOrderForCustomer(conversation.context.customer!.id, orderId);
      if (!found.ok) {
        return { ok: false, result: found.error, summary: `Order ${shop.normalizeOrderId(orderId)} not found` };
      }
      trackOrder(conversation, found.data.id);
      return {
        ok: true,
        result: { order: shop.summarizeOrder(found.data) },
        summary: `Status of ${found.data.id}: ${found.data.status}`,
      };
    }

    case 'cancel_order': {
      const blocked = needsVerifiedCustomer(conversation);
      if (blocked) return blocked;
      const orderId = str(args, 'order_id');
      const reason = str(args, 'reason') || 'customer request';
      if (!bool(args, 'confirmed')) {
        const preview = shop.getOrderForCustomer(conversation.context.customer!.id, orderId);
        return needsConfirmation('cancel the order', {
          order: preview.ok ? shop.summarizeOrder(preview.data) : undefined,
          lookup_error: preview.ok ? undefined : preview.error,
        });
      }
      const result = shop.cancelOrder(conversation.context.customer!.id, orderId, reason);
      if (!result.ok) {
        return { ok: false, result: result.error, summary: `Cancel ${shop.normalizeOrderId(orderId)} refused: ${result.error.code}` };
      }
      trackOrder(conversation, result.data.order_id);
      return {
        ok: true,
        result: {
          order: result.data,
          message:
            result.data.payment_method === 'COD'
              ? 'Order cancelled. No payment was taken.'
              : 'Order cancelled. Refund initiated to the original payment method within 5-7 business days.',
        },
        summary: `Cancelled ${result.data.order_id} (${reason})`,
      };
    }

    case 'update_shipping_address': {
      const blocked = needsVerifiedCustomer(conversation);
      if (blocked) return blocked;
      const orderId = str(args, 'order_id');
      const newAddress = str(args, 'new_address');
      if (!bool(args, 'confirmed')) {
        return needsConfirmation('change the address', { order_id: shop.normalizeOrderId(orderId), new_address: newAddress });
      }
      const result = shop.updateShippingAddress(conversation.context.customer!.id, orderId, newAddress);
      if (!result.ok) {
        return { ok: false, result: result.error, summary: `Address change for ${shop.normalizeOrderId(orderId)} refused: ${result.error.code}` };
      }
      trackOrder(conversation, result.data.order_id);
      return {
        ok: true,
        result: { order: result.data, message: 'Shipping address updated.' },
        summary: `Updated address on ${result.data.order_id}`,
      };
    }

    case 'request_return': {
      const blocked = needsVerifiedCustomer(conversation);
      if (blocked) return blocked;
      const orderId = str(args, 'order_id');
      const reason = str(args, 'reason') || 'not specified';
      if (!bool(args, 'confirmed')) {
        return needsConfirmation('start the return', { order_id: shop.normalizeOrderId(orderId), reason });
      }
      const result = shop.requestReturn(conversation.context.customer!.id, orderId, reason);
      if (!result.ok) {
        return { ok: false, result: result.error, summary: `Return for ${shop.normalizeOrderId(orderId)} refused: ${result.error.code}` };
      }
      trackOrder(conversation, result.data.order_id);
      return {
        ok: true,
        result: {
          order: result.data,
          message: 'Return requested. Pickup within 2 days; refund after the item reaches the warehouse.',
        },
        summary: `Return requested for ${result.data.order_id} (${reason})`,
      };
    }

    case 'create_ticket': {
      const category = str(args, 'category') || 'other';
      const summary = str(args, 'summary');
      if (!summary) {
        return {
          ok: false,
          result: { error: 'SUMMARY_REQUIRED', message: 'Provide a one-sentence summary of the issue.' },
          summary: 'Ticket rejected: no summary',
        };
      }
      const orderId = str(args, 'order_id') || undefined;
      const ticket = shop.createTicket({
        customerId: conversation.context.customer?.id,
        conversationId: conversation.id,
        orderId,
        category,
        summary,
      });
      updateConversation(conversation.id, { context: { intent: conversation.context.intent ?? category } });
      return {
        ok: true,
        result: {
          ticket_id: ticket.id,
          status: ticket.status,
          message: `Ticket ${ticket.id} created. Our team responds within 24 hours.`,
        },
        summary: `Created ${ticket.id} (${ticket.category})`,
      };
    }

    case 'escalate_to_human': {
      const handoff = buildHandoffSummary(conversation, args);
      const supportCase = createCase({ conversationId: conversation.id, handoff });
      if (!supportCase) {
        return {
          ok: false,
          result: { error: 'ESCALATION_FAILED', message: 'Could not create the case. Apologise and ask the customer to call back.' },
          summary: 'Escalation failed',
        };
      }
      updateConversation(conversation.id, {
        context: {
          intent: handoff.intent,
          language: handoff.language,
          confidence: handoff.confidence,
          missingInformation: handoff.missing_information,
        },
      });
      recordEvent(conversation.id, 'escalation.requested', supportCase.id);
      return {
        ok: true,
        result: {
          case_id: supportCase.id,
          status: supportCase.status,
          message:
            conversation.mode === 'VOICE'
              ? 'Case created. Tell the customer to stay on the line: a human agent will join this call shortly. Then stop and wait silently.'
              : 'Case created. Tell the customer a human agent will continue in this chat shortly.',
        },
        summary: `Escalated → ${supportCase.id} (${handoff.reason_for_escalation})`,
      };
    }
  }
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function trackOrder(conversation: Conversation, orderId: string) {
  if (!conversation.context.orderIds.includes(orderId)) {
    updateConversation(conversation.id, {
      context: { orderIds: [...conversation.context.orderIds, orderId] },
    });
  }
}

export function buildHandoffSummary(conversation: Conversation, args: ToolArgs): HandoffSummary {
  const confidenceRaw = Number(args.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : 0.5;
  const actionsTaken = conversation.toolAudit
    .filter((a) => a.tool !== 'escalate_to_human')
    .map((a) => `${a.ok ? '' : '(failed) '}${a.summary}`)
    .slice(-8);
  const collected = uniq([
    ...conversation.context.confirmedInformation,
    ...strArray(args, 'information_collected'),
    ...(conversation.context.customer ? [`customer: ${conversation.context.customer.name}`] : []),
    ...conversation.context.orderIds.map((id) => `order ${id}`),
  ]);
  const missing = uniq([...conversation.context.missingInformation, ...strArray(args, 'missing_information')]);
  return {
    conversation_id: conversation.id,
    mode: conversation.mode === 'VOICE' ? 'voice' : 'chat',
    language: str(args, 'language') || conversation.context.language || 'unknown',
    client_name: str(args, 'customer_name') || conversation.context.customerName || 'Unknown',
    intent: str(args, 'intent') || conversation.context.intent || 'unknown',
    summary: str(args, 'summary') || 'Customer requested a human agent.',
    information_collected: collected,
    actions_taken: actionsTaken,
    reason_for_escalation: str(args, 'reason') || 'Customer requested a human agent',
    confidence,
    missing_information: missing,
  };
}
