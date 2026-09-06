import { NextRequest, NextResponse } from 'next/server';
import { listCases } from '@/lib/support/store';
import type { SupportCase } from '@/lib/support/types';
import { withStore } from '@/lib/support/route-store';

/** GET /api/cases?status=WAITING_FOR_HUMAN,HUMAN_HANDLING — list cases for the dashboard. */
async function handleGet(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get('status');
  const status = statusParam
    ? (statusParam.split(',').map((s) => s.trim().toUpperCase()) as SupportCase['status'][])
    : undefined;
  return NextResponse.json({ cases: listCases(status ? { status } : undefined) });
}

// Bracketed by withStore so the durable store mirror is read before the
// handler runs and written back before the response is flushed (serverless).
export const GET = withStore(handleGet);
