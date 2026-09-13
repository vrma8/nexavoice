import type {
  AlternativeCandidate,
  AlternativesResult,
  ComparisonGroup,
  ComparisonOffer,
  ComparisonResult,
  NormalizedProduct,
} from './types';
import { findSameProduct, groupBySameProduct } from './matching/productMatcher';
import { formatInr } from './normalize/text';

function toOffer(product: NormalizedProduct): ComparisonOffer {
  return {
    id: product.id,
    store: product.store,
    storeLabel: product.storeLabel,
    title: product.title,
    price: product.price,
    originalPrice: product.originalPrice,
    discountPercent: product.discountPercent,
    rating: product.rating,
    reviewCount: product.reviewCount,
    availability: product.availability,
    url: product.url,
    imageUrl: product.imageUrl,
  };
}

function byPriceAsc(a: ComparisonOffer, b: ComparisonOffer): number {
  if (a.price === null && b.price === null) return 0;
  if (a.price === null) return 1;
  if (b.price === null) return -1;
  return a.price - b.price;
}

function buildGroup(members: NormalizedProduct[], minConfidence: number): ComparisonGroup {
  const offers = members.map(toOffer).sort(byPriceAsc);
  const priced = offers.filter((o): o is ComparisonOffer & { price: number } => o.price !== null);
  const best = priced[0] ?? offers[0];
  const highest = priced.length > 0 ? priced[priced.length - 1].price : null;
  const lowest = priced.length > 0 ? priced[0].price : null;
  const savingsAbsolute = lowest !== null && highest !== null && highest > lowest ? highest - lowest : null;
  return {
    label: best.title,
    identityLabel: members[0]?.identity.label ?? null,
    matchConfidence: members.length > 1 ? Math.round(minConfidence * 100) / 100 : 1,
    offers,
    bestOffer: best,
    highestPrice: highest,
    savingsAbsolute,
    savingsPercent:
      savingsAbsolute !== null && highest !== null ? Math.round((savingsAbsolute / highest) * 100) : null,
  };
}

export function compareProducts(products: NormalizedProduct[]): ComparisonResult {
  const capped = products.slice(0, 40);
  const grouped = groupBySameProduct(capped);

  const multi: ComparisonGroup[] = [];
  const singles: ComparisonGroup[] = [];
  for (const { members, minConfidence } of grouped) {
    const group = buildGroup(members, minConfidence);
    if (members.length > 1) multi.push(group);
    else singles.push(group);
  }

  multi.sort((a, b) => byPriceAsc(a.bestOffer, b.bestOffer));
  singles.sort((a, b) => byPriceAsc(a.bestOffer, b.bestOffer));

  let bestOverall: ComparisonOffer | null = null;
  for (const offer of [...multi.map((g) => g.bestOffer), ...singles.map((g) => g.bestOffer)]) {
    if (offer.price === null) continue;
    if (!bestOverall || offer.price < (bestOverall.price ?? Infinity)) bestOverall = offer;
  }

  return { currency: 'INR', groups: multi, singletons: singles, bestOverall };
}

const PRODUCT_TYPE_PATTERN =
  /\b(headphones?|earbuds?|earphones?|speakers?|soundbars?|laptops?|notebooks?|smartphones?|mobiles?|iphones?|tablets?|ipads?|tvs?|televisions?|monitors?|keyboards?|mouse|printers?|cameras?|smartwatches?|watches|refrigerators?|fridges?|washing\s?machines?|air\s?conditioners?|acs?\b|microwaves?|ovens?|purifiers?|geysers?|mixers?|grinders?|juicers?|kettles?|irons?|vacuums?|coolers?|fans?|heaters?|trimmers?|shavers?|dryers?|straighteners?|powerbanks?|chargers?|routers?|pendrives?|ssds?|hard\s?disks?|monitors?)\b/i;

export function productTypeWord(title: string): string | null {
  const match = title.toLowerCase().match(PRODUCT_TYPE_PATTERN);
  if (!match) return null;
  let word = match[1].replace(/\s+/g, '');
  if (word.length > 3 && word.endsWith('s')) word = word.slice(0, -1);
  return word;
}

export function findCheaperAlternatives(
  reference: NormalizedProduct,
  pool: NormalizedProduct[],
): AlternativesResult {
  const sameProductCheaper: AlternativeCandidate[] = [];
  const alternatives: AlternativeCandidate[] = [];
  const refType = productTypeWord(reference.title);

  for (const candidate of pool) {
    if (candidate.id === reference.id) continue;
    if (candidate.price === null) continue; 

    const verdict = findSameProduct(reference, candidate);
    if (verdict.sameProduct && verdict.confidence >= 0.8) {
      if (reference.price !== null && candidate.price < reference.price) {
        sameProductCheaper.push({
          product: toOffer(candidate),
          kind: 'SAME_PRODUCT_CHEAPER',
          note: `${formatInr(reference.price - candidate.price)} cheaper than ${reference.storeLabel} (${formatInr(
            candidate.price,
          )} vs ${formatInr(reference.price)})`,
          matchConfidence: verdict.confidence,
        });
      }
      continue;
    }

    const sharesContext =
      candidate.identity.lineWords.some((w) => reference.identity.lineWords.includes(w)) ||
      (reference.identity.brand !== null && candidate.identity.brand === reference.identity.brand) ||
      (refType !== null && productTypeWord(candidate.title) === refType);
    if (!sharesContext) continue;
    const refPrice = reference.price ?? candidate.price * 2;
    if (candidate.price > refPrice * 1.6) continue;

    const cheaperThanRef = reference.price !== null && candidate.price < reference.price;
    const brandNote =
      candidate.identity.brand && candidate.identity.brand !== reference.identity.brand
        ? `different brand (${cap(candidate.identity.brand)})`
        : candidate.identity.modelTokens.length > 0
          ? `different model (${candidate.identity.modelTokens.join(' ')})`
          : 'different product';
    alternatives.push({
      product: toOffer(candidate),
      kind: 'ALTERNATIVE_PRODUCT',
      note: `${brandNote} — ${formatInr(candidate.price)}${cheaperThanRef ? `, ${formatInr(refPrice - candidate.price)} cheaper` : ''}${
        candidate.rating !== null ? `, rated ${candidate.rating}` : ''
      }`,
      matchConfidence: null,
    });
  }

  sameProductCheaper.sort((a, b) => (a.product.price ?? Infinity) - (b.product.price ?? Infinity));
  alternatives.sort((a, b) => (a.product.price ?? Infinity) - (b.product.price ?? Infinity));
  return {
    reference: { title: reference.title, price: reference.price },
    sameProductCheaper: sameProductCheaper.slice(0, 5),
    alternatives: alternatives.slice(0, 6),
  };
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
