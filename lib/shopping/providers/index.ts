import type { StoreId } from '../types';
import { isStoreId, STORE_IDS } from '../types';
import type { StoreProvider } from './base';
import { amazonProvider } from './amazon';
import { flipkartProvider } from './flipkart';

export type { StoreProvider } from './base';
export { assertStoreUrl } from './base';

export const PROVIDERS: Record<StoreId, StoreProvider> = {
  amazon: amazonProvider,
  flipkart: flipkartProvider,
};

export function getProvider(id: StoreId): StoreProvider {
  return PROVIDERS[id];
}

export function resolveStores(requested?: string[] | null): { stores: StoreId[]; unknown: string[] } {
  const enabled = (process.env.RETAIL_INTEL_STORES ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const base = requested && requested.length > 0 ? requested : enabled.length > 0 ? enabled : [...STORE_IDS];
  const stores: StoreId[] = [];
  const unknown: string[] = [];
  for (const raw of base.map((s) => s.toLowerCase())) {
    if (isStoreId(raw)) {
      if (!stores.includes(raw) && (!enabled.length || enabled.includes(raw))) stores.push(raw);
    } else {
      unknown.push(raw);
    }
  }
  return { stores, unknown };
}
