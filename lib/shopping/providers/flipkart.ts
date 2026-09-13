import type { NormalizedProduct, SearchOptions } from '../types';
import { StoreHttpError } from '../types';
import type { Fetcher } from '../http';
import { classifyResponse, storeHeaders } from '../http';
import { normalizeListing } from '../normalize/product';
import { cleanText, parseInrPrice } from '../normalize/text';
import type { StoreProvider } from './base';
import { assertStoreUrl } from './base';

const ORIGIN = 'https://www.flipkart.com';
const MAX_PRODUCTS = 12;

export function extractInitialState(html: string): unknown | null {
  const marker = html.match(/window\.__INITIAL_STATE__\s*=\s*/);
  if (!marker || marker.index === undefined) return null;
  let start = marker.index + marker[0].length;
  while (start < html.length && /\s/.test(html[start])) start++;
  if (html[start] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < Math.min(html.length, start + 8_000_000); i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

interface FlipkartSummary {
  titles?: { title?: string; subtitle?: string };
  pricing?: {
    prices?: Array<{ name?: string; value?: number }>;
    price?: number;
    mrp?: number;
    sellingPrice?: number;
    specialPrice?: number;
    discountAmount?: number;
  };
  rating?: { average?: number; count?: number; countText?: string };
  productUrl?: string;
  productId?: string;
  id?: string;
  images?: Array<string | { url?: string }> | string;
  imageUrl?: string;
}

function looksLikeProductSummary(value: unknown): value is FlipkartSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (!obj.titles || typeof obj.titles !== 'object') return false;
  const titles = obj.titles as { title?: unknown };
  if (typeof titles.title !== 'string' || titles.title.trim().length < 4) return false;
  if (!obj.pricing || typeof obj.pricing !== 'object') return false;
  const pricing = obj.pricing as FlipkartSummary['pricing'];
  const priceValues = collectPriceValues(pricing);
  return priceValues.selling !== null || priceValues.named.length > 0;
}

function collectPriceValues(pricing: FlipkartSummary['pricing']): {
  named: Array<{ name: string; value: number }>;
  selling: number | null;
} {
  if (!pricing) return { named: [], selling: null };
  const named: Array<{ name: string; value: number }> = [];
  for (const entry of pricing.prices ?? []) {
    if (typeof entry?.value === 'number' && entry.value > 0) {
      named.push({ name: String(entry.name ?? ''), value: Math.round(entry.value) });
    }
  }
  const scalar = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v as number) : null);
  const selling =
    scalar(pricing.specialPrice) ??
    scalar(pricing.sellingPrice) ??
    scalar(pricing.price) ??
    named.find((p) => /special/i.test(p.name))?.value ??
    (named.length > 0 ? Math.min(...named.map((p) => p.value)) : null);
  return { named, selling };
}

function resolvePrices(pricing: FlipkartSummary['pricing']): { price: number | null; originalPrice: number | null } {
  const { named, selling } = collectPriceValues(pricing);
  if (selling === null) return { price: null, originalPrice: null };
  const scalar = (v: unknown) => (typeof v === 'number' && (v as number) > 0 ? Math.round(v as number) : null);
  const mrpCandidates = [
    scalar(pricing?.mrp),
    scalar(pricing?.price) !== selling ? scalar(pricing?.price) : null,
    ...named.filter((p) => p.value > selling).map((p) => p.value),
    pricing?.discountAmount && pricing.discountAmount > 0 ? selling + Math.round(pricing.discountAmount) : null,
  ].filter((v): v is number => v !== null && v > selling);
  const originalPrice = mrpCandidates.length > 0 ? Math.min(...mrpCandidates) : null;
  return { price: selling, originalPrice };
}

function summaryImage(summary: FlipkartSummary): string | null {
  if (typeof summary.imageUrl === 'string') return summary.imageUrl;
  const images = summary.images;
  if (typeof images === 'string') return images;
  if (Array.isArray(images)) {
    for (const image of images) {
      if (typeof image === 'string' && image.startsWith('http')) return image;
      if (image && typeof image === 'object' && typeof image.url === 'string') return image.url;
    }
  }
  return null;
}

