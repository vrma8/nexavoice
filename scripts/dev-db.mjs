/**
 * Zero-install PostgreSQL for local development.
 *
 * The app needs a real PostgreSQL (clients, the 50-product catalogue, carts,
 * orders and the mirrored support store all live there), but asking someone who
 * just cloned the repo to install a database server first is a poor first run.
 * PGlite is a full PostgreSQL compiled to WASM; `@electric-sql/pglite-socket`
 * puts it behind a TCP socket, so Prisma, `pnpm db:push` and `psql` talk to it
 * exactly as they would to a real server.
 *
 *   pnpm dev:db                      # starts on 127.0.0.1:5433, data in .data/pglite
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
 *
 * Keep it running in its own terminal, then in another:
 *   pnpm db:push && pnpm seed && pnpm dev
 *
 * It is a development convenience only: one WASM database engine serialises every
 * query, so it is slower than a real server under load and offers no durability
 * guarantees. Use a managed PostgreSQL (Neon, Supabase, Vercel Postgres, RDS…)
 * for anything deployed.
 */
import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.DEV_DB_PORT ?? 5433);
const HOST = process.env.DEV_DB_HOST ?? '127.0.0.1';
const DATA_DIR = process.env.DEV_DB_DIR ?? '.data/pglite';

mkdirSync(DATA_DIR, { recursive: true });

const db = await PGlite.create({ dataDir: DATA_DIR });
const server = new PGLiteSocketServer({
  db,
  port: PORT,
  host: HOST,
  // Prisma opens a connection pool and the schema engine adds its own connection;
  // the default of 1 would make those fail with "connection terminated".
  maxConnections: Number(process.env.DEV_DB_MAX_CONNECTIONS ?? 20),
});
await server.start();

console.log(`✔ PGlite listening on ${HOST}:${PORT} (data: ${DATA_DIR})`);
console.log('  Put this in .env.local:');
console.log(`  DATABASE_URL=postgresql://postgres:postgres@${HOST}:${PORT}/postgres`);
console.log('  Then, in another terminal: pnpm db:push && pnpm seed && pnpm dev');
console.log('  Press Ctrl+C to stop.');

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await db.close();
  console.log('\n✔ Stopped.');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
