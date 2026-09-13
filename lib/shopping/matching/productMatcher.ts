/**
 * Product identity extraction and same-product matching.
 *
 * This is the safety-critical core of the comparison engine: it decides
 * whether a listing on Amazon and a listing on Flipkart describe the SAME
 * physical product before their prices are placed side by side.
 *
 * The matcher works on two tiers of evidence:
 *   - the STRONG signature — number-bearing tokens of the model name
 *     ("1000xm5" → {wh, 1000, xm5}; "s24" → {s, 24}; "iPhone 15" → {15}) —
 *     plus identity dimensions: brand, storage, RAM, screen size, colour,
 *     generation and segment words. Descriptive filler ("Industry Leading
 *     Noise Cancelling") is deliberately kept OUT of this tier.
 *   - LINE WORDS — pure-alpha product-line words (iphone, galaxy, qled) —
 *     small supporting evidence only.
 *
 * Rules (in priority order):
 *   1. Hard conflicts always win. Different brands, clashing strong
 *      signatures, different storage / RAM / screen size, different
 *      generation, a one-sided segment word ("S24 Ultra" vs "S24") or
 *      accessory-vs-product — the verdict is NOT the same product, with the
 *      exact reason spelled out.
 *   2. Otherwise a weighted score decides, and "same product" needs
 *      ≥ SAME_PRODUCT_THRESHOLD (0.8). The grey zone is reported as an
 *      explicit uncertainty, never assumed equal.
 *
 * Reference cases that must hold:
 *   "iPhone 15 128GB"       vs "iPhone 15 256GB"          → different (storage)
 *   "Samsung Galaxy S24"    vs "Samsung Galaxy S24 Ultra"  → different (segment)
 *   "Samsung 55\" QLED Q60D" vs "… Q60C"                   → different (model rev)
 *   "Sony WH-1000XM5 …"     vs "Sony WH1000XM5 …"          → same (punctuation)
 *   "Sony WH-1000XM5"       vs "Sony WF-1000XM5"           → different (models)
 */
import type { MatchVerdict, NormalizedProduct, ProductIdentity } from '../types';

export const SAME_PRODUCT_THRESHOLD = 0.8;
export const DIFFERENT_PRODUCT_THRESHOLD = 0.45;

const KNOWN_BRANDS = [
  'apple', 'samsung', 'sony', 'lg', 'xiaomi', 'redmi', 'poco', 'realme', 'oneplus',
  'oppo', 'vivo', 'iqoo', 'honor', 'huawei', 'nokia', 'google', 'pixel', 'motorola',
  'infinix', 'tecno', 'lava', 'micromax', 'jio', 'nothing', 'asus', 'acer',
  'hp', 'dell', 'lenovo', 'msi', 'microsoft', 'surface', 'boat', 'noise', 'fire-boltt',
  'jbl', 'bose', 'sennheiser', 'skullcandy', 'marshall', 'harman', 'infinity',
  'zebronics', 'portronics', 'amazfit', 'garmin', 'fitbit', 'fossil', 'titan',
  'canon', 'nikon', 'fujifilm', 'gopro', 'dji', 'kindle', 'mi',
  'vu', 'tcl', 'hisense', 'toshiba', 'panasonic', 'philips', 'haier', 'godrej',
  'whirlpool', 'ifb', 'bosch', 'hitachi', 'daikin', 'voltas', 'bluestar',
  'carrier', 'prestige', 'pigeon', 'butterfly', 'preethi', 'sujata',
  'havells', 'bajaj', 'crompton', 'orient', 'usha', 'atomberg', 'dyson',
  'eureka', 'kent', 'livpure', 'faber', 'elica', 'glen',
] as const;

const BRAND_ALIAS: Record<string, string> = {
  mi: 'xiaomi',
};

const VARIANT_TOKENS = new Set([
  'ultra', 'pro', 'max', 'plus', 'fe', 'se', 'lite', 'mini', 'neo', 'gt',
  'edge', 'fold', 'flip', 'studio', 'duos', 'elite', 'sport', 'prime', 'note',
]);

