/**
 * Route wrapper that puts the durable store mirror around a route handler.
 *
 * On Vercel every route handler is a separate function invocation that may land on
 * a cold or different instance, so a handler must (1) pull the shared snapshot
 * before touching the store and (2) push its writes back before responding —
 * Vercel freezes the instance the moment the response is flushed, which discards
 * any pending background write.
 *
 * `persist: 'always'` is for read-only routes that still have to record that they
 * observed remote state; the default only writes when something actually changed.
 */
import { maybeSeedAuthData } from '../auth';
import { maybeSeedDemoData } from './seed';
import { flushStore, hydrateStore } from './store';

export interface WithStoreOptions {
  /** Skip the pre-handler read for handlers that never touch the store. */
  hydrate?: boolean;
}

export function withStore<T extends (...args: never[]) => Promise<unknown>>(
  handler: T,
  options: WithStoreOptions = {},
): T {
  const wrapped = async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    if (options.hydrate !== false) {
      await hydrateStore();
      // Opt-in demo data (`NEXAVOICE_SEED=demo`), after the hydration so it sees what
      // other instances already wrote, and once per process. Never throws.
      await maybeSeedDemoData();
      // Demo login identities (Client / Agent rows), once per process. Never throws.
      await maybeSeedAuthData();
    }
    try {
      return (await handler(...args)) as Awaited<ReturnType<T>>;
    } finally {
      // Flush even when the handler threw: a conversation created before a failed
      // agent start still has to be visible to the dashboard and to a retry.
      await flushStore();
    }
  };
  return wrapped as unknown as T;
}
