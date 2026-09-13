
export const STORE_IDS = ['amazon', 'flipkart'] as const;

export type StoreId = (typeof STORE_IDS)[number];

export const STORE_LABEL: Record<StoreId, string> = {
  amazon: 'Amazon India',
  flipkart: 'Flipkart',
};

export function isStoreId(value: string): value is StoreId {
  return (STORE_IDS as readonly string[]).includes(value);
}

export interface ProductIdentity {
  brand: string | null;
  modelTokens: string[];
  lineWords: string[];
  storageGb: number | null;
  ramGb: number | null;
  sizeInch: number | null;
  color: string | null;
  variantTokens: string[];
  accessory: boolean;
  label: string | null;
}

export interface NormalizedProduct {
  id: string;
  store: StoreId;
  storeLabel: string;
  title: string;
  brand: string | null;
  model: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: 'INR';
  discountPercent: number | null;
  rating: number | null;
  reviewCount: number | null;
  availability: 'in_stock' | 'out_of_stock' | 'unknown';
  url: string;
  imageUrl: string | null;
  specifications: Record<string, string>;
  sponsored?: boolean;
  identity: ProductIdentity;
}

export type StoreErrorCode =
  | 'STORE_BLOCKED' 
  | 'STORE_RATE_LIMITED'
  | 'STORE_TIMEOUT'
  | 'STORE_UNAVAILABLE' 
  | 'NO_RESULTS' 
  | 'INVALID_URL';

export interface StoreFailure {
  store: StoreId;
  storeLabel: string;
  code: StoreErrorCode;
  detail?: string;
}

export interface StoreStatus {
  store: StoreId;
  storeLabel: string;
  ok: boolean;
  productCount: number;
  error?: StoreFailure;
}

export class StoreHttpError extends Error {
  constructor(
    public code: StoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoreHttpError';
  }
}

export interface SearchOptions {
  limit?: number;
  minPrice?: number | null;
  maxPrice?: number | null;
  stores?: StoreId[];
}

export interface StoreSearchReport {
  query: string;
  products: NormalizedProduct[];
  storeStatus: StoreStatus[];
  partial: boolean;
  allFailed: boolean;
}

export interface ComparisonOffer {
  id: string;
  store: StoreId;
  storeLabel: string;
  title: string;
  price: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  rating: number | null;
  reviewCount: number | null;
  availability: NormalizedProduct['availability'];
  url: string;
  imageUrl: string | null;
}

export interface ComparisonGroup {
  label: string;
  identityLabel: string | null;
  matchConfidence: number;
  offers: ComparisonOffer[];
  bestOffer: ComparisonOffer;
  highestPrice: number | null;
  savingsAbsolute: number | null;
  savingsPercent: number | null;
}

export interface ComparisonResult {
  currency: 'INR';
  groups: ComparisonGroup[];
  singletons: ComparisonGroup[];
  bestOverall: ComparisonOffer | null;
}

export interface MatchVerdict {
  sameProduct: boolean;
  confidence: number;
  reason: string;
  identityLabel: string | null;
}

export interface AlternativeCandidate {
  product: ComparisonOffer;
  kind: 'SAME_PRODUCT_CHEAPER' | 'ALTERNATIVE_PRODUCT';
  note: string;
  matchConfidence: number | null;
}

export interface AlternativesResult {
  reference: { title: string; price: number | null };
  sameProductCheaper: AlternativeCandidate[];
  alternatives: AlternativeCandidate[];
}

export interface ShoppingStoreStatusUi {
  store: string;
  label: string;
  ok: boolean;
  productCount: number;
  error?: string | null;
}

export interface ShoppingOfferUi {
  store: string;
  storeId: string;
  title: string;
  priceInr: number | null;
  mrpInr?: number | null;
  discountPercent?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  availability?: 'in_stock' | 'out_of_stock' | 'unknown';
  url: string;
  imageUrl?: string | null;
}

export interface ShoppingComparisonGroupUi {
  label: string;
  matchConfidence: number;
  bestStore?: string;
  bestPriceInr?: number | null;
  savingsInr?: number | null;
  offers: ShoppingOfferUi[];
}

export interface ShoppingComparisonPayload {
  kind: 'comparison';
  query: string;
  groups: ShoppingComparisonGroupUi[];
  singletons: ShoppingComparisonGroupUi[];
  bestOverall: { store: string; title: string; priceInr: number | null; url: string; imageUrl?: string | null } | null;
  stores: ShoppingStoreStatusUi[];
  fetchedAt: number;
}

export interface ShoppingAlternativesPayload {
  reference: { title: string; price: number | null };
  sameProductCheaper: Array<{
    store: string;
    title: string;
    priceInr: number | null;
    url: string;
    imageUrl?: string | null;
    note: string;
  }>;
  alternatives: Array<{
    store: string;
    title: string;
    priceInr: number | null;
    rating?: number | null;
    url: string;
    imageUrl?: string | null;
    note: string;
  }>;
}

export interface ShoppingSearchPayload {
  kind: 'search';
  query: string;
  products: ShoppingOfferUi[];
  alternatives: ShoppingAlternativesPayload | null;
  stores: ShoppingStoreStatusUi[];
  fetchedAt: number;
}

export interface ShoppingUiState {
  status: 'running' | 'done' | 'partial' | 'failed';
  kind: 'compare' | 'search' | 'alternatives';
  query: string;
  stores: string[];
  startedAt: number;
  finishedAt?: number;
  storeStatus?: ShoppingStoreStatusUi[];
  comparison?: ShoppingComparisonPayload | null;
  search?: ShoppingSearchPayload | null;
  note?: string;
}
