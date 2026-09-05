import { NextRequest, NextResponse } from 'next/server';
import { requireClient } from '@/lib/shop/http';
import { addToCart, clearCart, getCart, setCartQty } from '@/lib/shop/service';

export const dynamic = 'force-dynamic';

/** GET /api/shop/cart — the signed-in client's cart. */
export async function GET(request: NextRequest) {
  const lookup = await requireClient(request);
  if (!lookup.ok) return lookup.response;
  return NextResponse.json({ cart: await getCart(lookup.client.id) });
}

/** POST /api/shop/cart  { productId, qty? } — add a catalogue product. */
export async function POST(request: NextRequest) {
  const lookup = await requireClient(request);
  if (!lookup.ok) return lookup.response;
  const body = (await request.json().catch(() => ({}))) as { productId?: string; qty?: number };
  if (!body.productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  try {
    const cart = await addToCart(lookup.client.id, body.productId, Number(body.qty) || 1);
    return NextResponse.json({ cart });
  } catch {
    return NextResponse.json({ error: 'That product is not in the catalogue.' }, { status: 404 });
  }
}

/** PATCH /api/shop/cart  { productId, qty } — set a line quantity (0 removes). */
export async function PATCH(request: NextRequest) {
  const lookup = await requireClient(request);
  if (!lookup.ok) return lookup.response;
  const body = (await request.json().catch(() => ({}))) as { productId?: string; qty?: number };
  if (!body.productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  const cart = await setCartQty(lookup.client.id, body.productId, Number(body.qty) || 0);
  return NextResponse.json({ cart });
}

/** DELETE /api/shop/cart — empty the cart. */
export async function DELETE(request: NextRequest) {
  const lookup = await requireClient(request);
  if (!lookup.ok) return lookup.response;
  await clearCart(lookup.client.id);
  return NextResponse.json({ cart: await getCart(lookup.client.id) });
}
