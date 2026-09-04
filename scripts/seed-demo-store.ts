/**
 * Fills the durable support store with the demo fixture in `lib/support/seed.ts`.
 *
 *   pnpm run seed            # reads .env.local, seeds once, prints what it wrote
 *   pnpm run seed -- --force # adds any missing demo record even if the store has data
 *
 * Normally you do not need this: set `NEXAVOICE_SEED=demo` on the deployment and the app
 * seeds itself with its own credentials. This script is for pointing at a store from a
 * terminal — e.g. seeding the PostgreSQL database before anyone opens the dashboard. In
 * that case `DATABASE_URL` must be in the environment (put it in `.env.local`, which
 * this script loads and which `.gitignore` keeps out of the repository).
 *
 * The write goes through the same hydrate → merge → flush path as a request, so seeding
 * never clobbers a conversation that already exists in the store.
 */
import { seedDemoData, type SeedResult } from '../lib/support/seed';
import { flushStore, getStoreSyncStatus, hydrateStore, listCases, listConversations } from '../lib/support/store';

async function main(): Promise<void> {
  await hydrateStore();
  const status = getStoreSyncStatus();

  if (status.backend === 'none') {
    console.error(
      [
        'Nothing to seed: no durable backend is configured, so writes would live in this',
        'process only and disappear the moment it exits.',
        '',
        '  • Seeding a deployment: set NEXAVOICE_SEED=demo in the project instead',
        '    (Project Settings → Environment Variables → Production). The app will fill',
        '    its own store on the next request — no token needed here.',
        '  • Seeding a store from this terminal: put DATABASE_URL in .env.local',
        '    (PostgreSQL connection string) and run `pnpm db:push`, then re-run.',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  const result: SeedResult = seedDemoData();
  // flushStore() is what makes this visible to the deployment: it merges with the
  // remote document first, so records written between the hydrate above and here are
  // preserved rather than overwritten.
  await flushStore();

  const after = getStoreSyncStatus();
  console.log(
    [
      `backend: ${after.backend} (${after.target})`,
      result.created.length
        ? `seeded:  ${result.created.join(', ')}`
        : `skipped: ${result.reason ?? 'demo records already present'}`,
      `state:   ${listConversations().length} conversations, ${listCases().length} cases, revision ${after.syncedRevision}`,
      after.lastError ? `warning: ${after.lastError}` : '',
      '',
      'Open /support-agent to see the queue. Existing records are never overwritten,',
      'so this is safe to run again after a store reset.',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  const hadData = listConversations().length > result.created.length;
  if (result.created.length === 0 && hadData) {
    console.log('every demo record is already present — nothing was changed.');
  }
  if (after.lastError) process.exitCode = 1;
}

main().catch((error) => {
  console.error('seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
