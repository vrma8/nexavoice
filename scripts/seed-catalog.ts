/**
 * Writes the fixed 60-product NexaMart catalogue into PostgreSQL.
 *
 * The app also seeds it lazily on the first catalogue read (`ensureCatalog()`),
 * so this script is only needed when you want the products in place before
 * anyone opens the shopping page:
 *
 *   pnpm db:push && pnpm seed
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is not set — add it to .env.local, then run `pnpm db:push`.');
    process.exit(1);
  }
  const { ensureCatalog, listProducts } = await import('../lib/shop/service');
  await ensureCatalog();
  const products = await listProducts();
  console.log(`✔ Catalogue ready: ${products.length} products`);
  const { prisma } = await import('../lib/db');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Seeding the catalogue failed:', error);
  process.exit(1);
});
