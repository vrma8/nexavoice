/**
 * Shared, mode-independent tool layer.
 *
 * The same `executeTool()` serves:
 *   1. Agora Conversational AI voice sessions — the engine's LLM calls our REST
 *      tool endpoints (`/api/agent-tools/<tool>`) declared in `lib/agent-tools.ts`.
 *   2. The chat / custom-LLM path (`/api/chat/*`) and the rule-based fallback
 *      agent — they execute the same functions in-process.
 *
 * Rules enforced here (not left to the prompt):
 *   - Every call is scoped to the **signed-in client** attached to the
 *     conversation. The model never passes a customer id, so it cannot read or
 *     change another person's orders.
 *   - Write tools (`add_item_to_order`, `remove_item_from_order`,
 *     `cancel_order`, `update_shipping_address`) require `confirmed: true`,
 *     which the prompt only allows after an explicit yes from the customer.
 *   - Items may only be changed while the order is still PLACED — enforced in
 *     `lib/shop/service.ts`, so the UI and the agent obey the same rule.
 *   - Every call is written to the conversation audit trail, so the human
 *     dashboard shows exactly what the AI did.
 */
import * as shop from '@/lib/shop/service';
import { LANGUAGE_CONFIRM_MESSAGE, normalizeLanguageName } from '@/lib/agent-prompt';
import {
  appendToolAudit,
  createCase,
  getConversation,
  listMessages,
  recordEvent,
  updateConversation,
} from './store';
import type { Conversation, HandoffSummary } from './types';

export const TOOL_NAMES = [
  'get_customer_context',
  'search_products',
  'list_recent_orders',
  'get_order_status',
  'get_cart_status',
  'add_item_to_cart',
  'remove_item_from_cart',
  'set_cart_item_quantity',
  'replace_cart_item',
  'clear_cart',
  'place_order',
  'add_item_to_order',
  'remove_item_from_order',
  'replace_item_in_order',
  'cancel_order',
  'update_shipping_address',
  'set_preferred_language',
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
  /** Mutates order data. */
  write: boolean;
}

const CONFIRMED_PROP = {
  type: 'boolean',
  description:
    'Set to true ONLY after the customer explicitly agreed in this conversation. Leave false to preview the change.',
};

