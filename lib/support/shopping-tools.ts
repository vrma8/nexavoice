import {
  compareAcrossStores,
  getStoreProductDetails,
  searchStores,
  findAlternativesAcrossStores,
  buildComparisonPayload,
  buildSearchPayload,
} from '@/lib/shopping/service';
import type {
  NormalizedProduct,
  ShoppingUiState,
  StoreFailure,
  StoreSearchReport,
} from '@/lib/shopping/types';
import type {} from '@/lib/shopping/service';
import { updateConversation } from './store';
import type { Conversation } from './types';
import type { ToolArgs, ToolDefinitionBase, ToolOutcome } from './tool-types';

export const SHOPPING_TOOL_NAMES = [
  'search_online_stores',
  'compare_store_prices',
  'get_online_product_details',
  'find_cheaper_alternatives',
] as const;

export type ShoppingToolName = (typeof SHOPPING_TOOL_NAMES)[number];

export function isShoppingToolName(name: string): name is ShoppingToolName {
  return (SHOPPING_TOOL_NAMES as readonly string[]).includes(name);
}

const STORE_ENUM = { type: 'array', items: { type: 'string', enum: ['amazon', 'flipkart'] } };

export const SHOPPING_TOOL_DEFINITIONS: ToolDefinitionBase[] = [
  {
    name: 'search_online_stores',
    description:
      'Search live prices on the online marketplaces Amazon India and Flipkart. Use it for shopping intents about CURRENT online prices, availability, deals or "where can I buy". ' +
      'Do NOT use it for the NexaMart catalogue (that is `search_products`) or for cart/order actions. Prices come from live store pages and can vary; a store can be temporarily unreachable and results are then marked partial.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product name as the customer said it, e.g. "Sony WH-1000XM5" or "iPhone 15 128GB".' },
        max_price_inr: { type: 'number', description: 'Optional upper price limit in INR.' },
        min_price_inr: { type: 'number', description: 'Optional lower price limit in INR.' },
        limit: { type: 'number', description: 'Max results per store (default 8).' },
        stores: { ...STORE_ENUM, description: 'Optional subset (default: both stores).' },
      },
      required: ['query'],
    },
    write: false,
  },
  {
    name: 'compare_store_prices',
    description:
      'Compare the SAME product live across Amazon India and Flipkart and say which store is cheapest. Use it whenever the customer asks to compare prices, asks which store is cheaper, or wants "the best price" for a specific product (name + model + ideally variant like storage/colour). ' +
      'It is variant-safe: different storage, RAM, generation, colour or model numbers are NEVER treated as the same product. NexaMart does not sell these items — the store links are for the customer to open externally.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The exact product incl. variant, e.g. "Apple iPhone 15 128 GB".' },
        max_price_inr: { type: 'number', description: 'Optional budget cap in INR.' },
      },
      required: ['query'],
    },
    write: false,
  },
  {
    name: 'get_online_product_details',
    description:
      'Fetch full live details (price, MRP, rating, availability, key specs) for ONE product page on Amazon India or Flipkart, using a product url returned by search_online_stores/compare_store_prices. Never invent specs the page does not show.',
    parameters: {
      type: 'object',
      properties: {
        store: { type: 'string', enum: ['amazon', 'flipkart'], description: 'Which store the url belongs to.' },
        url: { type: 'string', description: 'The product page url for that store.' },
      },
      required: ['store', 'url'],
    },
    write: false,
  },
  {
    name: 'find_cheaper_alternatives',
    description:
      'For one product, find (a) the exact same product cheaper on another store, and (b) cheaper equivalent products from other brands in the same category. ' +
      'The two kinds are clearly separated and labelled in the result — never present an OTHER-brand product as the same item.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The reference product the customer is interested in.' },
        max_price_inr: { type: 'number', description: 'Optional budget cap in INR.' },
      },
      required: ['query'],
    },
    write: false,
  },
];

function str(args: ToolArgs, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : '';
}