const COLOR_WORDS: Record<string, string> = {
  black: 'black', white: 'white', blue: 'blue', green: 'green', red: 'red',
  silver: 'silver', gold: 'gold', grey: 'grey', gray: 'grey', pink: 'pink',
  purple: 'purple', violet: 'purple', beige: 'beige', brown: 'brown',
  orange: 'orange', yellow: 'yellow', teal: 'teal', cream: 'cream',
  graphite: 'graphite', midnight: 'midnight', starlight: 'starlight',
  titanium: 'titanium', natural: 'natural', desert: 'desert', sierra: 'sierra',
  pacific: 'pacific', alpine: 'alpine', ivory: 'ivory', mist: 'mist',
  lavender: 'lavender', mint: 'mint', coral: 'coral', navy: 'navy',
  burgundy: 'burgundy', maroon: 'maroon', copper: 'copper', bronze: 'bronze',
};

const JUNK_WORDS = new Set([
  'the', 'a', 'an', 'and', 'with', 'for', 'by', 'of', 'in', 'on', 'at', 'to',
  'new', 'latest', 'original', 'genuine', 'official', 'certified', 'brand',
  'wireless', 'bluetooth', 'smart', 'hd', 'uhd', 'fhd', 'qhd', '4k', '8k',
  'oled', 'qled', 'led', 'amoled', 'lcd', 'hdr', 'full', 'super', 'extra',
  'india', 'indian', 'warranty', 'year', 'years', 'months', 'month',
  'launch', 'launched', 'edition', 'variant', 'model', 'series', 'gen',
  'pack', 'combo', 'set', 'free', 'offer', 'deal', 'discount', 'sale',
  'buy', 'online', 'price', 'best', 'top', 'rated', 'mode', 'leading',
  '2021', '2022', '2023', '2024', '2025', '2026', '2027',
  'ai', '5g', '4g', 'wifi', 'wi-fi', 'nfc', 'gps', 'esim', 'dual', 'sim',
  'colour', 'color', 'capacity', 'storage', 'ram', 'upgraded',
  'usb', 'usb-c', 'type-c', 'charging', 'charger', 'cable', 'magsafe',
  'magnetic', 'case', 'anc', 'enc', 'dolby', 'atmos', 'spatial', 'calling',
  'unboxed', 'sealed', 'openbox', 'refurbished', 'renewed', 'preowned',
  'cm', 'mm', 'kg', 'watts', 'watt', 'hz', 'mah', 'litre', 'liter',
  'in-ear', 'over-ear', 'on-ear', 'true', 'tws', 'earbuds', 'earbud',
  'headphone', 'headphones', 'earphone', 'earphones', 'speaker', 'speakers',
  'tv', 'television', 'monitor', 'laptop', 'notebook', 'smartphone', 'mobile',
  'phone', 'tablet', 'watch', 'smartwatch', 'band', 'tracker',
  'mens', 'womens', 'unisex', 'boys', 'girls',
]);

const ACCESSORY_PATTERNS = [
  /\bcase (?:for|cover)\b/i, /\bcover (?:for|case)\b/i,
  /\bcompatible with\b/i, /\bscreen guard\b/i, /\btempered glass\b/i,
  /\bskin (?:for|sticker)\b/i, /\bstrap for\b/i, /\bband for\b/i,
  /\bcharger for\b/i, /\bcable for\b/i, /\bprotector\b/i, /\bpouch\b/i,
  /\bback cover\b/i, /\bflip cover\b/i, /\bhard case\b/i, /\bsilicone case\b/i,
];

/**
 * Strong-signature parts of ONE token: "wh-1000xm5" → [wh, 1000, xm5],
 * "WH1000XM5/B" → [wh, 1000, xm5, b], "q60d" → [q, 60, d], "13r" → [13, r].
 * Pure-digit chunks ("15") are kept (≤4 digits — year-like tokens are junked
 * by the caller). A pure-alpha chunk never belongs to the strong signature.
 */