/**
 * Tool definitions — the single source of truth for the Agora REST tool
 * declarations and for the chat-path function schema.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_customer_context',
    description:
      'Who you are talking to and what they bought: the signed-in customer profile plus their recent orders with live status. ' +
      'Call this first if you need the customer name, delivery address or order numbers.',
    parameters: { type: 'object', properties: {} },
    write: false,
  },
  {
    name: 'get_cart_status',
    description: 'Get the current items and total of the signed-in customer\'s shopping cart.',
    parameters: { type: 'object', properties: {} },
    write: false,
  },
  {
    name: 'add_item_to_cart',
    description: 'Add a catalogue product to the customer\'s shopping cart.',
    parameters: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product SKU or title from search_products.' },
        quantity: { type: 'number', description: 'How many to add (default 1).' },
        confirmed: CONFIRMED_PROP,
      },
      required: ['product'],
    },
    write: true,
  },
  {
    name: 'remove_item_from_cart',
    description: 'Remove a product from the customer\'s shopping cart.',
    parameters: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product SKU or title.' },
        quantity: { type: 'number', description: 'How many units to remove. Omit to remove the whole line.' },
        confirmed: CONFIRMED_PROP,
      },
      required: ['product'],
    },
    write: true,
  },
  {
    name: 'set_cart_item_quantity',
    description:
      "Set the exact quantity of a product already in the customer's cart (0 removes the line). Use it when the customer says \"make it 3\" or \"only 1 kettle\".",
    parameters: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product SKU or title as it appears in the cart.' },
        quantity: { type: 'number', description: 'The final quantity the cart line should have (0 removes it).' },
        confirmed: CONFIRMED_PROP,
      },
      required: ['product', 'quantity'],
    },
    write: true,
  },
  {
    name: 'replace_cart_item',
    description:
      'Swap one product in the cart for another catalogue product in a single step, keeping the quantity. Use this whenever the customer says "replace X with Y", "X ki jagah Y", "change X to Y" about their cart. It verifies X is actually in the cart, previews both the removal and the addition with the new total, and only applies both changes together once confirmed=true.',
    parameters: {
      type: 'object',
      properties: {
        old_product: { type: 'string', description: 'Product currently in the cart (SKU or title).' },
        new_product: { type: 'string', description: 'Catalogue product to put in its place (SKU or title).' },
        quantity: { type: 'number', description: 'Quantity of the new product. Defaults to the quantity of the old line.' },
        confirmed: CONFIRMED_PROP,
      },
      required: ['old_product', 'new_product'],
    },
    write: true,
  },
  {
    name: 'clear_cart',
    description: "Empty the customer's whole shopping cart. Always confirm first — this cannot be undone.",
    parameters: { type: 'object', properties: { confirmed: CONFIRMED_PROP } },
    write: true,
  },
  {
    name: 'place_order',
    description:
      'Place an order from everything currently in the cart. Use it when the customer says "place my order", "order kar do", "checkout". Preview first: it returns the items, the total, the delivery address and the payment method, then call again with confirmed=true after the customer says yes. The cart is emptied and a new order number (NM-…) is returned.',
    parameters: {
      type: 'object',
      properties: {
        shipping_address: { type: 'string', description: "Full delivery address. Omit to use the address saved on the customer's account." },
        payment_method: { type: 'string', description: 'COD | UPI | CARD (default COD).' },
        confirmed: CONFIRMED_PROP,
      },
    },
    write: true,
  },
  {
    name: 'replace_item_in_order',
    description:
      'Swap one product for another in an order that is still in the PLACED stage, in a single step. Use it for "replace X with Y in my order". Previews both sides with the new order total; applies both changes only when confirmed=true.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order number like NM-10023.' },
        old_product: { type: 'string', description: 'Product currently in the order (SKU or title).' },
        new_product: { type: 'string', description: 'Catalogue product to put in its place.' },
        quantity: { type: 'number', description: 'Quantity of the new product. Defaults to the quantity of the old line.' },
        confirmed: CONFIRMED_PROP,
      },
      required: ['order_id', 'old_product', 'new_product'],
    },
    write: true,
  },
  {
    name: 'search_products',
    description:
      'Search the fixed NexaMart catalogue (50 products) by keywords, e.g. "bluetooth headphones", "kettle", "saree". ' +
      'Use it before adding anything to an order so you quote a real product and price.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the customer asked for, in their own words.' },
        max_price_inr: { type: 'number', description: 'Optional budget ceiling in Indian rupees.' },
      },
      required: ['query'],
    },
    write: false,
  },
  {
    name: 'list_recent_orders',
    description: 'List the recent orders of the signed-in customer with their live status.',
    parameters: { type: 'object', properties: {} },
    write: false,
  },
  {
    name: 'get_order_status',
    description:
      'Status, items, total, delivery address and allowed actions for one order of the signed-in customer.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order number like NM-10023 (digits alone are fine).' },
      },
      required: ['order_id'],
    },
    write: false,
  },
  {
    name: 'add_item_to_order',
    description:
      'Add a catalogue product to an order that is still in the PLACED stage. Confirm the product, quantity and new total with the customer first.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order number like NM-10023.' },
        product: { type: 'string', description: 'Product SKU or title from search_products.' },
        quantity: { type: 'number', description: 'How many to add (default 1).' },
        confirmed: CONFIRMED_PROP,
      },
      required: ['order_id', 'product'],
    },
    write: true,
  },
  {
    name: 'remove_item_from_order',
    description:
      'Remove a product (or part of its quantity) from an order that is still in the PLACED stage. An order must keep at least one item — cancel it instead.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order number like NM-10023.' },
        product: { type: 'string', description: 'Product SKU or title as it appears in the order.' },
        quantity: { type: 'number', description: 'How many units to remove. Omit to remove the whole line.' },
        confirmed: CONFIRMED_PROP,
      },
      required: ['order_id', 'product'],
    },
    write: true,
  },
  {
    name: 'cancel_order',
    description: 'Cancel an order that is still in the PLACED stage.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order number like NM-10023.' },
        reason: { type: 'string', description: 'Short reason in the customer’s words.' },
        confirmed: CONFIRMED_PROP,
      },
      required: ['order_id'],
    },
    write: true,
  },
  {
    name: 'update_shipping_address',
    description: 'Change the delivery address of an order that is still in the PLACED stage.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order number like NM-10023.' },
        new_address: { type: 'string', description: 'Full address: house/flat, street, city, PIN code.' },
        confirmed: CONFIRMED_PROP,
      },
      required: ['order_id', 'new_address'],
    },
    write: true,
  },
  {
    name: 'set_preferred_language',
    description:
      'Save the language the customer confirmed they want to be served in. Call this as soon as the customer confirms, names or switches their language — the choice is stored on their NexaMart account and every future chat and call starts in it. The customer stating the preference IS the confirmation; no separate yes/no needed. Respond to them in the new language using the returned message.',
    parameters: {
      type: 'object',
      properties: {
        language: { type: 'string', description: 'hindi | english | hinglish' },
      },
      required: ['language'],
    },
    write: true,
  },
  {
    name: 'escalate_to_human',
    description:
      'Hand the conversation to a human support agent, with a summary they can act on. Use when the customer asks for a person, is upset, or the request is outside your tools.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why a human is needed (one sentence, English).' },
        intent: { type: 'string', description: 'e.g. order_edit, cancellation, delivery_delay, payment_issue, complaint, other.' },
        summary: { type: 'string', description: 'What the customer wants and what you already did (2-3 sentences, English).' },
        information_collected: { type: 'array', items: { type: 'string' }, description: 'Facts the customer gave you.' },
        missing_information: { type: 'array', items: { type: 'string' }, description: 'What still has to be asked.' },
        language: { type: 'string', description: 'hindi | english | hinglish' },
        confidence: { type: 'number', description: '0-1, how confident you were in handling it.' },
      },
      required: ['reason', 'summary'],
    },
    write: false,
  },
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

export interface ToolOutcome {
  ok: boolean;
  result: Record<string, unknown>;
  summary: string;
}

export type ToolArgs = Record<string, unknown>;

function str(args: ToolArgs, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value);
}

function num(args: ToolArgs, key: string): number | undefined {
  const value = Number(args[key]);
  return Number.isFinite(value) ? value : undefined;
}

function bool(args: ToolArgs, key: string): boolean {
  const value = args[key];
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'yes';
}

function strArray(args: ToolArgs, key: string): string[] {
  const value = args[key];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function needsConfirmation(action: string, preview: Record<string, unknown>): ToolOutcome {
  return {
    ok: false,
    result: {
      error: 'CONFIRMATION_REQUIRED',
      message: `Tell the customer exactly what will change and ask a clear yes/no question before you ${action}. Then call the tool again with confirmed=true.`,
      preview,
    },
    summary: `Confirmation required before ${action}`,
  };
}

function noCustomer(): ToolOutcome {
  return {
    ok: false,
    result: {
      error: 'NO_SIGNED_IN_CUSTOMER',
      message:
        'This conversation is not linked to a signed-in NexaMart account, so no order data can be read. Ask the customer to open the shopping page while signed in, or escalate to a human agent.',
    },
    summary: 'No signed-in customer on this conversation',
  };
}

/**
 * Runs one tool for one conversation and records it in the audit trail.
 * Never throws: business failures come back as `ok:false` with a message the
 * model can read out to the customer.
 */
