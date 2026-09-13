import { NextRequest, NextResponse } from 'next/server';
import { listCases } from '@/lib/support/store';
import type { SupportCase } from '@/lib/support/types';
import { withStore } from '@/lib/support/route-store';

async function handleGet(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get('status');
  const status = statusParam
    ? (statusParam.split(',').map((s) => s.trim().toUpperCase()) as SupportCase['status'][])
    : undefined;
  return NextResponse.json({ cases: listCases(status ? { status } : undefined) });
}

export const GET = withStore(handleGet);
