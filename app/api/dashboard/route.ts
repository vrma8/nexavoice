import { NextResponse } from 'next/server';
import { getDashboardSnapshot } from '@/lib/support/store';
import { withStore } from '@/lib/support/route-store';

export const dynamic = 'force-dynamic';

/** GET /api/dashboard — live snapshot for the human agent dashboard (polled). */
async function handleGet() {
  return NextResponse.json(getDashboardSnapshot(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

// Bracketed by withStore so the durable store mirror is read before the
// handler runs and written back before the response is flushed (serverless).
export const GET = withStore(handleGet);
