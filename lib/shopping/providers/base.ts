import type { NormalizedProduct, SearchOptions, StoreId } from '../types';
import { StoreHttpError } from '../types';
import type { Fetcher } from '../http';

export interface StoreProvider {
  readonly id: StoreId;
  readonly label: string;
  readonly allowedHosts: string[];
  search(query: string, opts: Required<Pick<SearchOptions, 'limit'>> & SearchOptions, fetcher: Fetcher): Promise<NormalizedProduct[]>;
  getProductDetails(url: string, fetcher: Fetcher): Promise<NormalizedProduct>;
}

export function assertStoreUrl(provider: StoreProvider, url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new StoreHttpError('INVALID_URL', `"${url}" is not a valid URL`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new StoreHttpError('INVALID_URL', `only http(s) product pages can be read, not "${parsed.protocol}//"`);
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = provider.allowedHosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (!allowed) {
    throw new StoreHttpError(
      'INVALID_URL',
      `"${host}" is not a ${provider.label} host — only ${provider.allowedHosts.join(', ')} pages are supported`,
    );
  }
  return parsed;
}
