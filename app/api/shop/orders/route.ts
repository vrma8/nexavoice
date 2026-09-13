import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireClient } from '@/lib/shop/http';
import { getCart, listOrders, placeOrder } from '@/lib/shop/service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const lookup = await requireClient(request);
  if (!lookup.ok) return lookup.response;
  const orders = await listOrders(lookup.client.id);
  return NextResponse.json({ orders, now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const lookup = await requireClient(request);
  if (!lookup.ok) return lookup.response;
  const body = (await request.json().catch(() => ({}))) as {
    shippingAddress?: string;
    paymentMethod?: string;
  };
  const address = body.shippingAddress?.trim() || lookup.client.address;
  const result = await placeOrder(lookup.client.id, {
    shippingAddress: address,
    paymentMethod: body.paymentMethod,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 400 });
  }
  if (address && address !== lookup.client.address) {
    await prisma.client.update({ where: { id: lookup.client.id }, data: { address } });
  }
  return NextResponse.json(
    { order: result.data, orders: await listOrders(lookup.client.id), cart: await getCart(lookup.client.id) },
    { status: 201 },
  );
}
