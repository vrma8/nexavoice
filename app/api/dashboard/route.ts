import { NextResponse } from 'next/server';
import { getDashboardSnapshot } from '@/lib/support/store';

export const dynamic = 'force-dynamic';

/** GET /api/dashboard — live snapshot for the human agent dashboard (polled). */
export async function GET() {
  return NextResponse.json(getDashboardSnapshot(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
