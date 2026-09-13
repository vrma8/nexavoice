import { prisma } from '@/lib/db';

export interface WalletTransactionView {
  id: string;
  amountInr: number;
  label: string;
  orderCode: string | null;
  createdAt: number;
}

export interface WalletView {
  balanceInr: number;
  transactions: WalletTransactionView[];
}

export const MAX_TOP_UP_INR = 100000;

export function toWalletView(balanceInr: number, rows: Array<{
  id: string;
  amountInr: number;
  label: string;
  orderCode: string | null;
  createdAt: Date;
}>): WalletView {
  return {
    balanceInr,
    transactions: rows.map((row) => ({
      id: row.id,
      amountInr: row.amountInr,
      label: row.label,
      orderCode: row.orderCode,
      createdAt: row.createdAt.getTime(),
    })),
  };
}

export async function getWallet(clientId: string, take = 12): Promise<WalletView> {
  const [client, rows] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
    prisma.walletTransaction.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take,
    }),
  ]);
  return toWalletView(client.walletBalanceInr, rows);
}

export async function addWalletMoney(clientId: string, amountInr: number): Promise<WalletView> {
  const amount = Math.floor(Number(amountInr));
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error('Enter an amount of at least ₹1 to add.');
  }
  if (amount > MAX_TOP_UP_INR) {
    throw new Error(`A single top-up can add at most ₹${MAX_TOP_UP_INR.toLocaleString('en-IN')}.`);
  }
  await prisma.$transaction([
    prisma.client.update({
      where: { id: clientId },
      data: { walletBalanceInr: { increment: amount } },
    }),
    prisma.walletTransaction.create({
      data: { clientId, amountInr: amount, label: 'NexaCash added' },
    }),
  ]);
  return getWallet(clientId);
}

export type WalletTx = {
  client: {
    findUniqueOrThrow: (args: { where: { id: string } }) => Promise<{ walletBalanceInr: number }>;
    update: (args: { where: { id: string }; data: unknown }) => Promise<unknown>;
  };
  walletTransaction: {
    create: (args: { data: unknown }) => Promise<unknown>;
  };
};

type Tx = WalletTx;

export async function chargeWalletOn(
  tx: Tx,
  clientId: string,
  amountInr: number,
  label: string,
  orderCode?: string,
): Promise<void> {
  if (amountInr <= 0) return;
  const client = await tx.client.findUniqueOrThrow({ where: { id: clientId } });
  if (client.walletBalanceInr < amountInr) {
    throw new Error(
      `Not enough NexaCash: this needs ₹${amountInr.toLocaleString('en-IN')} but the wallet holds ` +
        `₹${client.walletBalanceInr.toLocaleString('en-IN')}. Add money to the wallet or pick another payment method.`,
    );
  }
  await tx.client.update({
    where: { id: clientId },
    data: { walletBalanceInr: { decrement: amountInr } },
  });
  await tx.walletTransaction.create({
    data: { clientId, amountInr: -amountInr, label, orderCode: orderCode ?? null },
  });
}

export async function refundWalletOn(
  tx: Tx,
  clientId: string,
  amountInr: number,
  label: string,
  orderCode?: string,
): Promise<void> {
  if (amountInr <= 0) return;
  await tx.client.update({
    where: { id: clientId },
    data: { walletBalanceInr: { increment: amountInr } },
  });
  await tx.walletTransaction.create({
    data: { clientId, amountInr, label, orderCode: orderCode ?? null },
  });
}

export async function chargeWallet(
  clientId: string,
  amountInr: number,
  label: string,
  orderCode?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await chargeWalletOn(tx as unknown as Tx, clientId, amountInr, label, orderCode);
  });
}

export async function refundWallet(
  clientId: string,
  amountInr: number,
  label: string,
  orderCode?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await refundWalletOn(tx as unknown as Tx, clientId, amountInr, label, orderCode);
  });
}
