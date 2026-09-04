/**
 * Offline replacement for `prisma db push`.
 *
 * The Prisma 7 CLI still tries to download the native `schema-engine` binary
 * from binaries.prisma.sh, which is blocked in this environment. This script
 * produces the same result offline using the WASM schema engine
 * (`@prisma/schema-engine-wasm`):
 *
 *   1. It ensures the database from `DATABASE_URL` exists.
 *   2. It renders the SQL that Prisma would run to create the schema (a diff
 *      from an empty database to the Prisma schema) without introspecting the
 *      live database, so no `pg_catalog` type-mapping edge cases are hit.
 *   3. It applies that SQL through the Postgres driver adapter.
 *
 * Run it with `pnpm db:push`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { bindMigrationAwareSqlAdapterFactory } from '@prisma/driver-adapter-utils';
import { SchemaEngine } from '@prisma/schema-engine-wasm';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

// .env.local takes precedence over .env (Next.js convention).
if (existsSync('.env')) loadEnv({ path: '.env', override: false });
if (existsSync('.env.local')) loadEnv({ path: '.env.local', override: true });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env.local or .env.');
  process.exit(1);
}

const url = new URL(DATABASE_URL);
const targetDb = (url.pathname || '/postgres').replace(/^\//, '') || 'postgres';

// ---------------------------------------------------------------------------
// Database creation
// ---------------------------------------------------------------------------

async function ensureDatabase() {
  const adminUrl = new URL(DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
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
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`,
    );
    return res.rows[0].n > 0;
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const schemaPath = process.env.PRISMA_SCHEMA_PATH ?? 'prisma/schema.prisma';
const schemaContent = readFileSync(schemaPath, 'utf8');

await ensureDatabase();

// `bindMigrationAwareSqlAdapterFactory` re-exposes the driver adapter as a
// plain object whose methods are bound (and return the `{ ok, value }`
// result protocol the WASM engine expects).
const engineFactory = bindMigrationAwareSqlAdapterFactory(
  new PrismaPg({ connectionString: DATABASE_URL }),
);
const engine = await SchemaEngine.new(
  { datamodels: [[schemaPath, schemaContent]] },
  (line) => process.stderr.write(String(line)),
  engineFactory,
);

try {
  // Render the SQL Prisma would execute to create the schema from scratch.
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

  const hasTables = await databaseHasUserTables();
  if (hasTables) {
    console.error(
      `⚠ Database "${targetDb}" already contains tables; skipping baseline apply to avoid destructive changes.\n` +
        `  Run the SQL below manually (or reset the database) if you need to re-sync it:\n\n${diff.stdout}`,
    );
    process.exit(1);
  }

  const adapter = await new PrismaPg({ connectionString: DATABASE_URL }).connect();
  try {
    await adapter.executeScript(diff.stdout);
  } finally {
    await adapter.dispose();
  }

  console.log(`✔ Database "${targetDb}" is in sync with the Prisma schema.`);
} finally {
  engine.free();
}
