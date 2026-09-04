import { NextRequest, NextResponse } from 'next/server';
import { withStore } from '@/lib/support/route-store';
import * as shop from '@/lib/shop/service';

type Params = { params: Promise<{ id: string }> };

/** GET /api/shop/orders/:id — full order record with history (dashboard). */
export const GET = withStore(async (_request: NextRequest, { params }: Params) => {
  const { id } = await params;
  const order = shop.getOrder(id);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const customer = shop.getCustomer(order.customerId);
  return NextResponse.json({
    order: { ...shop.summarizeOrder(order), history: order.history },
    customer: customer ? shop.toCustomerSnapshot(customer) : null,
  });
});
