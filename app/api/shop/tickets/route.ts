import { NextRequest, NextResponse } from 'next/server';
import * as shop from '@/lib/shop/service';

/** GET /api/shop/tickets — tickets created by the AI / chat flows (dashboard). */
export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get('customer_id') ?? undefined;
  return NextResponse.json({ tickets: shop.listTickets(customerId) });
}