function strongSignature(token: string): string[] {
  const chunks = token.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const tokenHasDigit = chunks.some((chunk) => /\d/.test(chunk));
  const parts: string[] = [];
  for (const chunk of chunks) {
    const hasAlpha = /[a-z]/.test(chunk);
    const hasDigit = /\d/.test(chunk);
    if (hasAlpha && hasDigit) {
      for (const run of chunk.match(/[a-z]+|\d+/g) ?? []) parts.push(run);
    } else if (hasDigit && chunk.length <= 4) {
      parts.push(chunk);
    } else if (hasAlpha && chunk.length >= 2 && tokenHasDigit) {
      parts.push(chunk);
    }
  }
  return parts;
}

function capacityMentions(title: string): Array<{ gb: number; index: number; hasRamWord: boolean }> {
  const found: Array<{ gb: number; index: number; hasRamWord: boolean }> = [];
  const gbRe = /(\d{1,4})\s?gb\b/gi;
  let m: RegExpExecArray | null;
  while ((m = gbRe.exec(title)) !== null) {
    const after = title.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const before = title.slice(Math.max(0, m.index - 12), m.index);
    found.push({
      gb: Number.parseInt(m[1], 10),
      index: m.index,
      hasRamWord: /\bram\b/i.test(after) || /\bram\b/i.test(before),
    });
  }
  const tbRe = /(\d{1,2})\s?tb\b/gi;
  while ((m = tbRe.exec(title)) !== null) {
    found.push({ gb: Number.parseInt(m[1], 10) * 1024, index: m.index, hasRamWord: false });
  }
  return found.sort((x, y) => x.index - y.index);
}

