import { NextResponse } from 'next/server';
import { getDashboardSnapshot } from '@/lib/support/store';
import { withStore } from '@/lib/support/route-store';

export const dynamic = 'force-dynamic';

async function handleGet() {
  return NextResponse.json(getDashboardSnapshot(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const GET = withStore(handleGet);