function summaryUrl(summary: FlipkartSummary): string | null {
  const path = summary.productUrl;
  if (typeof path !== 'string' || !path.includes('/p/')) return null;
  return path.startsWith('http') ? path : `${ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

function pidFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/[?&]pid=([A-Z0-9]+)/i) ?? url.match(/\/itm([a-z0-9]+)/i);
  return match ? match[1] : null;
}

function summarize(summary: FlipkartSummary): RawListingSeed | null {
  const title = cleanText(`${summary.titles?.title ?? ''} ${summary.titles?.subtitle ?? ''}`);
  const url = summaryUrl(summary);
  if (!title || !url) return null;
  const { price, originalPrice } = resolvePrices(summary.pricing);
  return {
    title,
    url,
    storeProductId: summary.productId ?? summary.id ?? pidFromUrl(url),
    priceInr: price,
    originalPriceInr: originalPrice,
    rating: typeof summary.rating?.average === 'number' ? summary.rating.average : null,
    reviewCount:
      typeof summary.rating?.count === 'number'
        ? summary.rating.count
        : (parseCountText(summary.rating?.countText) ?? null),
    imageUrl: summaryImage(summary),
    availabilityText: 'in stock',
  };
}

function parseCountText(text: string | undefined): number | null {
  if (!text) return null;
  const digits = text.replace(/,/g, '').match(/\d+/);
  return digits ? Number.parseInt(digits[0], 10) : null;
}

interface RawListingSeed {
  title: string;
  url: string;
  storeProductId?: string | null;
  priceInr: number | null;
  originalPriceInr: number | null;
  rating: number | null;
  reviewCount: number | null;
  imageUrl: string | null;
  availabilityText: string;
}

export function collectProductsFromState(state: unknown): RawListingSeed[] {
  const found: RawListingSeed[] = [];
  const seen = new WeakSet<object>();
  const stack: unknown[] = [state];
  let visited = 0;
  while (stack.length > 0 && visited < 250_000) {
    const value = stack.pop();
    if (!value || typeof value !== 'object') continue;
    visited++;
    if (seen.has(value as object)) continue;
    seen.add(value as object);

    if (looksLikeProductSummary(value)) {
      const seed = summarize(value);
      if (seed) found.push(seed);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
    } else {
      for (const key of Object.keys(value as object)) {
        stack.push((value as Record<string, unknown>)[key]);
      }
    }
  }
  return found;
}

export function collectProductsFromAnchors(html: string): RawListingSeed[] {
  const anchorRe = /<a[^>]*href="(\/[^"\s]*?\/p\/[^"\s]+)"/gi;
  const seeds: RawListingSeed[] = [];
  const seenUrls = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null && seeds.length < MAX_PRODUCTS) {
    const url = `${ORIGIN}${match[1].replace(/&amp;/g, '&')}`;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const window = html.slice(match.index, match.index + 6000);
    const card = window.match(/>([^<>]{8,280})<\/a>/) ?? window.match(/<img[^>]*alt="([^"]{8,280})"/);
    const title = card ? cleanText(card[1]) : '';
    if (!title || /^(view|see|buy)\s/i.test(title)) continue;

    const prices = [...window.matchAll(/₹\s?([\d,]+)/g)]
      .map((m) => parseInrPrice(m[1]))
      .filter((v): v is number => v !== null);
    const unique = [...new Set(prices)];
    const price = unique[0] ?? null;
    const originalPrice = unique.find((v) => price !== null && v > price) ?? null;

    seeds.push({
      title,
      url,
      storeProductId: pidFromUrl(url),
      priceInr: price,
      originalPriceInr: originalPrice ?? null,
      rating: (() => {
        const raw = window.match(/>([0-5](?:\.\d)?)\s*(?:<[^>]+>\s*){0,2}★/)?.[1];
        const value = raw ? Number.parseFloat(raw) : Number.NaN;
        return Number.isFinite(value) && value >= 0 && value <= 5 ? value : null;
      })(),
      reviewCount: parseCountText(window.match(/\((\d[\d,]*)\)/)?.[1]),
      imageUrl: window.match(/<img[^>]*src="(https?:\/\/rukminim\d[^"]+)"/)?.[1] ?? null,
      availabilityText: 'in stock',
    });
  }
  return seeds;
}

export function parseFlipkartSearchHtml(html: string): NormalizedProduct[] {
  const state = extractInitialState(html);
  const seeds = state ? collectProductsFromState(state) : [];
  const fallbackSeeds = seeds.length === 0 ? collectProductsFromAnchors(html) : [];
  const products: NormalizedProduct[] = [];
  for (const seed of [...seeds, ...fallbackSeeds]) {
    const product = normalizeListing('flipkart', seed);
    if (product) products.push(product);
  }
  return products;
}

export function parseFlipkartProductHtml(html: string, url: string): NormalizedProduct {
  const state = extractInitialState(html);
  const seeds = state ? collectProductsFromState(state) : [];
  const wantPid = pidFromUrl(url);
  const own = seeds.find((s) => wantPid !== null && (s.storeProductId === wantPid || s.url.includes(wantPid)));
  const first = own ?? seeds[0] ?? collectProductsFromAnchors(html)[0];
  if (!first) {
    throw new StoreHttpError('NO_RESULTS', 'could not find product details on this Flipkart page — it may not be a product page');
  }
  const product = normalizeListing('flipkart', { ...first, url });
  if (!product) throw new StoreHttpError('NO_RESULTS', 'could not read product details on this Flipkart page');
  return product;
}

export const flipkartProvider: StoreProvider = {
  id: 'flipkart',
  label: 'Flipkart',
  allowedHosts: ['flipkart.com'],

  async search(query: string, opts: Required<Pick<SearchOptions, 'limit'>> & SearchOptions, fetcher: Fetcher) {
    const params = new URLSearchParams({ q: query });
    const response = await fetcher(`${ORIGIN}/search?${params.toString()}`, {
      headers: storeHeaders({ referer: `${ORIGIN}/` }),
    });
    classifyResponse(response.status, response.text, response.finalUrl);
    const products = parseFlipkartSearchHtml(response.text);
    if (products.length === 0) {
      throw new StoreHttpError('NO_RESULTS', 'Flipkart answered but no products could be read — possibly a layout change or a soft block');
    }
    const filtered = products.filter((p) => {
      if (p.price === null) return true;
      if (opts.minPrice != null && p.price < opts.minPrice) return false;
      if (opts.maxPrice != null && p.price > opts.maxPrice) return false;
      return true;
    });
    return filtered.slice(0, opts.limit);
  },

  async getProductDetails(url: string, fetcher: Fetcher) {
    const target = assertStoreUrl(flipkartProvider, url);
    const response = await fetcher(target.toString(), { headers: storeHeaders({ referer: `${ORIGIN}/` }) });
    classifyResponse(response.status, response.text, response.finalUrl);
    return parseFlipkartProductHtml(response.text, target.toString());
  },
};
