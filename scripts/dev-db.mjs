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
