import type {
  AlternativesResult,
  ComparisonResult,
  MatchVerdict,
  NormalizedProduct,
  SearchOptions,
  ShoppingComparisonPayload,
  ShoppingSearchPayload,
  StoreFailure,
  StoreId,
  StoreSearchReport,
  StoreStatus,
} from './types';
import { STORE_LABEL, StoreHttpError } from './types';
import { defaultFetcher, type Fetcher } from './http';
import { assertStoreUrl, getProvider, resolveStores } from './providers';
import { compareProducts, findCheaperAlternatives } from './compare';
import { dedupeProducts } from './normalize/product';
import { findSameProduct } from './matching/productMatcher';

let activeFetcher: Fetcher = defaultFetcher;

export function __setFetcherForTests(fetcher: Fetcher | null): void {
  activeFetcher = fetcher ?? defaultFetcher;
  responseCache.clear();
}

interface CacheEntry<T> {
  at: number;
  value: T;
}

const responseCache = new Map<string, CacheEntry<NormalizedProduct[]>>();
const MAX_CACHE_ENTRIES = 200;

function cacheTtlMs(): number {
  const raw = Number(process.env.RETAIL_INTEL_CACHE_SECONDS);
  return Number.isFinite(raw) && raw >= 0 && raw <= 3600 ? Math.floor(raw) * 1000 : 60_000;
}

