import { NextRequest, NextResponse } from 'next/server';
import { withStore } from '@/lib/support/route-store';
import * as shop from '@/lib/shop/service';

/**
 * GET /api/shop/customers            — demo customer directory (for the dashboard / demo page)
 *
 * Hydrated like every other state-reading route: a cancellation applied on another
 * instance has to show here, not this process's stale copy of the shop.
 * GET /api/shop/customers?phone=...  — lookup one customer with their orders
 */
export const GET = withStore(async (request: NextRequest) => {
  const phone = request.nextUrl.searchParams.get('phone');
  if (phone) {
    const customer = shop.findCustomerByPhone(phone);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    return NextResponse.json({
      customer: shop.toCustomerSnapshot(customer),
      orders: shop.listOrdersForCustomer(customer.id, 10).map(shop.summarizeOrder),
      tickets: shop.listTickets(customer.id),
    });
  }
  return NextResponse.json({
    customers: shop.listCustomers().map((c) => ({
      ...shop.toCustomerSnapshot(c),
      preferredLanguage: c.preferredLanguage,
      orders: shop.listOrdersForCustomer(c.id, 10).map((o) => ({
        order_id: o.id,
        status: o.status,
        items: o.items.map((i) => `${i.qty} x ${i.title}`),
        total_inr: o.totalInr,
        expected_delivery: o.expectedDelivery,
      })),
    })),
  });
});