function num(args: ToolArgs, key: string): number | undefined {
  const value = args[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function strArray(args: ToolArgs, key: string): string[] {
  const value = args[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function compactProduct(p: NormalizedProduct) {
  return {
    store: p.storeLabel,
    title: p.title,
    brand: p.brand ?? null,
    price_inr: p.price,
    original_price_inr: p.originalPrice,
    rating: p.rating,
    availability: p.availability,
    identity: p.identity.label ?? null,
    variant: { storage_gb: p.identity.storageGb, ram_gb: p.identity.ramGb, colour: p.identity.color ?? null, accessory: p.identity.accessory },
    url: p.url,
  };
}

function storeStatusForLlm(report: StoreSearchReport) {
  return report.storeStatus.map((s) => ({
    store: s.storeLabel,
    ok: s.ok,
    products: s.productCount,
    ...(s.error ? { problem: readableProblem(s.error) } : {}),
  }));
}

function readableProblem(error: StoreFailure): string {
  switch (error.code) {
    case 'STORE_BLOCKED':
      return 'store blocked automated access (bot check)';
    case 'STORE_RATE_LIMITED':
      return 'store rate-limited the request';
    case 'STORE_TIMEOUT':
      return 'request timed out';
    case 'STORE_UNAVAILABLE':
      return 'store server error';
    default:
      return error.detail ?? error.code;
  }
}

const VOICE_GUIDANCE =
  'Keep the spoken answer to ONE OR TWO short sentences: name the cheapest store and price, then the savings if any. ' +
  'Never list more than two prices aloud, never read a URL — the on-screen comparison panel shows the links and full detail. ' +
  'Name the exact variant (storage/RAM/size/colour/model) when variants appear. If a store did not respond, say so in one clause, e.g. "Flipkart is not responding right now". ' +
  'Prices are live and can change; say "currently" once. NevaMart/NexaMart does not sell these — offer to open the cheapest link on their screen.';

export async function executeShoppingTool(
  conversation: Conversation,
  name: ShoppingToolName,
  args: ToolArgs,
): Promise<ToolOutcome> {
  switch (name) {
    case 'search_online_stores':
      return runSearch(conversation, args);
    case 'compare_store_prices':
      return runCompare(conversation, args);
    case 'get_online_product_details':
      return runDetails(conversation, args);
    case 'find_cheaper_alternatives':
      return runAlternatives(conversation, args);
  }
}

function setShoppingState(conversation: Conversation, patch: Partial<ShoppingUiState> & Pick<ShoppingUiState, 'status' | 'kind' | 'query'>) {
  updateConversation(conversation.id, {
    context: {
      shopping: {
        ...patch,
        stores: patch.stores ?? ['Amazon India', 'Flipkart'],
        startedAt: patch.startedAt ?? Date.now(),
      },
    },
  });
}

function finishShoppingState(
  conversation: Conversation,
  base: Pick<ShoppingUiState, 'kind' | 'query'>,
  report: StoreSearchReport,
  payload: Pick<ShoppingUiState, 'comparison' | 'search'>,
  startedAt?: number,
): { status: ShoppingUiState['status']; note?: string } {
  const now = startedAt ?? Date.now();
  const status: ShoppingUiState['status'] = report.allFailed ? 'failed' : report.partial ? 'partial' : 'done';
  const note = report.allFailed
    ? 'No marketplace responded just now.'
    : report.partial
      ? `Partial results — ${report.storeStatus
          .filter((s) => !s.ok)
          .map((s) => s.storeLabel)
          .join(', ')} did not respond.`
      : undefined;
  updateConversation(conversation.id, {
    context: {
      shopping: {
        ...base,
        status,
        stores: report.storeStatus.map((s) => s.storeLabel),
        startedAt: now,
        finishedAt: Date.now(),
        storeStatus: report.storeStatus.map((s) => ({
          store: String(s.store),
          label: s.storeLabel,
          ok: s.ok,
          productCount: s.productCount,
          error: s.error?.code ?? null,
        })),
        comparison: payload.comparison ?? null,
        search: payload.search ?? null,
        note,
      },
    },
  });
  return { status, note };
}

async function runSearch(conversation: Conversation, args: ToolArgs): Promise<ToolOutcome> {
  const query = str(args, 'query');
  if (!query) return { ok: false, result: { error: 'MISSING_QUERY', message: 'No product was given to search for.' }, summary: 'Missing query' };
  const startedAt = Date.now();
  setShoppingState(conversation, { kind: 'search', query, status: 'running', startedAt });
  try {
    const report = await searchStores({
      query,
      maxPrice: num(args, 'max_price_inr'),
      minPrice: num(args, 'min_price_inr'),
      limit: num(args, 'limit'),
      stores: strArray(args, 'stores'),
    });
    const { status, note } = finishShoppingState(conversation, { kind: 'search', query }, report, {
      search: buildSearchPayload(report, null),
    }, startedAt);
    if (report.allFailed) {
      return {
        ok: false,
        result: {
          error: 'ALL_STORES_UNREACHABLE',
          message: 'Say: "I could not reach Amazon or Flipkart right now. Prices change fast online — shall I try again in a minute?"',
          store_status: storeStatusForLlm(report),
        },
        summary: `Search "${query}": all stores failed`,
      };
    }
    return {
      ok: true,
      result: {
        products: report.products.slice(0, 12).map(compactProduct),
        store_status: storeStatusForLlm(report),
        partial: status === 'partial',
        ...(note ? { note_to_customer: note } : {}),
        instruction: `${VOICE_GUIDANCE} Mention only the top one or two cheapest results aloud; quote prices exactly as returned — never invent a price.`,
      },
      summary: `Searched online stores for "${query}" → ${report.products.length} product(s)`,
    };
  } catch (error) {
    setShoppingState(conversation, { kind: 'search', query, status: 'failed', note: 'Could not complete the search.' });
    throw error;
  }
}

async function runCompare(conversation: Conversation, args: ToolArgs): Promise<ToolOutcome> {
  const query = str(args, 'query');
  if (!query) return { ok: false, result: { error: 'MISSING_QUERY', message: 'No product was given to compare.' }, summary: 'Missing query' };
  const startedAt = Date.now();
  setShoppingState(conversation, { kind: 'compare', query, status: 'running', startedAt });
  try {
    const report = await compareAcrossStores({ query, maxPrice: num(args, 'max_price_inr') });
    const payload = buildComparisonPayload(report);
    const { status, note } = finishShoppingState(conversation, { kind: 'compare', query }, report.search, {
      comparison: payload,
      search: buildSearchPayload(report.search, null),
    }, startedAt);
    if (!payload || report.search.allFailed) {
      setShoppingState(conversation, { kind: 'compare', query, status: 'failed', note: 'No marketplace responded just now.' });
      return {
        ok: false,
        result: {
          error: 'ALL_STORES_UNREACHABLE',
          message: 'Say honestly that you could not check the stores right now and offer to retry. Never state a price from memory.',
          store_status: storeStatusForLlm(report.search),
        },
        summary: `Compare "${query}": all stores failed`,
      };
    }
    return {
      ok: true,
      result: {
        same_product_groups: payload.groups.map((g) => ({
          product: g.label,
          match_confidence: g.matchConfidence,
          cheapest: { store: g.bestStore, price_inr: g.bestPriceInr, other_stores_save_inr: g.savingsInr },
          offers: g.offers.map((o) => ({ store: o.store, price_inr: o.priceInr, availability: o.availability, url: o.url, title: o.title })),
        })),
        other_products: payload.singletons.map((g) => ({ product: g.label, store: g.offers[0]?.store, price_inr: g.bestPriceInr ?? null })),
        store_status: storeStatusForLlm(report.search),
        partial: status === 'partial',
        ...(note ? { note_to_customer: note } : {}),
        instruction: `${VOICE_GUIDANCE} ` +
          (payload.groups.length > 0
            ? `Lead with the cheapest group: "<product> is currently ₹${payload.groups[0].bestPriceInr} on ${payload.groups[0].bestStore}" — then the other store's price. If savings_inr is 0 or tiny, say both stores price it the same. If a group match_confidence is below 0.9, do NOT call the offers identical; say the models look slightly different.`
            : 'No store sold clearly the same product — describe the closest results instead and name their variants explicitly.'),
      },
      summary: `Compared "${query}" across stores · ${payload.groups.length} matched group(s) · cheapest ${
        payload.bestOverall ? `${payload.bestOverall.store} ₹${payload.bestOverall.priceInr}` : '—'
      }`,
    };
  } catch (error) {
    setShoppingState(conversation, { kind: 'compare', query, status: 'failed', note: 'Could not complete the comparison.' });
    throw error;
  }
}

async function runDetails(conversation: Conversation, args: ToolArgs): Promise<ToolOutcome> {
  const store = str(args, 'store').toLowerCase();
  const url = str(args, 'url');
  if (!url || (store !== 'amazon' && store !== 'flipkart')) {
    return { ok: false, result: { error: 'BAD_INPUT', message: 'A store ("amazon" or "flipkart") and a product url for that store are required.' }, summary: 'Bad details input' };
  }
  try {
    const product = await getStoreProductDetails(store as 'amazon' | 'flipkart', url);
    const missing = [
      product.price === null ? 'current price' : null,
      product.availability === 'unknown' ? 'availability' : null,
    ].filter(Boolean);
    return {
      ok: true,
      result: {
        product: {
          ...compactProduct(product),
          specifications: product.specifications,
        },
        ...(missing.length
          ? { note: `The page did not show: ${missing.join(', ')}. Say you could not see it — never guess.` }
          : {}),
      },
      summary: `Product details ${store} "${product.title}"`,
    };
  } catch (error) {
    return {
      ok: false,
      result: {
        error: 'DETAILS_UNAVAILABLE',
        message: 'Tell the customer this product page could not be read right now and offer to search again instead.',
      },
      summary: `Details failed for ${store} ${url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runAlternatives(conversation: Conversation, args: ToolArgs): Promise<ToolOutcome> {
  const query = str(args, 'query');
  if (!query) return { ok: false, result: { error: 'MISSING_QUERY', message: 'No reference product was given.' }, summary: 'Missing query' };
  const startedAt = Date.now();
  setShoppingState(conversation, { kind: 'alternatives', query, status: 'running', startedAt });
  try {
    const report = await findAlternativesAcrossStores({ query, maxPrice: num(args, 'max_price_inr') });
    const alternatives = report.alternatives;
    finishShoppingState(conversation, { kind: 'alternatives', query }, report.search, {
      search: buildSearchPayload(report.search, alternatives),
    }, startedAt);
    if (!alternatives || !report.reference) {
      return {
        ok: true,
        result: {
          found: false,
          message_for_customer:
            'Say honestly that you could not confidently identify one reference product to compare against — ask them to name the exact model, e.g. "iPhone 15 128 GB" or "Sony WH-1000XM5". Do not invent one.',
        },
        summary: `Alternatives for "${query}": no confident reference product`,
      };
    }
    const ref = alternatives.reference;
    return {
      ok: true,
      result: {
        reference: { title: ref.title, price_inr: ref.price },
        same_product_cheaper: alternatives.sameProductCheaper.map((c) => ({
          kind: c.kind,
          store: c.product.storeLabel,
          title: c.product.title,
          price_inr: c.product.price,
          note: c.note,
          url: c.product.url,
        })),
        alternative_products: alternatives.alternatives.map((c) => ({
          kind: c.kind,
          store: c.product.storeLabel,
          title: c.product.title,
          price_inr: c.product.price,
          rating: c.product.rating ?? null,
          url: c.product.url,
        })),
        store_status: storeStatusForLlm(report.search),
        instruction:
          `${VOICE_GUIDANCE} The two lists are DIFFERENT things and must stay separated when spoken: "same_product_cheaper" is the identical product cheaper elsewhere; ` +
          '"alternative_products" are other brands/models — say clearly when you switch to another brand ("If you are open to another brand, the boAt version costs less"). If both lists are empty, say this is already the best-priced option you found — do not invent a cheaper one.',
      },
      summary: `Alternatives for "${query}" → ${alternatives.sameProductCheaper.length} same-cheaper, ${alternatives.alternatives.length} alternatives`,
    };
  } catch (error) {
    setShoppingState(conversation, { kind: 'alternatives', query, status: 'failed', note: 'Could not compare right now.' });
    throw error;
  }
}
