import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

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