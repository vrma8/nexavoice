import { maybeSeedAuthData } from '../auth';
import { flushStore, hydrateStore } from './store';

export interface WithStoreOptions {
  hydrate?: boolean;
}

export function withStore<T extends (...args: never[]) => Promise<unknown>>(
  handler: T,
  options: WithStoreOptions = {},
): T {
  const wrapped = async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    if (options.hydrate !== false) {
      await hydrateStore();
      await maybeSeedAuthData();
    }
    try {
      return (await handler(...args)) as Awaited<ReturnType<T>>;
    } finally {
      await flushStore();
    }
  };
  return wrapped as unknown as T;
}