export async function executeTool(
  conversationId: string,
  name: string,
  args: ToolArgs = {},
): Promise<ToolOutcome> {
  const definition = getToolDefinition(name);
  if (!definition) {
    return {
      ok: false,
      result: { error: 'UNKNOWN_TOOL', message: `Unknown tool ${name}.` },
      summary: `Unknown tool ${name}`,
    };
  }
  const conversation = getConversation(conversationId);
  if (!conversation) {
    return {
      ok: false,
      result: { error: 'CONVERSATION_NOT_FOUND', message: 'This conversation no longer exists.' },
      summary: 'Conversation not found',
    };
  }

  // Once a human owns the conversation the AI stops acting on the customer's
  // behalf — otherwise it could cancel an order the agent is discussing.
  if (conversation.state !== 'AI_HANDLING') {
    return {
      ok: false,
      result: {
        error: 'HANDED_OFF',
        message:
          conversation.state === 'WAITING_FOR_HUMAN' || conversation.state === 'HUMAN_HANDLING'
            ? 'A human support agent has taken over this conversation. Do not take any more actions; stay silent unless the customer speaks to you directly.'
            : 'This conversation is closed.',
      },
      summary: `Tool ${name} blocked (${conversation.state})`,
    };
  }

  let outcome: ToolOutcome;
  try {
    outcome = await run(conversation, definition.name, args);
  } catch (error) {
    console.error(`[tools] ${name} failed:`, error);
    outcome = {
      ok: false,
      result: {
        error: 'TOOL_FAILED',
        message: 'The system could not complete that action right now. Apologise and offer a human agent.',
      },
      summary: `${name} threw: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  appendToolAudit(conversation.id, {
    tool: definition.name,
    args: sanitize(args),
    ok: outcome.ok,
    summary: outcome.summary,
    write: definition.write,
  });
  return outcome;
}

function sanitize(args: ToolArgs): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    clean[key] = typeof value === 'string' && value.length > 160 ? `${value.slice(0, 157)}…` : value;
  }
  return clean;
}

/** The cart shape every cart tool returns, so the model always sees the live cart. */
function cartResult(cart: shop.CartView): Record<string, unknown> {
  return {
    cart: cart.lines.map((l) => ({ product: l.title, sku: l.sku, qty: l.qty, total_inr: l.lineTotalInr })),
    total_inr: cart.totalInr,
    item_count: cart.itemCount,
  };
}

function customerIdOf(conversation: Conversation): string | null {
  return conversation.context.customer?.id ?? null;
}

function trackOrder(conversation: Conversation, orderCode: string) {
  if (!conversation.context.orderIds.includes(orderCode)) {
    updateConversation(conversation.id, {
      context: { orderIds: [...conversation.context.orderIds, orderCode] },
    });
  }
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

async function run(conversation: Conversation, name: ToolName, args: ToolArgs): Promise<ToolOutcome> {
  const clientId = customerIdOf(conversation);

  switch (name) {
    case 'search_products': {
      const query = str(args, 'query');
      const maxPrice = num(args, 'max_price_inr');
      const products = await shop.searchProducts(query, 6, { maxPriceInr: maxPrice });
      return {
        ok: true,
        result: {
          products: products.map((p) => ({
            sku: p.sku,
            title: p.title,
            category: p.category,
            price_inr: p.priceInr,
            description: p.description,
          })),
          instruction:
            products.length === 0
              ? 'Nothing in the catalogue matches. Tell the customer and suggest they describe it differently.'
              : 'Quote the product title and price to the customer before adding anything.',
        },
        summary: `Searched catalogue for "${query}" → ${products.length} match(es)`,
      };
    }

    case 'get_customer_context': {
      if (!clientId) return noCustomer();
      const profile = conversation.context.customer!;
      const orders = await shop.listOrders(clientId, 5);
      return {
        ok: true,
        result: {
          customer: {
            name: profile.name,
            city: profile.city,
            tier: profile.tier,
            phone_last4: profile.phone.slice(-4),
            preferred_language: profile.preferredLanguage,
            delivery_address: profile.address,
          },
          orders: orders.map((o) => shop.summarizeOrderForAgent(o)),
          instruction:
            'Greet the customer by name. Items can only be added or removed while an order is in the PLACED stage.',
        },
        summary: `Loaded context for ${profile.name} (${orders.length} orders)`,
      };
    }

    case 'list_recent_orders': {
      if (!clientId) return noCustomer();
      const orders = await shop.listOrders(clientId, 5);
      return {
        ok: true,
        result: { orders: orders.map((o) => shop.summarizeOrderForAgent(o)) },
        summary: `Listed ${orders.length} orders`,
      };
    }

    case 'get_order_status': {
      if (!clientId) return noCustomer();
      const found = await shop.getOrderForClient(clientId, str(args, 'order_id'));
      if (!found.ok) {
        return { ok: false, result: found.error, summary: `Order ${str(args, 'order_id')} not found` };
      }
      trackOrder(conversation, found.data.code);
      return {
        ok: true,
        result: { order: shop.summarizeOrderForAgent(found.data) },
        summary: `Status of ${found.data.code}: ${found.data.status}`,
      };
    }

    case 'get_cart_status': {
      if (!clientId) return noCustomer();
      const cart = await shop.getCart(clientId);
      return {
        ok: true,
        result: {
          cart: cart.lines.map((l) => ({ product: l.title, sku: l.sku, qty: l.qty, total_inr: l.lineTotalInr })),
          total_inr: cart.totalInr,
          item_count: cart.itemCount,
        },
        summary: `Cart has ${cart.itemCount} items`,
      };
    }

    case 'add_item_to_cart': {
      if (!clientId) return noCustomer();
      const productRef = str(args, 'product');
      const qty = Math.max(1, Math.floor(num(args, 'quantity') ?? 1));
      const product = await shop.findProduct(productRef);
      if (!product) {
        return {
          ok: false,
          result: {
            error: 'PRODUCT_NOT_FOUND',
            message: `"${productRef}" is not in the NexaMart catalogue. Use search_products and offer the closest match.`,
          },
          summary: `Product "${productRef}" not in catalogue`,
        };
      }
      if (!bool(args, 'confirmed')) {
        const cart = await shop.getCart(clientId);
        return needsConfirmation('add the item to the cart', {
          product: product.title,
          sku: product.sku,
          unit_price_inr: product.priceInr,
          quantity: qty,
          added_amount_inr: product.priceInr * qty,
          new_total_inr: cart.totalInr + product.priceInr * qty,
        });
      }
      const cart = await shop.addToCart(clientId, product.id, qty);
      return {
        ok: true,
        result: {
          cart: cart.lines.map((l) => ({ product: l.title, sku: l.sku, qty: l.qty, total_inr: l.lineTotalInr })),
          total_inr: cart.totalInr,
          message: `Added ${qty} x ${product.title} to the cart.`,
        },
        summary: `Added ${qty} x ${product.title} to cart`,
      };
    }

    case 'remove_item_from_cart': {
      if (!clientId) return noCustomer();
      const productRef = str(args, 'product');
      let qty = num(args, 'quantity');
      const product = await shop.findProduct(productRef);
      if (!product) {
        return {
          ok: false,
          result: { error: 'PRODUCT_NOT_FOUND', message: `Could not find "${productRef}" in the catalogue.` },
          summary: `Product "${productRef}" not in catalogue`,
        };
      }
      const currentCart = await shop.getCart(clientId);
      const line = currentCart.lines.find((l) => l.productId === product.id);
      if (!line) {
        return {
          ok: false,
          result: { error: 'NOT_IN_CART', message: `${product.title} is not in the cart.` },
          summary: `${product.title} not in cart`,
        };
      }
      qty = qty !== undefined ? Math.max(1, Math.floor(qty)) : line.qty;
      const newQty = Math.max(0, line.qty - qty);

      if (!bool(args, 'confirmed')) {
        return needsConfirmation(`remove ${qty} x ${product.title} from the cart`, {
          product: product.title,
          sku: product.sku,
          removing_qty: qty,
          remaining_qty: newQty,
          new_total_inr: currentCart.totalInr - product.priceInr * (line.qty - newQty),
        });
      }
      const cart = await shop.setCartQty(clientId, product.id, newQty);
      return {
        ok: true,
        result: {
          cart: cart.lines.map((l) => ({ product: l.title, sku: l.sku, qty: l.qty, total_inr: l.lineTotalInr })),
          total_inr: cart.totalInr,
          message: newQty === 0 ? `Removed ${product.title} from the cart.` : `Reduced ${product.title} to ${newQty}.`,
        },
        summary: `Removed ${qty} x ${product.title} from cart`,
      };
    }

    case 'set_cart_item_quantity': {
      if (!clientId) return noCustomer();
      const productRef = str(args, 'product');
      const target = Math.max(0, Math.floor(num(args, 'quantity') ?? -1));
      if (!Number.isFinite(target) || (num(args, 'quantity') ?? -1) < 0) {
        return {
          ok: false,
          result: { error: 'INVALID_QUANTITY', message: 'Ask the customer for the exact quantity they want (0 removes the item).' },
          summary: 'Invalid quantity',
        };
      }
      const product = await shop.findProduct(productRef);
      if (!product) {
        return {
          ok: false,
          result: { error: 'PRODUCT_NOT_FOUND', message: `Could not find "${productRef}" in the catalogue.` },
          summary: `Product "${productRef}" not in catalogue`,
        };
      }
      const before = await shop.getCart(clientId);
      const line = before.lines.find((l) => l.productId === product.id);
      if (!line && target > 0) {
        // Nothing to change — treat it as an add so the customer is not dead-ended.
        if (!bool(args, 'confirmed')) {
          return needsConfirmation(`add ${target} x ${product.title} to the cart`, {
            product: product.title,
            sku: product.sku,
            unit_price_inr: product.priceInr,
            quantity: target,
            new_total_inr: before.totalInr + product.priceInr * target,
            note: 'The product is not in the cart yet, so this will add it.',
          });
        }
        const cart = await shop.addToCart(clientId, product.id, target);
        return {
          ok: true,
          result: { ...cartResult(cart), message: `Added ${target} x ${product.title} to the cart.` },
          summary: `Added ${target} x ${product.title} to cart`,
        };
      }
      if (!line) {
        return {
          ok: false,
          result: { error: 'NOT_IN_CART', message: `${product.title} is not in the cart.` },
          summary: `${product.title} not in cart`,
        };
      }
      if (!bool(args, 'confirmed')) {
        return needsConfirmation(`set ${product.title} to ${target} in the cart`, {
          product: product.title,
          sku: product.sku,
          current_qty: line.qty,
          new_qty: target,
          new_total_inr: before.totalInr + product.priceInr * (target - line.qty),
        });
      }
      const cart = await shop.setCartQty(clientId, product.id, target);
      return {
        ok: true,
        result: {
          ...cartResult(cart),
          message: target === 0 ? `Removed ${product.title} from the cart.` : `${product.title} is now ${target} in the cart.`,
        },
        summary: `Set ${product.title} to ${target} in cart`,
      };
    }

    case 'replace_cart_item': {
      if (!clientId) return noCustomer();
      const oldRef = str(args, 'old_product');
      const newRef = str(args, 'new_product');
      const oldProduct = await shop.findProduct(oldRef);
      const newProduct = await shop.findProduct(newRef);
      if (!newProduct) {
        return {
          ok: false,
          result: {
            error: 'PRODUCT_NOT_FOUND',
            message: `"${newRef}" is not in the NexaMart catalogue. Use search_products and offer the closest match.`,
          },
          summary: `Replacement product "${newRef}" not in catalogue`,
        };
      }
      const before = await shop.getCart(clientId);
      const oldLine = oldProduct ? before.lines.find((l) => l.productId === oldProduct.id) : undefined;
      if (!oldLine) {
        return {
          ok: false,
          result: {
            error: 'NOT_IN_CART',
            message: `"${oldRef}" is not in the cart, so it cannot be replaced. Tell the customer what the cart actually contains and ask what they want to do.`,
            ...cartResult(before),
          },
          summary: `Cannot replace "${oldRef}" — not in cart`,
        };
      }
      const qty = Math.max(1, Math.floor(num(args, 'quantity') ?? oldLine.qty));
      const newTotal = before.totalInr - oldLine.lineTotalInr + newProduct.priceInr * qty;
      if (!bool(args, 'confirmed')) {
        return needsConfirmation(`replace ${oldLine.title} with ${newProduct.title} in the cart`, {
          removing: { product: oldLine.title, sku: oldLine.sku, qty: oldLine.qty, amount_inr: oldLine.lineTotalInr },
          adding: { product: newProduct.title, sku: newProduct.sku, qty, unit_price_inr: newProduct.priceInr, amount_inr: newProduct.priceInr * qty },
          current_total_inr: before.totalInr,
          new_total_inr: newTotal,
        });
      }
      await shop.setCartQty(clientId, oldLine.productId, 0);
      const cart = await shop.addToCart(clientId, newProduct.id, qty);
      return {
        ok: true,
        result: {
          ...cartResult(cart),
          message: `Replaced ${oldLine.qty} x ${oldLine.title} with ${qty} x ${newProduct.title}. New cart total ${shop.formatInr(cart.totalInr)}.`,
        },
        summary: `Replaced ${oldLine.title} with ${qty} x ${newProduct.title} in cart`,
      };
    }

    case 'clear_cart': {
      if (!clientId) return noCustomer();
      const before = await shop.getCart(clientId);
      if (before.lines.length === 0) {
        return {
          ok: true,
          result: { ...cartResult(before), message: 'The cart is already empty.' },
          summary: 'Cart already empty',
        };
      }
      if (!bool(args, 'confirmed')) {
        return needsConfirmation('empty the cart', {
          removing: before.lines.map((l) => `${l.qty} x ${l.title}`),
          current_total_inr: before.totalInr,
          new_total_inr: 0,
        });
      }
      await shop.clearCart(clientId);
      return {
        ok: true,
        result: { cart: [], total_inr: 0, item_count: 0, message: 'The cart is now empty.' },
        summary: `Cleared cart (${before.itemCount} items)`,
      };
    }

    case 'place_order': {
      if (!clientId) return noCustomer();
      const profile = conversation.context.customer;
      const address = str(args, 'shipping_address') || profile?.address || '';
      const payment = (str(args, 'payment_method') || 'COD').toUpperCase();
      const cart = await shop.getCart(clientId);
      if (cart.lines.length === 0) {
        return {
          ok: false,
          result: {
            error: 'CART_EMPTY',
            message: 'The cart is empty, so no order can be placed. Offer to add the products the customer wants first.',
          },
          summary: 'Place order refused: cart empty',
        };
      }
      if (address.trim().length < 10) {
        return {
          ok: false,
          result: {
            error: 'ADDRESS_REQUIRED',
            message:
              'No delivery address is saved on the account. Ask the customer for the complete address (house/flat, area, city, 6-digit PIN) and call place_order again with shipping_address.',
          },
          summary: 'Place order needs an address',
        };
      }
      if (!bool(args, 'confirmed')) {
        return needsConfirmation('place the order', {
          items: cart.lines.map((l) => `${l.qty} x ${l.title} (${shop.formatInr(l.lineTotalInr)})`),
          total_inr: cart.totalInr,
          shipping_address: address,
          payment_method: payment,
        });
      }
      const result = await shop.placeOrder(clientId, { shippingAddress: address, paymentMethod: payment });
      if (!result.ok) {
        return { ok: false, result: result.error, summary: `Place order refused: ${result.error.code}` };
      }
      trackOrder(conversation, result.data.code);
      return {
        ok: true,
        result: {
          order: shop.summarizeOrderForAgent(result.data),
          message: `Order ${result.data.code} placed for ${shop.formatInr(result.data.totalInr)}, delivering to ${result.data.shippingAddress}. It can still be changed or cancelled while it is in the PLACED stage.`,
        },
        summary: `Placed order ${result.data.code} (${shop.formatInr(result.data.totalInr)})`,
      };
    }

    case 'replace_item_in_order': {
      if (!clientId) return noCustomer();
      const orderId = str(args, 'order_id');
      const oldRef = str(args, 'old_product');
      const newRef = str(args, 'new_product');
      const newProduct = await shop.findProduct(newRef);
      if (!newProduct) {
        return {
          ok: false,
          result: {
            error: 'PRODUCT_NOT_FOUND',
            message: `"${newRef}" is not in the NexaMart catalogue. Use search_products and offer the closest match.`,
          },
          summary: `Replacement product "${newRef}" not in catalogue`,
        };
      }
      const found = await shop.getOrderForClient(clientId, orderId);
      if (!found.ok) {
        return { ok: false, result: found.error, summary: `Order ${orderId} not found` };
      }
      if (!found.data.editable) {
        return {
          ok: false,
          result: {
            error: 'NOT_EDITABLE',
            message: `Order ${found.data.code} is already "${found.data.statusText.toLowerCase()}", so its items can no longer be changed. Say so honestly and offer a human agent.`,
          },
          summary: `Order ${found.data.code} not editable`,
        };
      }
      const needle = oldRef.toLowerCase();
      const oldLine =
        found.data.items.find((i) => i.sku.toLowerCase() === needle) ??
        found.data.items.find((i) => i.title.toLowerCase() === needle) ??
        found.data.items.find((i) => needle.length > 2 && i.title.toLowerCase().includes(needle));
      if (!oldLine) {
        return {
          ok: false,
          result: {
            error: 'ITEM_NOT_IN_ORDER',
            message: `Order ${found.data.code} does not contain "${oldRef}". It has: ${found.data.items
              .map((i) => `${i.qty} x ${i.title}`)
              .join(', ')}.`,
            order: shop.summarizeOrderForAgent(found.data),
          },
          summary: `Cannot replace "${oldRef}" — not in ${found.data.code}`,
        };
      }
      const qty = Math.max(1, Math.floor(num(args, 'quantity') ?? oldLine.qty));
      if (!bool(args, 'confirmed')) {
        return needsConfirmation(`replace ${oldLine.title} with ${newProduct.title} in ${found.data.code}`, {
          order_id: found.data.code,
          removing: { product: oldLine.title, sku: oldLine.sku, qty: oldLine.qty },
          adding: { product: newProduct.title, sku: newProduct.sku, qty, unit_price_inr: newProduct.priceInr },
          current_total_inr: found.data.totalInr,
          new_total_inr: found.data.totalInr - oldLine.priceInr * oldLine.qty + newProduct.priceInr * qty,
        });
      }
      // Add first: an order must always keep at least one item, so adding the
      // replacement before removing the old line never trips the LAST_ITEM rule.
      const added = await shop.addItemToOrder(clientId, found.data.code, newProduct.sku, qty);
      if (!added.ok) {
        return { ok: false, result: added.error, summary: `Replace in ${found.data.code} refused: ${added.error.code}` };
      }
      const removed = await shop.removeItemFromOrder(clientId, found.data.code, oldLine.sku);
      if (!removed.ok) {
        // Roll the addition back so the order is never left in a half-changed state.
        await shop.removeItemFromOrder(clientId, found.data.code, newProduct.sku, qty);
        return {
          ok: false,
          result: {
            ...removed.error,
            message: `${removed.error.message} Nothing was changed on ${found.data.code}.`,
          },
          summary: `Replace in ${found.data.code} rolled back: ${removed.error.code}`,
        };
      }
      trackOrder(conversation, removed.data.code);
      return {
        ok: true,
        result: {
          order: shop.summarizeOrderForAgent(removed.data),
          message: `Replaced ${oldLine.qty} x ${oldLine.title} with ${qty} x ${newProduct.title} in ${removed.data.code}. New order total ${shop.formatInr(removed.data.totalInr)}.`,
        },
        summary: `Replaced ${oldLine.title} with ${qty} x ${newProduct.title} in ${removed.data.code}`,
      };
    }

    case 'add_item_to_order': {
      if (!clientId) return noCustomer();
      const orderId = str(args, 'order_id');
      const productRef = str(args, 'product');
      const qty = Math.max(1, Math.floor(num(args, 'quantity') ?? 1));
      const product = await shop.findProduct(productRef);
      if (!product) {
        return {
          ok: false,
          result: {
            error: 'PRODUCT_NOT_FOUND',
            message: `"${productRef}" is not in the NexaMart catalogue. Use search_products and offer the closest match.`,
          },
          summary: `Product "${productRef}" not in catalogue`,
        };
      }
      if (!bool(args, 'confirmed')) {
        const preview = await shop.getOrderForClient(clientId, orderId);
        return needsConfirmation('add the item', {
          order_id: shop.normalizeOrderCode(orderId),
          product: product.title,
          sku: product.sku,
          unit_price_inr: product.priceInr,
          quantity: qty,
          added_amount_inr: product.priceInr * qty,
          new_total_inr: preview.ok ? preview.data.totalInr + product.priceInr * qty : undefined,
          order: preview.ok ? shop.summarizeOrderForAgent(preview.data) : undefined,
          lookup_error: preview.ok ? undefined : preview.error,
        });
      }
      const result = await shop.addItemToOrder(clientId, orderId, product.sku, qty);
      if (!result.ok) {
        return { ok: false, result: result.error, summary: `Add to ${orderId} refused: ${result.error.code}` };
      }
      trackOrder(conversation, result.data.code);
      return {
        ok: true,
        result: {
          order: shop.summarizeOrderForAgent(result.data),
          message: `Added ${qty} x ${product.title}. New order total ${shop.formatInr(result.data.totalInr)}.`,
        },
        summary: `Added ${qty} x ${product.title} to ${result.data.code}`,
      };
    }

    case 'remove_item_from_order': {
      if (!clientId) return noCustomer();
      const orderId = str(args, 'order_id');
      const productRef = str(args, 'product');
      const qty = num(args, 'quantity');
      if (!bool(args, 'confirmed')) {
        const preview = await shop.getOrderForClient(clientId, orderId);
        return needsConfirmation('remove the item', {
          order_id: shop.normalizeOrderCode(orderId),
          product: productRef,
          quantity: qty ?? 'whole line',
          order: preview.ok ? shop.summarizeOrderForAgent(preview.data) : undefined,
          lookup_error: preview.ok ? undefined : preview.error,
        });
      }
      const result = await shop.removeItemFromOrder(clientId, orderId, productRef, qty);
      if (!result.ok) {
        return { ok: false, result: result.error, summary: `Remove from ${orderId} refused: ${result.error.code}` };
      }
      trackOrder(conversation, result.data.code);
      return {
        ok: true,
        result: {
          order: shop.summarizeOrderForAgent(result.data),
          message: `Removed ${productRef}. New order total ${shop.formatInr(result.data.totalInr)}.`,
        },
        summary: `Removed ${productRef} from ${result.data.code}`,
      };
    }

    case 'cancel_order': {
      if (!clientId) return noCustomer();
      const orderId = str(args, 'order_id');
      const reason = str(args, 'reason') || 'customer request';
      if (!bool(args, 'confirmed')) {
        const preview = await shop.getOrderForClient(clientId, orderId);
        return needsConfirmation('cancel the order', {
          order_id: shop.normalizeOrderCode(orderId),
          order: preview.ok ? shop.summarizeOrderForAgent(preview.data) : undefined,
          lookup_error: preview.ok ? undefined : preview.error,
        });
      }
      const result = await shop.cancelOrder(clientId, orderId, reason);
      if (!result.ok) {
        return { ok: false, result: result.error, summary: `Cancel ${orderId} refused: ${result.error.code}` };
      }
      trackOrder(conversation, result.data.code);
      return {
        ok: true,
        result: {
          order: shop.summarizeOrderForAgent(result.data),
          message:
            result.data.paymentMethod === 'COD'
              ? 'Order cancelled. No payment was taken.'
              : 'Order cancelled. Refund goes back to the original payment method in 5-7 business days.',
        },
        summary: `Cancelled ${result.data.code} (${reason})`,
      };
    }

    case 'update_shipping_address': {
      if (!clientId) return noCustomer();
      const orderId = str(args, 'order_id');
      const newAddress = str(args, 'new_address');
      if (!bool(args, 'confirmed')) {
        return needsConfirmation('change the address', {
          order_id: shop.normalizeOrderCode(orderId),
          new_address: newAddress,
        });
      }
      const result = await shop.updateOrderAddress(clientId, orderId, newAddress);
      if (!result.ok) {
        return { ok: false, result: result.error, summary: `Address change on ${orderId} refused: ${result.error.code}` };
      }
      trackOrder(conversation, result.data.code);
      return {
        ok: true,
        result: { order: shop.summarizeOrderForAgent(result.data), message: 'Delivery address updated.' },
        summary: `Updated address on ${result.data.code}`,
      };
    }

    case 'set_preferred_language': {
      const requested = str(args, 'language');
      const language = normalizeLanguageName(requested);
      if (!language) {
        return {
          ok: false,
          result: {
            error: 'UNSUPPORTED_LANGUAGE',
            message:
              'Only hindi, english and hinglish are supported. Ask the customer to pick one of those three.',
          },
          summary: `Unsupported language "${requested}"`,
        };
      }
      const profile = conversation.context.customer;
      // The conversation follows the new language immediately; the account keeps it
      // for the next chat/call (the greeting is built from Client.preferredLanguage).
      updateConversation(conversation.id, {
        context: {
          language,
          languageConfirmed: true,
          ...(profile ? { customer: { ...profile, preferredLanguage: language } } : {}),
        },
      });
      let saved = false;
      if (clientId) {
        try {
          await shop.setPreferredLanguage(clientId, language);
          saved = true;
        } catch (error) {
          console.warn('[tools] could not persist preferred language:', error);
        }
      }
      return {
        ok: true,
        result: {
          language,
          saved_to_account: saved,
          message: LANGUAGE_CONFIRM_MESSAGE[language],
        },
        summary: `Preferred language set to ${language}${saved ? ' (saved on account)' : ''}`,
      };
    }

    case 'escalate_to_human': {
      const handoff = await buildHandoffSummary(conversation, args);
      const supportCase = createCase({ conversationId: conversation.id, handoff });
      if (!supportCase) {
        return {
          ok: false,
          result: {
            error: 'ESCALATION_FAILED',
            message: 'Could not create the case. Apologise and ask the customer to try again in a moment.',
          },
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
              ? 'Case created. Tell the customer to stay on the line: a human agent joins this call shortly. Then stop and wait silently.'
              : 'Case created. Tell the customer a human agent will continue in this chat shortly.',
        },
        summary: `Escalated → ${supportCase.id} (${handoff.reason_for_escalation})`,
      };
    }
  }
}

/**
 * Builds the handoff packet the human agent sees.
 *
 * Everything the customer said, everything the AI did and the customer's live
 * order data are gathered here — the point of the handoff is that the human
 * never has to ask the customer to repeat themselves.
 */
export async function buildHandoffSummary(
  conversation: Conversation,
  args: ToolArgs,
): Promise<HandoffSummary> {
  const confidenceRaw = Number(args.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : 0.5;

  const actionsTaken = conversation.toolAudit
    .filter((a) => a.tool !== 'escalate_to_human')
    .map((a) => `${a.ok ? '' : '(failed) '}${a.summary}`)
    .slice(-10);

  const profile = conversation.context.customer;
  const collected = uniq([
    ...conversation.context.confirmedInformation,
    ...(conversation.context.notes ?? []),
    ...strArray(args, 'information_collected'),
    ...(profile
      ? [
          `customer: ${profile.name}`,
          `phone: ${profile.phone}`,
          `email: ${profile.email}`,
          profile.city ? `city: ${profile.city}` : '',
          profile.address ? `address: ${profile.address}` : '',
        ]
      : []),
    ...conversation.context.orderIds.map((id) => `order ${id}`),
  ]);

  const missing = uniq([...conversation.context.missingInformation, ...strArray(args, 'missing_information')]);

  const transcript = listMessages(conversation.id)
    .slice(-12)
    .map((m) => {
      const who = m.role === 'user' ? 'Customer' : m.role === 'ai' ? 'AI' : m.role === 'human_agent' ? 'Agent' : 'System';
      return `${who}: ${m.content.replace(/\s+/g, ' ').slice(0, 220)}`;
    });

  let orders: HandoffSummary['orders'];
  if (profile?.id) {
    try {
      orders = (await shop.listOrders(profile.id, 5)).map((o) => ({
        order_id: o.code,
        status: o.status,
        status_text: o.statusText,
        items: o.items.map((i) => `${i.qty} x ${i.title}`),
        total_inr: o.totalInr,
        expected_delivery: new Date(o.expectedDelivery).toISOString(),
        editable: o.editable,
      }));
    } catch (error) {
      console.warn('[tools] could not attach orders to handoff:', error);
    }
  }

  return {
    conversation_id: conversation.id,
    mode: conversation.mode === 'VOICE' ? 'voice' : 'chat',
    language: str(args, 'language') || conversation.context.language || 'unknown',
    client_name: str(args, 'customer_name') || profile?.name || conversation.context.customerName || 'Unknown',
    intent: str(args, 'intent') || conversation.context.intent || 'unknown',
    summary: str(args, 'summary') || 'Customer requested a human agent.',
    information_collected: collected,
    actions_taken: actionsTaken,
    reason_for_escalation: str(args, 'reason') || 'Customer requested a human agent',
    confidence,
    missing_information: missing,
    customer_profile: profile,
    orders,
    transcript_excerpt: transcript,
  };
}
