import { NextRequest, NextResponse } from 'next/server';
import { withStore } from '@/lib/support/route-store';
import * as shop from '@/lib/shop/service';

/** GET /api/shop/tickets — tickets created by the AI / chat flows (dashboard). */
export const GET = withStore(async (request: NextRequest) => {
  const customerId = request.nextUrl.searchParams.get('customer_id') ?? undefined;
  return NextResponse.json({ tickets: shop.listTickets(customerId) });
});
