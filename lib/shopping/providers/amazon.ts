import type { NormalizedProduct, SearchOptions } from '../types';
import { StoreHttpError } from '../types';
import type { Fetcher } from '../http';
import { classifyResponse, storeHeaders } from '../http';
import { normalizeListing, type RawListing } from '../normalize/product';
import { cleanText, decodeHtmlEntities, normalizeSpace, parseCount, parseInrPrice, parseRating } from '../normalize/text';
import type { StoreProvider } from './base';
import { assertStoreUrl } from './base';

const ORIGIN = 'https://www.amazon.in';
const MAX_SEARCH_CARDS = 12;

function extractAsin(block: string): string | null {
  const match = block.match(/data-asin="([A-Z0-9]{10})"/);
  return match ? match[1] : null;
}

function extractTitle(block: string): string {
  const patterns = [
    /<h2[^>]*>[\s\S]{0,500}?<span[^>]*>([^<]{5,250})<\/span>/,
    /<h2[^>]*aria-label="([^"]{5,250})"/,
    /<img[^>]*class="[^"]*s-image[^"]*"[^>]*alt="([^"]{5,250})"/,
  ];
  for (const re of patterns) {
    const match = block.match(re);
    if (match?.[1]) {
      const title = normalizeSpace(decodeHtmlEntities(match[1])).trim();
      if (title) return title;
    }
  }
  return '';
}

function extractPrice(block: string): number | null {
  const match = block.match(/<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>([^<]*₹[^<]*)<\/span>/);
  return parseInrPrice(match?.[1]);
}

function extractOriginalPrice(block: string, sellingPrice: number | null): number | null {
  const match = block.match(/<span[^>]*class="[^"]*a-text-price[^"]*"[^>]*>[\s\S]{0,300}?a-offscreen[^"]*"[^>]*>([^<]*₹[^<]*)<\/span>/);
  const mrp = parseInrPrice(match?.[1]);
  return mrp !== null && sellingPrice !== null && mrp > sellingPrice ? mrp : null;
}

function extractRating(block: string): number | null {
  const match = block.match(/([0-5](?:\.\d)?)\s*out of\s*5\s*stars/i) ?? block.match(/"a-icon-alt">([0-5](?:\.\d)?)\s*out of/i);
  return parseRating(match?.[1]);
}

function extractReviewCount(block: string): number | null {
  const underline = block.match(/<span[^>]*class="[^"]*s-underline-text[^"]*"[^>]*>([\d,]+)<\/span>/);
  if (underline) return parseCount(underline[1]);
  const labelled = block.match(/aria-label="([\d,]{1,12})"/);
  return labelled ? parseCount(labelled[1]) : null;
}

function extractImageUrl(block: string): string | null {
  const match = block.match(/<img[^>]*class="[^"]*s-image[^"]*"[^>]*src="([^"]+)"/);
  return match ? match[1] : null;
}

function isSponsored(block: string): boolean {
  return /aria-label="Sponsored"/i.test(block) || />\s*Sponsored\s*</i.test(block);
}