export function extractIdentity(rawTitle: string, knownBrand?: string | null): ProductIdentity {
  const title = rawTitle
    .toLowerCase()
    // dimension strings ("108 x 43 x 8 cm") are noise, not model text
    .replace(/\d+(?:\.\d+)?\s?[x×]\s?\d+(?:\.\d+)?/g, ' ')
    // NOTE: keep 'x' itself — model tokens like "WH-1000XM5" need it.
    .replace(/[()[\],|/\\:+;×"*#]+/g, ' ')
    // "Ultra HD" / "Full HD" are display specs, not segment words ("Ultra" is
    // a phone trim — it must only fire when it is NOT part of "Ultra HD").
    .replace(/\bultra\s?hd\b|\bfull\s?hd\b|\bquad\s?hd\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let brand = knownBrand?.toLowerCase() ?? null;
  if (!brand) {
    let earliest: { index: number; name: string } | null = null;
    for (const candidate of KNOWN_BRANDS) {
      const escaped = candidate.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const hit = new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).exec(title);
      if (hit && (!earliest || hit.index < earliest.index)) {
        earliest = { index: hit.index, name: BRAND_ALIAS[candidate] ?? candidate };
      }
    }
    brand = earliest ? earliest.name : null;
  }

  const capacities = capacityMentions(title);
  let storageGb: number | null = null;
  let ramGb: number | null = null;
  if (capacities.length >= 2) {
    const [first, second] = capacities;
    if (first.hasRamWord && !second.hasRamWord) {
      ramGb = first.gb;
      storageGb = second.gb;
    } else if (second.hasRamWord && !first.hasRamWord) {
      ramGb = second.gb;
      storageGb = first.gb;
    } else if (first.gb <= 32 && second.gb >= first.gb * 4) {
      ramGb = first.gb;
      storageGb = second.gb;
    } else {
      storageGb = Math.max(first.gb, second.gb);
    }
  } else if (capacities.length === 1) {
    const only = capacities[0];
    if (only.hasRamWord && only.gb <= 32) ramGb = only.gb;
    else storageGb = only.gb;
  }

  let sizeInch: number | null = null;
  const sizeMatch =
    title.match(/(\d{2}(?:\.\d+)?)\s?(?:-|–)\s?(?:inch|inches)\b/) ??
    title.match(/(\d{2}(?:\.\d+)?)\s?(?:"|″|''|\binch\b|\binches\b)/);
  if (sizeMatch) {
    const value = Number.parseFloat(sizeMatch[1]);
    if (value >= 10 && value <= 110) sizeInch = value;
  }

  const color =
    title.match(/[a-z]+/g)?.map((w) => COLOR_WORDS[w]).find(Boolean) ?? null;

  const variantTokens = new Set<string>();
  const genMatch = title.match(/(?:^|\s)(\d{1,2})(?:st|nd|rd|th)?\s?(?:gen|generation)\b/);
  if (genMatch) variantTokens.add(`gen${genMatch[1]}`);
  const airpodsAlias = !genMatch && /airpods/.test(title) ? title.match(/airpods(?:\s+pro)?\s+(\d{1,2})\b/) : null;
  if (airpodsAlias && Number(airpodsAlias[1]) >= 1 && Number(airpodsAlias[1]) <= 9) {
    variantTokens.add(`gen${airpodsAlias[1]}`);
  }

  let scrubbed = title
    .replace(/\b\d{2,4}\s?cm\b/g, ' ')
    .replace(/\d{1,4}\s?(?:gb|tb)\b/g, ' ')
    .replace(/(\d{2}(?:\.\d+)?)\s?(?:"|″|''|\binch\b|\binches\b)/g, ' ')
    .replace(/(?:^|\s)\d{1,2}(?:st|nd|rd|th)?\s?(?:gen|generation)\b/g, ' ')
    // the AirPods shorthand number lives in variantTokens now, not the signature
    .replace(/(airpods(?:\s+pro)?\s+)\d{1,2}\b/, '$1');
  for (const word of Object.keys(COLOR_WORDS)) {
    scrubbed = scrubbed.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ');
  }

  const accessory = ACCESSORY_PATTERNS.some((re) => re.test(rawTitle));

  const brandWords = new Set(brand ? brand.split(/\s+/) : []);
  const tokens = scrubbed
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter(Boolean)
    .filter((w) => !JUNK_WORDS.has(w))
    .filter((w) => !brandWords.has(w));

  for (const token of tokens) {
    if (VARIANT_TOKENS.has(token)) variantTokens.add(token);
  }

  const strong = new Set<string>();
  const lineWords = new Set<string>();
  for (const token of tokens) {
    const parts = strongSignature(token);
    if (parts.length > 0) {
      for (const part of parts) strong.add(part);
    } else if (/^[a-z]{2,}$/.test(token) && !COLOR_WORDS[token]) {
      lineWords.add(token);
    }
  }
  for (const v of variantTokens) {
    strong.delete(v);
    lineWords.delete(v);
  }

  const brandLabel = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : null;
  const dims = [
    storageGb ? (storageGb >= 1024 ? `${storageGb / 1024}TB` : `${storageGb}GB`) : null,
    ramGb ? `${ramGb}GB RAM` : null,
    sizeInch ? `${sizeInch}-inch` : null,
    color ? color.charAt(0).toUpperCase() + color.slice(1) : null,
    ...[...variantTokens]
      .filter((t) => !/^gen\d+$/.test(t))
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
  ].filter(Boolean) as string[];
  const core = rawTitle
    .replace(/^\s*(?:renewed|refurbished)\s+/i, '')
    .split(/[([|,]/)[0]
    .trim()
    .slice(0, 70);
  const label = `${brandLabel ? `${brandLabel} — ` : ''}${core}${dims.length ? ` [${dims.join(', ')}]` : ''}`;

  return {
    brand,
    modelTokens: [...strong].sort(),
    lineWords: [...lineWords].sort(),
    storageGb,
    ramGb,
    sizeInch,
    color,
    variantTokens: [...variantTokens].sort(),
    accessory,
    label,
  };
}

interface Side {
  title: string;
  identity: ProductIdentity;
}

function prepare(input: { title: string; brand?: string | null; identity?: ProductIdentity }): Side {
  return {
    title: input.title,
    identity: input.identity ?? extractIdentity(input.title, input.brand),
  };
}

function jaccardOf(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function containsAsSet(a: string[], b: string[]): boolean {
  const small = a.length <= b.length ? a : b;
  const big = a.length <= b.length ? b : a;
  const bigSet = new Set(big);
  return small.every((t) => bigSet.has(t));
}

function titleTokenJaccard(a: string, b: string): number {
  const set = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/\d+(?:\.\d+)?\s?[x×]\s?\d+(?:\.\d+)?/g, ' ')
        .replace(/[()[\],|/\\:+;×"*#]+/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !JUNK_WORDS.has(w)),
    );
  const sa = set(a);
  const sb = set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function formatGb(gb: number): string {
  return gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`;
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function findSameProduct(
  aInput: { title: string; brand?: string | null; identity?: ProductIdentity },
  bInput: { title: string; brand?: string | null; identity?: ProductIdentity },
): MatchVerdict {
  const a = prepare(aInput);
  const b = prepare(bInput);
  const ia = a.identity;
  const ib = b.identity;

  const verdict = (sameProduct: boolean, confidence: number, reason: string): MatchVerdict => ({
    sameProduct,
    confidence: Math.round(confidence * 100) / 100,
    reason,
    identityLabel: confidence >= DIFFERENT_PRODUCT_THRESHOLD ? ia.label : null,
  });

  if (ia.brand && ib.brand && ia.brand !== ib.brand) {
    return verdict(false, 0.1, `different brands (${cap(ia.brand)} vs ${cap(ib.brand)})`);
  }
  if (ia.storageGb !== null && ib.storageGb !== null && ia.storageGb !== ib.storageGb) {
    return verdict(
      false,
      0.1,
      `different storage variants (${formatGb(ia.storageGb)} vs ${formatGb(ib.storageGb)}) — never quote them as the same product`,
    );
  }
  if (ia.ramGb !== null && ib.ramGb !== null && ia.ramGb !== ib.ramGb) {
    return verdict(false, 0.1, `different RAM variants (${ia.ramGb}GB vs ${ib.ramGb}GB)`);
  }
  if (ia.sizeInch !== null && ib.sizeInch !== null && Math.abs(ia.sizeInch - ib.sizeInch) > 0.2) {
    return verdict(false, 0.1, `different screen sizes (${ia.sizeInch}-inch vs ${ib.sizeInch}-inch)`);
  }
  if (ia.accessory !== ib.accessory) {
    return verdict(false, 0.15, 'one listing is an accessory (case/cover/protector), not the product itself');
  }

  const onlyA = ia.variantTokens.filter((t) => !ib.variantTokens.includes(t));
  const onlyB = ib.variantTokens.filter((t) => !ia.variantTokens.includes(t));
  if (onlyA.length > 0 || onlyB.length > 0) {
    const bits: string[] = [];
    if (onlyA.length) bits.push(`"${a.title.slice(0, 40)}" has [${onlyA.join(', ')}]`);
    if (onlyB.length) bits.push(`"${b.title.slice(0, 40)}" has [${onlyB.join(', ')}]`);
    return verdict(false, 0.25, `different variants — ${bits.join(' but ')}`);
  }

  const ma = ia.modelTokens;
  const mb = ib.modelTokens;
  if (ma.length > 0 && mb.length > 0) {
    const j = jaccardOf(ma, mb);
    if (j === 0) {
      return verdict(false, 0.15, `different models ([${ma.join(' ')}] vs [${mb.join(' ')}])`);
    }
    if (j <= 0.6 && !containsAsSet(ma, mb)) {
      const setB = new Set(mb);
      const setA = new Set(ma);
      const exA = ma.filter((t) => !setB.has(t));
      const exB = mb.filter((t) => !setA.has(t));
      if (exA.some((t) => /[a-z]/.test(t)) && exB.some((t) => /[a-z]/.test(t))) {
        return verdict(
          false,
          0.2,
          `different model revisions ([${ma.join(' ')}] vs [${mb.join(' ')}]) — never quote them as the same product`,
        );
      }
      return verdict(false, 0.3, `different model variants ([${ma.join(' ')}] vs [${mb.join(' ')}])`);
    }
  }

  let score = 0;
  const brandEqual = ia.brand !== null && ib.brand !== null && ia.brand === ib.brand;
  if (brandEqual) score += 0.25;
  else if (!ia.brand || !ib.brand) score += 0.03; 

  const lineWordsContained =
    ia.lineWords.length === 0 || ib.lineWords.length === 0 || containsAsSet(ia.lineWords, ib.lineWords);

  if (ma.length > 0 && mb.length > 0) {
    const j = jaccardOf(ma, mb);
    const exact = j >= 0.999;
    if (exact) score += 0.45;
    else if (containsAsSet(ma, mb)) score += 0.3;
    else score += 0.45 * j;
    if (ia.lineWords.length > 0 && ib.lineWords.length > 0 && lineWordsContained) score += 0.06;
    if (exact && (ma.length >= 2 || brandEqual || lineWordsContained)) {
      score = Math.max(score, brandEqual ? 0.84 : 0.82);
    }
  } else if (ma.length === 0 && mb.length === 0) {
    if (ia.lineWords.length > 0 && ib.lineWords.length > 0) {
      const j = jaccardOf(ia.lineWords, ib.lineWords);
      const exact = j >= 0.999;
      if (exact) score += 0.28;
      else if (containsAsSet(ia.lineWords, ib.lineWords)) score += 0.2;
      else score += 0.28 * j;
      if (brandEqual && exact) score = Math.max(score, 0.84);
    } else {
      score += 0.03;
    }
  } else {
    score += 0.05; 
  }

  const sharedDims = [
    ia.storageGb !== null && ib.storageGb !== null && ia.storageGb === ib.storageGb,
    ia.ramGb !== null && ib.ramGb !== null && ia.ramGb === ib.ramGb,
    ia.sizeInch !== null && ib.sizeInch !== null && ia.sizeInch === ib.sizeInch,
    ia.color !== null && ib.color !== null && ia.color === ib.color,
  ].filter(Boolean).length;
  score += Math.min(0.2, sharedDims * 0.05);

  score += 0.12 * titleTokenJaccard(a.title, b.title);

  const colourConflict = ia.color !== null && ib.color !== null && ia.color !== ib.color;
  if (colourConflict) score -= 0.25;

  if (score >= SAME_PRODUCT_THRESHOLD) {
    return verdict(true, Math.min(0.99, score), 'brand, model and variant details agree');
  }
  if (colourConflict) {
    return verdict(
      false,
      Math.min(0.6, Math.max(0.3, score)),
      `possible same model but different colour variants (${ia.color} vs ${ib.color}) — compare them as separate offers`,
    );
  }
  if (score >= DIFFERENT_PRODUCT_THRESHOLD) {
    return verdict(
      false,
      score,
      `cannot be confidently matched as the same product (${Math.round(score * 100)}% confidence)`,
    );
  }
  return verdict(false, score, 'different products');
}

export function groupBySameProduct(products: NormalizedProduct[]): Array<{
  members: NormalizedProduct[];
  minConfidence: number;
}> {
  const groups: Array<{ members: NormalizedProduct[]; minConfidence: number }> = [];
  for (const product of products) {
    let bestIndex = -1;
    let bestConfidence = 0;
    for (let g = 0; g < groups.length; g++) {
      let ok = true;
      let edgeMin = 1;
      for (const member of groups[g].members) {
        const v = findSameProduct(product, member);
        if (!v.sameProduct) {
          ok = false;
          break;
        }
        edgeMin = Math.min(edgeMin, v.confidence);
      }
      if (ok && edgeMin > bestConfidence) {
        bestConfidence = edgeMin;
        bestIndex = g;
      }
    }
    if (bestIndex === -1) {
      groups.push({ members: [product], minConfidence: 1 });
    } else {
      groups[bestIndex].members.push(product);
      groups[bestIndex].minConfidence = Math.min(groups[bestIndex].minConfidence, bestConfidence);
    }
  }
  return groups;
}
