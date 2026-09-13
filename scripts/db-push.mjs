import { existsSync, readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { bindMigrationAwareSqlAdapterFactory } from '@prisma/driver-adapter-utils';
import { SchemaEngine } from '@prisma/schema-engine-wasm';

if (existsSync('.env')) loadEnv({ path: '.env', override: false });
if (existsSync('.env.local')) loadEnv({ path: '.env.local', override: true });

const SCHEMA_URL = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
const SCHEMA_URL_SOURCE = process.env.DIRECT_URL?.trim() ? 'DIRECT_URL' : 'DATABASE_URL';
if (!SCHEMA_URL) {
  console.error('Neither DIRECT_URL nor DATABASE_URL is set. Add DATABASE_URL to .env.local or .env.');
  process.exit(1);
}

function isLocalHost(host) {
  const h = String(host ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return h === '' || h === 'localhost' || h === '::1' || h === '127.0.0.1' || h.startsWith('127.') || !h.includes('.');
}

function resolvePgSsl(connectionString) {
  const url = String(connectionString ?? '').trim();
  if (!url) return undefined;
  let host = '';
  let sslmode = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    sslmode = (parsed.searchParams.get('sslmode') ?? '').trim().toLowerCase();
  } catch {
    return undefined;
  }
  if (sslmode === 'disable' || sslmode === 'allow') return false;
  if (sslmode === 'verify-full' || sslmode === 'verify-ca') return {};
  if (sslmode === 'require' || sslmode === 'prefer' || sslmode === 'no-verify') {
    return { rejectUnauthorized: false };
  }
  return isLocalHost(host) ? undefined : { rejectUnauthorized: false };
}

function sanitizeConnectionString(connectionString) {
  try {
    const parsed = new URL(connectionString);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return connectionString;
  }
}

function pgOptions(connectionString) {
  return {
    connectionString: sanitizeConnectionString(connectionString),
    connectionTimeoutMillis: 15000,
    ssl: resolvePgSsl(connectionString),
  };
}

function mask(connectionString) {
  try {
    const parsed = new URL(connectionString);
    const user = parsed.username ? `${decodeURIComponent(parsed.username)}@` : '';
    return `${parsed.protocol}//${user}${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return '(unparseable)';
  }
}

console.log(`→ Using ${SCHEMA_URL_SOURCE}: ${mask(SCHEMA_URL)}`);

const url = new URL(SCHEMA_URL);
const targetDb = (url.pathname || '/postgres').replace(/^\//, '') || 'postgres';

async function ensureDatabase() {
  const adminUrl = new URL(SCHEMA_URL);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client(pgOptions(adminUrl.toString()));
  await admin.connect();
  try {
    const res = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
    if (res.rowCount === 0) {
      if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(targetDb)) {
        throw new Error(`Unsafe database name for CREATE DATABASE: ${targetDb}`);
      }
      await admin.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`✔ Created database "${targetDb}"`);
    }
  } finally {
    await admin.end();
  }
}

async function databaseHasUserTables() {
  const client = new pg.Client(pgOptions(SCHEMA_URL));
  await client.connect();
  try {
    const res = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM information_schema.tables
        WHERE table_schema = 'public'`,
    );
    return res.rows[0].n > 0;
  } finally {
    await client.end();
  }
}

const force = process.argv.includes('--force') || process.argv.includes('-f');
if (force && process.env.NODE_ENV === 'production') {
  console.error('Refusing to run --force with NODE_ENV=production.');
  process.exit(1);
}

const schemaPath = process.env.PRISMA_SCHEMA_PATH ?? 'prisma/schema.prisma';
const schemaContent = readFileSync(schemaPath, 'utf8');

try {
  await ensureDatabase();
} catch (error) {
  console.error(`Could not reach the database via ${SCHEMA_URL_SOURCE} (${mask(SCHEMA_URL)}).`);
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  console.error('  Run `pnpm db:check` for a step-by-step diagnosis.');
  process.exit(1);
}

if (force) {
  const client = new pg.Client(pgOptions(SCHEMA_URL));
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    console.log(`✔ Dropped and recreated the public schema of "${targetDb}".`);
  } finally {
    await client.end();
  }
}

const engineFactory = bindMigrationAwareSqlAdapterFactory(
  new PrismaPg(pgOptions(SCHEMA_URL)),
);
const engine = await SchemaEngine.new(
  { datamodels: [[schemaPath, schemaContent]] },
  (line) => process.stderr.write(String(line)),
  engineFactory,
);

try {
  const diff = await engine.diff({
    from: { tag: 'empty' },
    to: { tag: 'schemaDatamodel', files: [{ content: schemaContent, path: schemaPath }] },
    script: true,
    exitCode: null,
    filters: { externalTables: [], externalEnums: [] },
  });

  if (!diff.stdout?.trim()) {
    console.log(`ℹ Database "${targetDb}" needs no schema changes.`);
    process.exit(0);
  }

  const hasTables = !force && (await databaseHasUserTables());
  if (hasTables) {
    console.error(
      `⚠ Database "${targetDb}" already contains tables; skipping baseline apply to avoid destructive changes.\n` +
        `  Re-run with \`--force\` to drop and recreate the schema (development only),\n` +
        `  or run the SQL below manually:\n\n${diff.stdout}`,
    );
    process.exit(1);
  }

  const adapter = await new PrismaPg(pgOptions(SCHEMA_URL)).connect();
  try {
    await adapter.executeScript(diff.stdout);
  } finally {
    await adapter.dispose();
  }

  console.log(`✔ Database "${targetDb}" is in sync with the Prisma schema.`);
} finally {
  engine.free();
}
