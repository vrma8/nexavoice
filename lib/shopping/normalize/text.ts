
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
  '#x2F': '/',
  nbsp: ' ',
  rupee: '₹',
  '#8377': '₹',
  '#x20B9': '₹',
  ndash: '–',
  mdash: '—',
  minus: '−',
  hellip: '…',
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return HTML_ENTITIES[body] ?? whole;
  });
}

export function normalizeSpace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, ' ');
}

export function cleanText(input: string | null | undefined): string {
  if (!input) return '';
  return normalizeSpace(decodeHtmlEntities(stripTags(input)));
}

export function parseInrPrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = decodeHtmlEntities(raw);
  const match = text.match(/(?:₹|rs\.?\s?|inr\s?)?\s*([0-9][0-9,]*(?:\.\d+)?)/i);
  if (!match) return null;
  const digits = match[1].replace(/,/g, '');
  const value = Number.parseFloat(digits);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

export function parseRating(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = decodeHtmlEntities(raw).match(/([0-5](?:\.\d)?)\s*(?:out of\s*5|★|$|\s)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 5 ? value : null;
}

export function parseCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = decodeHtmlEntities(raw).replace(/,/g, '');
  const lakh = text.match(/([\d.]+)\s*(lakh|lac|l)\b/i);
  if (lakh) return Math.round(Number.parseFloat(lakh[1]) * 100000);
  const thousand = text.match(/([\d.]+)\s*k\b/i);
  if (thousand) return Math.round(Number.parseFloat(thousand[1]) * 1000);
  const plain = text.match(/\d+/);
  if (!plain) return null;
  const value = Number.parseInt(plain[0], 10);
  return Number.isFinite(value) ? value : null;
}

export function formatInrAmount(value: number): string {
  return value.toLocaleString('en-IN');
}

export function formatInr(value: number): string {
  return `₹${formatInrAmount(value)}`;
}

export function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
