import { NextRequest, NextResponse } from 'next/server';
import { requireClient } from '@/lib/shop/http';
import {
  addItemToOrder,
  cancelOrder,
  getOrderForClient,
  listOrders,
  removeItemFromOrder,
  setOrderItemQty,
  updateOrderAddress,
} from '@/lib/shop/service';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** GET /api/shop/orders/:code — one order of the signed-in client. */
export async function GET(request: NextRequest, { params }: Params) {
  const lookup = await requireClient(request);
  if (!lookup.ok) return lookup.response;
  const { id } = await params;
  const found = await getOrderForClient(lookup.client.id, id);
  if (!found.ok) return NextResponse.json({ error: found.error.message }, { status: 404 });
  return NextResponse.json({ order: found.data });
}

/**
 * PATCH /api/shop/orders/:code
 * Body: { action: 'add_item' | 'remove_item' | 'set_qty' | 'cancel' | 'address', … }
 *
 * The customer editing their own order by hand. It runs through the same
 * service functions as the AI agent's tools, so the "only while PLACED" rule
 * cannot be bypassed from the UI either.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const lookup = await requireClient(request);
  if (!lookup.ok) return lookup.response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    productId?: string;
    product?: string;
    qty?: number;
    reason?: string;
    address?: string;
  };

  const clientId = lookup.client.id;
  const result = await (async () => {
    switch (body.action) {
      case 'add_item':
        return addItemToOrder(clientId, id, body.product ?? body.productId ?? '', Number(body.qty) || 1);
      case 'remove_item':
        return removeItemFromOrder(clientId, id, body.product ?? body.productId ?? '', body.qty);
      case 'set_qty':
        return setOrderItemQty(clientId, id, body.productId ?? '', Number(body.qty) || 0);
      case 'cancel':
        return cancelOrder(clientId, id, body.reason ?? 'cancelled by customer');
      case 'address':
        return updateOrderAddress(clientId, id, body.address ?? '');
      default:
        return { ok: false as const, error: { code: 'UNKNOWN_ACTION', message: 'Unknown action.' } };
    }
  })();

  if (!result.ok) {
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 400 });
  }
  return NextResponse.json({ order: result.data, orders: await listOrders(clientId) });
}
