import { NextRequest, NextResponse } from 'next/server';
import { listCases } from '@/lib/support/store';
import type { SupportCase } from '@/lib/support/types';

/** GET /api/cases?status=WAITING_FOR_HUMAN,HUMAN_HANDLING — list cases for the dashboard. */
export async function GET(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get('status');
  const status = statusParam
    ? (statusParam.split(',').map((s) => s.trim().toUpperCase()) as SupportCase['status'][])
    : undefined;
  return NextResponse.json({ cases: listCases(status ? { status } : undefined) });
}