function cached<T extends NormalizedProduct[]>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > cacheTtlMs()) {
    responseCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function remember(key: string, value: NormalizedProduct[]): void {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(key, { at: Date.now(), value });
}

export interface SearchStoresInput {
  query: string;
  limit?: number;
  minPrice?: number | null;
  maxPrice?: number | null;
  stores?: string[] | null;
}

function toFailure(store: StoreId, error: unknown): StoreFailure {
  if (error instanceof StoreHttpError) {
    return { store, storeLabel: STORE_LABEL[store], code: error.code, detail: error.message.slice(0, 200) };
  }
  return {
    store,
    storeLabel: STORE_LABEL[store],
    code: 'STORE_UNAVAILABLE',
    detail: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
  };
}

async function searchOneStore(store: StoreId, query: string, opts: Required<Pick<SearchOptions, 'limit'>> & SearchOptions): Promise<NormalizedProduct[]> {
  const key = `${store}|${query.toLowerCase()}|${opts.limit}|${opts.minPrice ?? ''}|${opts.maxPrice ?? ''}`;
  const hit = cached(key);
  if (hit) return hit;
  const products = await getProvider(store).search(query, opts, activeFetcher);
  remember(key, products);
  return products;
}

export async function searchStores(input: SearchStoresInput): Promise<StoreSearchReport> {
  const query = input.query.trim();
  const { stores, unknown } = resolveStores(input.stores);
  const limit = Math.max(1, Math.min(10, Math.floor(input.limit ?? 5)));
  const opts = { limit, minPrice: input.minPrice ?? null, maxPrice: input.maxPrice ?? null };

  const settled = await Promise.allSettled(stores.map((store) => searchOneStore(store, query, opts)));

  const products: NormalizedProduct[] = [];
  const storeStatus: StoreStatus[] = [];
  settled.forEach((outcome, index) => {
    const store = stores[index];
    if (outcome.status === 'fulfilled') {
      storeStatus.push({ store, storeLabel: STORE_LABEL[store], ok: true, productCount: outcome.value.length });
      products.push(...outcome.value);
    } else {
      const failure = toFailure(store, outcome.reason);
      storeStatus.push({ store, storeLabel: STORE_LABEL[store], ok: false, productCount: 0, error: failure });
    }
  });
  for (const name of unknown) {
    storeStatus.push({
      store: name as StoreId,
      storeLabel: name,
      ok: false,
      productCount: 0,
      error: { store: name as StoreId, storeLabel: name, code: 'STORE_UNAVAILABLE', detail: `unknown store "${name}"` },
    });
  }

  const deduped = dedupeProducts(products);
  const failures = storeStatus.filter((s) => !s.ok).length;
  return {
    query,
    products: deduped,
    storeStatus,
    partial: failures > 0 && storeStatus.some((s) => s.ok),
    allFailed: storeStatus.length > 0 && storeStatus.every((s) => !s.ok),
  };
}

export async function getStoreProductDetails(store: StoreId, url: string): Promise<NormalizedProduct> {
  const provider = getProvider(store);
  assertStoreUrl(provider, url); 
  return provider.getProductDetails(url, activeFetcher);
}

export interface ComparisonReport {
  search: StoreSearchReport;
  comparison: ComparisonResult;
}

export async function compareAcrossStores(input: SearchStoresInput): Promise<ComparisonReport> {
  const search = await searchStores(input);
  const comparison = compareProducts(search.products);
  return { search, comparison };
}

export interface AlternativesReport {
  search: StoreSearchReport;
  reference: NormalizedProduct | null;
  verdictNote: string;
  alternatives: AlternativesResult | null;
}

export interface SameProductPair {
  a: NormalizedProduct;
  b: NormalizedProduct;
  verdict: MatchVerdict;
}

export interface SameProductReport {
  search: StoreSearchReport;
  pairs: SameProductPair[];
}

export async function findSameProductAcrossStores(input: SearchStoresInput): Promise<SameProductReport> {
  const search = await searchStores(input);
  const byStore = new Map<string, NormalizedProduct[]>();
  for (const p of search.products) {
    const list = byStore.get(p.store) ?? [];
    if (list.length < 6) list.push(p);
    byStore.set(p.store, list);
  }
  const stores = [...byStore.keys()];
  const pairs: SameProductPair[] = [];
  for (let i = 0; i < stores.length; i++) {
    for (let j = i + 1; j < stores.length; j++) {
      for (const a of byStore.get(stores[i]) ?? []) {
        for (const b of byStore.get(stores[j]) ?? []) {
          pairs.push({ a, b, verdict: findSameProduct(a, b) });
        }
      }
    }
  }
  pairs.sort((x, y) => Number(y.verdict.sameProduct) - Number(x.verdict.sameProduct) || y.verdict.confidence - x.verdict.confidence);
  return { search, pairs: pairs.slice(0, 12) };
}

export async function findAlternativesAcrossStores(
  input: SearchStoresInput & { referenceTitle?: string | null },
): Promise<AlternativesReport> {
  const search = await searchStores(input);
  if (search.products.length === 0) {
    return { search, reference: null, verdictNote: 'no products found on any store', alternatives: null };
  }
  const needle = (input.referenceTitle ?? input.query).trim();

  let reference = search.products[0];
  let best = 0;
  for (const product of search.products) {
    const verdict = findSameProduct({ title: needle }, product);
    if (verdict.confidence > best) {
      best = verdict.confidence;
      reference = product;
    }
  }
  const verdictNote =
    best >= 0.8
      ? `reference product identified with ${Math.round(best * 100)}% confidence`
      : `no confident reference match (best ${Math.round(best * 100)}%) — using the closest result, say it may be a different variant`;
  return { search, reference, verdictNote, alternatives: findCheaperAlternatives(reference, search.products) };
}

export function matchTwoProducts(
  a: { title: string; brand?: string | null },
  b: { title: string; brand?: string | null },
): MatchVerdict {
  return findSameProduct(a, b);
}

export function compactProduct(p: NormalizedProduct) {
  return {
    store: p.storeLabel,
    title: p.title.slice(0, 110),
    price_inr: p.price,
    mrp_inr: p.originalPrice,
    discount_percent: p.discountPercent,
    rating: p.rating,
    reviews: p.reviewCount,
    availability: p.availability,
    url: p.url,
  };
}

export function buildComparisonPayload(report: ComparisonReport | null): ShoppingComparisonPayload | null {
  if (!report) return null;
  const { comparison } = report;
  const group = (g: ComparisonResult['groups'][number]) => ({
    label: (g.identityLabel ?? g.label).slice(0, 120),
    matchConfidence: g.matchConfidence,
    bestStore: g.bestOffer.storeLabel,
    bestPriceInr: g.bestOffer.price,
    savingsInr: g.savingsAbsolute,
    offers: g.offers.map((o) => ({
      store: o.storeLabel,
      storeId: o.store,
      title: o.title.slice(0, 110),
      priceInr: o.price,
      mrpInr: o.originalPrice,
      discountPercent: o.discountPercent,
      rating: o.rating,
      reviewCount: o.reviewCount,
      availability: o.availability,
      url: o.url,
      imageUrl: o.imageUrl,
    })),
  });
  return {
    kind: 'comparison' as const,
    query: report.search.query,
    groups: comparison.groups.slice(0, 5).map(group),
    singletons: comparison.singletons.slice(0, 4).map(group),
    bestOverall: comparison.bestOverall
      ? {
          store: comparison.bestOverall.storeLabel,
          title: comparison.bestOverall.title.slice(0, 110),
          priceInr: comparison.bestOverall.price,
          url: comparison.bestOverall.url,
          imageUrl: comparison.bestOverall.imageUrl,
        }
      : null,
    stores: report.search.storeStatus.map((s) => ({
      store: s.store,
      label: s.storeLabel,
      ok: s.ok,
      productCount: s.productCount,
      error: s.error?.code ?? null,
    })),
    fetchedAt: Date.now(),
  };
}

export function buildSearchPayload(report: StoreSearchReport, alternatives: AlternativesResult | null): ShoppingSearchPayload {
  return {
    kind: 'search' as const,
    query: report.query,
    products: report.products.slice(0, 8).map((p) => ({
      store: p.storeLabel,
      storeId: p.store,
      title: p.title.slice(0, 110),
      priceInr: p.price,
      mrpInr: p.originalPrice,
      discountPercent: p.discountPercent,
      rating: p.rating,
      reviewCount: p.reviewCount,
      availability: p.availability,
      url: p.url,
      imageUrl: p.imageUrl,
    })),
    alternatives: alternatives
      ? {
          reference: alternatives.reference,
          sameProductCheaper: alternatives.sameProductCheaper.map((c) => ({
            store: c.product.storeLabel,
            title: c.product.title.slice(0, 110),
            priceInr: c.product.price,
            url: c.product.url,
            imageUrl: c.product.imageUrl,
            note: c.note,
          })),
          alternatives: alternatives.alternatives.map((c) => ({
            store: c.product.storeLabel,
            title: c.product.title.slice(0, 110),
            priceInr: c.product.price,
            rating: c.product.rating,
            url: c.product.url,
            imageUrl: c.product.imageUrl,
            note: c.note,
          })),
        }
      : null,
    stores: report.storeStatus.map((s) => ({
      store: s.store,
      label: s.storeLabel,
      ok: s.ok,
      productCount: s.productCount,
      error: s.error?.code ?? null,
    })),
    fetchedAt: Date.now(),
  };
}
