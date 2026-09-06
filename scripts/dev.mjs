/**
 * One-command local development server.
 *
 * The shopping page (catalogue, cart, place-order) and the AI tools read
 * PostgreSQL through Prisma. The bundled zero-install PGlite dev database is
 * only reachable after `node scripts/dev-db.mjs` is running, and a fresh clone
 * also needs `pnpm db:push` + `pnpm seed`. Running just `pnpm dev` therefore
 * frequently leaves the app up but unable to load the cart, add items or place
 * an order — the UI looks broken even though Next.js started cleanly.
 *
 * This script makes `pnpm dev` complete: when `DATABASE_URL` points at the
 * local PGlite host/port it starts it, waits for it, applies the schema and
 * seeds the 60-product catalogue before launching Next. Remote databases are
 * left untouched.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import net from 'node:net';

const root = process.cwd();
if (existsSync('.env.local')) loadEnv({ path: '.env.local', override: true });

function isLocalDatabaseUrl(value) {
  try {
    const url = new URL(value);
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(Number(port), host);
  });
}

async function waitForPort(host, port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(host, port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function run(script, args, { allowExistingTables = false, quiet = false } = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'pipe',
    env: process.env,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    // `scripts/db-push.mjs` is an offline baseline apply: once a dev database
    // already has the tables it refuses to touch them. That is the normal state
    // on the second `pnpm dev`, so treat it as "already pushed" instead of
    // blocking the developer from starting the app.
    if (allowExistingTables && /already contains tables/.test(output)) return;
    process.stderr.write(output || `${script} failed with no output.\n`);
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
  if (!quiet) process.stdout.write(output);
}

/**
 * Starts the bundled PGlite database only when the configured URL is the local
 * dev database. Remote/managed databases are already reachable; starting a
 * local socket for them would mask the real deployment issue.
 */
async function ensureLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl || !isLocalDatabaseUrl(databaseUrl)) return null;

  const url = new URL(databaseUrl);
  const port = Number(url.port || 5432);
  const host = url.hostname === '::1' || url.hostname === '[::1]' ? '127.0.0.1' : url.hostname;

  let dbProcess = null;
  if (!(await isPortOpen(host, port))) {
    console.log(`[dev] Starting PGlite dev database on ${host}:${port} …`);
    dbProcess = spawn(process.execPath, ['scripts/dev-db.mjs'], { cwd: root, stdio: 'inherit' });
    const ready = await waitForPort(host, port, 20_000);
    if (!ready) {
      if (dbProcess) dbProcess.kill('SIGKILL');
      throw new Error('PGlite dev database did not start in time.');
    }
  } else {
    console.log(`[dev] PGlite dev database already running on ${host}:${port}.`);
  }

  run('db:push', ['scripts/db-push.mjs'], { allowExistingTables: true });
  run('seed', ['--env-file-if-exists=.env.local', '--import', 'tsx', 'scripts/seed-catalog.ts']);
  return dbProcess;
}

async function main() {
  const dbProcess = await ensureLocalDatabase();

  const nextBin = existsSync('node_modules/next/dist/bin/next')
    ? 'node_modules/next/dist/bin/next'
    : existsSync('node_modules/.bin/next')
      ? 'node_modules/.bin/next'
      : 'next';
  const next = spawn(process.execPath, [nextBin, 'dev', '--webpack', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  const shutdown = () => {
    try {
      next.kill('SIGTERM');
    } catch {
      // already gone
    }
    if (dbProcess) {
      try {
        dbProcess.kill('SIGTERM');
      } catch {
        // already gone
      }
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  next.on('exit', (code) => {
    if (dbProcess) {
      try {
        dbProcess.kill('SIGTERM');
      } catch {
        // already gone
      }
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error('[dev]', error instanceof Error ? error.message : error);
  process.exit(1);
});
