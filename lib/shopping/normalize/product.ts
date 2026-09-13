import type { NormalizedProduct, StoreId } from '../types';
import { STORE_LABEL } from '../types';
import { extractIdentity } from '../matching/productMatcher';
import { cleanText, parseCount, parseInrPrice, parseRating, stableHash } from './text';

export interface RawListing {
  title: string;
  url: string;
  storeProductId?: string | null;
  priceInr?: number | null;
  originalPriceInr?: number | null;
  priceText?: string | null;
  originalPriceText?: string | null;
  ratingText?: string | null;
  rating?: number | null;
  reviewCountText?: string | null;
  reviewCount?: number | null;
  availabilityText?: string | null;
  imageUrl?: string | null;
  specifications?: Record<string, string>;
  sponsored?: boolean;
}

function normalizeAvailability(raw: string | null | undefined): NormalizedProduct['availability'] {
  if (!raw) return 'unknown';
  const text = raw.toLowerCase();
  if (/out of stock|currently unavailable|sold out|not available|coming soon|notify me/.test(text)) {
    return 'out_of_stock';
  }
  if (/in stock|available|only \d+ left|hurry/.test(text)) return 'in_stock';
  return 'unknown';
}

function sanePrice(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 1 || value > 10_000_000) return null;
  return value;
}

export function normalizeListing(store: StoreId, raw: RawListing): NormalizedProduct | null {
  const title = cleanText(raw.title);
  if (!title || title.length < 4) return null;

  const price = sanePrice(raw.priceInr ?? parseInrPrice(raw.priceText));
  const originalPrice = sanePrice(raw.originalPriceInr ?? parseInrPrice(raw.originalPriceText));

  const validOriginal = originalPrice !== null && price !== null && originalPrice > price ? originalPrice : null;
  const discountPercent =
    validOriginal !== null && price !== null
      ? Math.min(95, Math.round(((validOriginal - price) / validOriginal) * 100))
      : null;

  const rating = raw.rating ?? parseRating(raw.ratingText);
  const reviewCount = raw.reviewCount ?? parseCount(raw.reviewCountText);
  const availability = normalizeAvailability(raw.availabilityText);

  const specifications: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.specifications ?? {})) {
    const k = cleanText(key).slice(0, 60);
    const v = cleanText(value).slice(0, 120);
    if (k && v) specifications[k] = v;
  }

  const identity = extractIdentity(title);
  const storeProductId = raw.storeProductId?.trim() || stableHash(raw.url || title);

  return {
    id: `${store}:${storeProductId}`,
    store,
    storeLabel: STORE_LABEL[store],
    title,
    brand: identity.brand,
    model: identity.modelTokens.length > 0 ? identity.modelTokens.join(' ') : null,
    price,
    originalPrice: validOriginal,
    currency: 'INR',
    discountPercent,
    rating,
    reviewCount,
    availability,
    url: raw.url,
    imageUrl: raw.imageUrl?.trim() || null,
    specifications,
    sponsored: raw.sponsored ?? false,
    identity,
  };
}

export function dedupeProducts(products: NormalizedProduct[]): NormalizedProduct[] {
  const seenIds = new Set<string>();
  const seenRows = new Set<string>();
  const out: NormalizedProduct[] = [];
  for (const product of products) {
    const rowKey = `${product.store}|${product.title.toLowerCase().slice(0, 72)}|${product.price ?? '?'}`;
    if (seenIds.has(product.id) || seenRows.has(rowKey)) continue;
    seenIds.add(product.id);
    seenRows.add(rowKey);
    out.push(product);
  }
  return out;
}
