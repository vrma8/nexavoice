// Prisma ORM 7 configuration.
//
// Prisma 7 no longer reads `url` from schema.prisma — the datasource connection
// string lives here. The Prisma CLI also stopped auto-loading .env, so we load
// Next.js's `.env.local` (and plain `.env`) explicitly.
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
