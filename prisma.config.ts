// Prisma ORM 7 configuration.
//
// Prisma 7 no longer reads `url` from schema.prisma — the datasource connection
// string lives here. The Prisma CLI also stopped auto-loading .env, so we load
// Next.js's `.env.local` (and plain `.env`) explicitly.
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

// `prisma generate` parses with the bundled WASM parser and compiles with the
// WASM query compiler — it never invokes the native engines. Pointing the
// binary lookups at a stub (the Node executable, which always exists) skips
// both the schema-engine and libquery-engine downloads from
// binaries.prisma.sh, so `postinstall` / `generate` work on restricted
// networks too. `db push`/`migrate`/`studio` are unaffected (they still use
// the real downloaded engines when present — and at runtime the generated
// client goes through the WASM query compiler + `@prisma/adapter-pg`, never
// the native query engine).
if (process.argv.includes('generate')) {
  process.env.PRISMA_SCHEMA_ENGINE_BINARY = process.execPath;
  if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = process.execPath;
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx scripts/seed-catalog.ts',
  },
});