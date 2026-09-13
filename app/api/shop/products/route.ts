import { NextResponse } from 'next/server';
import { hasDatabaseUrl } from '@/lib/db';
import { listProducts } from '@/lib/shop/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { error: 'Database is not configured. Set DATABASE_URL (PostgreSQL) and run pnpm db:push.' },
      { status: 503 },
    );
  }
  try {
    const products = await listProducts();
    return NextResponse.json({ products }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[shop] products failed:', error);
    return NextResponse.json({ error: 'Could not load the catalogue.' }, { status: 500 });
  }
}
