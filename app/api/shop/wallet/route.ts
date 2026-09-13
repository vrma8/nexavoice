import { NextRequest, NextResponse } from 'next/server';
import { requireClient } from '@/lib/shop/http';
import { addWalletMoney, getWallet } from '@/lib/shop/wallet';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const lookup = await requireClient(request);
  if (!lookup.ok) return lookup.response;
  const wallet = await getWallet(lookup.client.id);
  return NextResponse.json({ wallet }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const lookup = await requireClient(request);
  if (!lookup.ok) return lookup.response;
  const body = (await request.json().catch(() => ({}))) as { amountInr?: unknown };
  const amount = Math.floor(Number(body.amountInr));
  if (!Number.isFinite(amount) || amount < 1) {
    return NextResponse.json({ error: 'Enter an amount of at least ₹1 to add.' }, { status: 400 });
  }
  try {
    const wallet = await addWalletMoney(lookup.client.id, amount);
    return NextResponse.json({ wallet });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not add money to the wallet.' },
      { status: 400 },
    );
  }
}