function extractUrl(block: string, asin: string | null): string {
  if (asin) return `${ORIGIN}/dp/${asin}`;
  const href = block.match(/<a[^>]*href="([^"]*(?:\/dp\/|\/gp\/product\/)[^"]*)"/);
  if (href) {
    const encoded = href[1].match(/url=([^&"]+)/);
    const raw = encoded ? decodeURIComponent(encoded[1]) : href[1];
    return raw.startsWith('http') ? raw : `${ORIGIN}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }
  return ORIGIN;
}

export function parseAmazonSearchHtml(html: string): NormalizedProduct[] {
  const segments = html.split(/data-component-type="s-search-result"/).slice(1);
  const products: NormalizedProduct[] = [];
  for (const segment of segments.slice(0, MAX_SEARCH_CARDS)) {
    const block = `data-component-type="s-search-result"${segment.slice(0, 20000)}`;
    const title = extractTitle(block);
    if (!title) continue;
    const asin = extractAsin(block);
    const price = extractPrice(block);
    const raw: RawListing = {
      title,
      url: extractUrl(block, asin),
      storeProductId: asin,
      priceInr: price,
      originalPriceInr: extractOriginalPrice(block, price),
      rating: extractRating(block),
      reviewCount: extractReviewCount(block),
      imageUrl: extractImageUrl(block),
      availabilityText: /currently unavailable/i.test(block) ? 'currently unavailable' : 'in stock',
      sponsored: isSponsored(block),
    };
    const product = normalizeListing('amazon', raw);
    if (product) products.push(product);
  }
  return products;
}

function specRows(html: string): Record<string, string> {
  const specs: Record<string, string> = {};
  const tableSection = html.match(/id="productDetails[^"]*"[\s\S]{0,30000}?<\/table>/);
  const rowRe = /<th[^>]*>([\s\S]{0,120}?)<\/th>\s*<td[^>]*>([\s\S]{0,300}?)<\/td>/gi;
  let row: RegExpExecArray | null;
  const scope = tableSection ? tableSection[0] : html.slice(0, 150000);
  while ((row = rowRe.exec(scope)) !== null && Object.keys(specs).length < 14) {
    const key = cleanText(row[1]).replace(/[‏‎]/g, '');
    const value = cleanText(row[2]);
    if (key && value && key.length <= 40) specs[key] = value;
  }
  const bulletRe = /<span[^>]*class="[^"]*a-text-bold[^"]*"[^>]*>([\s\S]{0,120}?)<\/span>\s*<span[^>]*>([\s\S]{0,300}?)<\/span>/gi;
  let bullet: RegExpExecArray | null;
  while ((bullet = bulletRe.exec(scope)) !== null && Object.keys(specs).length < 20) {
    const key = cleanText(bullet[1]).replace(/[‏‎:]/g, '').trim();
    const value = cleanText(bullet[2]);
    if (key && value && key.length <= 40 && !specs[key]) specs[key] = value;
  }
  return specs;
}

export function parseAmazonProductHtml(html: string, url: string): NormalizedProduct {
  const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>([\s\S]{0,400}?)<\/span>/);
  const title = cleanText(titleMatch?.[1] ?? '');
  if (!title) {
    throw new StoreHttpError('NO_RESULTS', 'could not find a product title on this Amazon page — it may not be a product page');
  }

  const asinMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i) ?? html.match(/name="ASIN"\s+value="([A-Z0-9]{10})"/i);
  const scope = html.slice(0, 400000);
  const price = parseInrPrice(
    scope.match(/id="corePrice[^"]*"[\s\S]{0,8000}?a-offscreen[^"]*"[^>]*>([^<]*₹[^<]*)<\/span>/)?.[1] ??
      scope.match(/<span[^>]*class="[^"]*a-price[^"]*"[^>]*>[\s\S]{0,300}?a-offscreen[^"]*"[^>]*>([^<]*₹[^<]*)<\/span>/)?.[1],
  );
  const specs = specRows(scope);
  return normalizeListing('amazon', {
    title,
    url,
    storeProductId: asinMatch?.[1] ?? null,
    priceInr: price,
    originalPriceInr: parseInrPrice(
      scope.match(/id="corePrice[^"]*"[\s\S]{0,12000}?a-text-price[^"]*"[^>]*>[\s\S]{0,300}?a-offscreen[^"]*"[^>]*>([^<]*₹[^<]*)<\/span>/)?.[1],
    ),
    rating: parseRating(scope.match(/([0-5](?:\.\d)?)\s*out of\s*5\s*stars/i)?.[1] ?? null),
    reviewCountText: scope.match(/id="acrCustomerReviewText"[^>]*>([\s\S]{0,120}?)<\/span>/)?.[1] ?? null,
    availabilityText: cleanText(scope.match(/<div[^>]*id="availability"[^>]*>([\s\S]{0,400}?)<\/div>/)?.[1] ?? ''),
    imageUrl: scope.match(/id="landingImage"[^>]*src="([^"]+)"/)?.[1] ?? null,
    specifications: specs,
  }) as NormalizedProduct; 
}

export const amazonProvider: StoreProvider = {
  id: 'amazon',
  label: 'Amazon India',
  allowedHosts: ['amazon.in'],

  async search(query: string, opts: Required<Pick<SearchOptions, 'limit'>> & SearchOptions, fetcher: Fetcher) {
    const params = new URLSearchParams({ k: query });
    const response = await fetcher(`${ORIGIN}/s?${params.toString()}`, { headers: storeHeaders() });
    classifyResponse(response.status, response.text, response.finalUrl);
    const products = parseAmazonSearchHtml(response.text);
    if (products.length === 0) {
      throw new StoreHttpError('NO_RESULTS', 'Amazon answered but no product cards could be read — possibly a layout change or a soft block');
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
    const target = assertStoreUrl(amazonProvider, url);
    const response = await fetcher(target.toString(), { headers: storeHeaders() });
    classifyResponse(response.status, response.text, response.finalUrl);
    return parseAmazonProductHtml(response.text, target.toString());
  },
};
