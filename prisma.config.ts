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
// WASM query compiler — it never invokes the native schema engine. Pointing the
// binary lookup at a stub (the Node executable, which always exists) skips the
// schema-engine download from binaries.prisma.sh, so `postinstall` / `generate`
// work on restricted networks too. `db push`/`migrate`/`studio` are unaffected
// (they still use the real downloaded engine when present).
if (process.argv.includes('generate')) {
  process.env.PRISMA_SCHEMA_ENGINE_BINARY = process.execPath;
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