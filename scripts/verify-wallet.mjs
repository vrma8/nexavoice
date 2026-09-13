import assert from 'node:assert/strict';

process.env.ORDER_PLACED_SECONDS = '3';
process.env.ORDER_EDIT_SECONDS = '2';
process.env.ORDER_TRANSIT_SECONDS = '3';

const { prisma } = await import('../lib/db.ts');
const shop = await import('../lib/shop/service.ts');
const wallet = await import('../lib/shop/wallet.ts');
const auth = await import('../lib/auth.ts');

const created = [];
const phone = String(9100000000 + Math.floor(Math.random() * 899999999));

function step(name) {
  console.log(`  • ${name}`);
}

try {
  await shop.ensureCatalog();

  step('new client gets the ₹500 welcome gift + ledger entry');
  const client = await auth.upsertClient({
    name: 'Wallet Tester',
    email: 'wallet.tester@example.com',
    phone,
    city: 'Lucknow',
    address: '1 Test Lane, Lucknow 226001',
    preferredLanguage: 'english',
  });
  created.push(client.id);
  assert.equal(client.walletBalanceInr, 500, 'welcome balance');
  const w0 = await wallet.getWallet(client.id);
  assert.equal(w0.balanceInr, 500);
  assert.ok(w0.transactions.some((t) => t.label.includes('Welcome gift')), 'welcome ledger entry');

  step('add money: +₹1000 via addWalletMoney');
  const w1 = await wallet.addWalletMoney(client.id, 1000);
  assert.equal(w1.balanceInr, 1500, 'balance after top-up');

  step('wallet order deducts the full total on placement');
  const products = await shop.listProducts();
  const cheap = [...products].sort((a, b) => a.priceInr - b.priceInr)[0];
  await shop.addToCart(client.id, cheap.id, 2);
  const cart = await shop.getCart(client.id);
  const placed = await shop.placeOrder(client.id, {
    shippingAddress: '1 Test Lane, Lucknow 226001',
    paymentMethod: 'WALLET',
  });
  assert.ok(placed.ok, `place wallet order: ${JSON.stringify(placed)}`);
  const afterPlace = await wallet.getWallet(client.id);
  assert.equal(afterPlace.balanceInr, 1500 - cart.totalInr, 'balance after wallet payment');
  assert.ok(
    afterPlace.transactions.some((t) => t.amountInr === -cart.totalInr && t.label.includes('Payment')),
    'payment ledger entry',
  );

  step('editing a wallet order charges/refunds the difference');
  const expensive = [...products].sort((a, b) => b.priceInr - a.priceInr)[0];
  {
    const bal = (await wallet.getWallet(client.id)).balanceInr;
    if (bal < expensive.priceInr) await wallet.addWalletMoney(client.id, expensive.priceInr - bal + 100);
  }
  const balBeforeAdd = (await wallet.getWallet(client.id)).balanceInr;
  const added = await shop.addItemToOrder(client.id, placed.data.code, expensive.sku, 1);
  assert.ok(added.ok, `add item: ${JSON.stringify(added)}`);
  const balAfterAdd = (await wallet.getWallet(client.id)).balanceInr;
  assert.equal(balAfterAdd, balBeforeAdd - expensive.priceInr, 'extra charge for added item');
  const removed = await shop.removeItemFromOrder(client.id, placed.data.code, expensive.sku);
  assert.ok(removed.ok, `remove item: ${JSON.stringify(removed)}`);
  const balAfterRemove = (await wallet.getWallet(client.id)).balanceInr;
  assert.equal(balAfterRemove, balBeforeAdd, 'refund for removed item');

  step('editing beyond the balance is refused and rolled back');
  const tooMuch = await wallet.addWalletMoney(client.id, 1); 
  void tooMuch;
  const huge = [...products].sort((a, b) => b.priceInr - a.priceInr);
  const currentBal = (await wallet.getWallet(client.id)).balanceInr;
  let overItem = null;
  for (const p of huge) {
    if (p.priceInr > currentBal) { overItem = p; break; }
  }
  if (overItem) {
    const over = await shop.addItemToOrder(client.id, placed.data.code, overItem.sku, 1);
    assert.equal(over.ok, false, 'over-balance edit must fail');
    assert.equal(over.error.code, 'INSUFFICIENT_BALANCE');
    assert.equal((await wallet.getWallet(client.id)).balanceInr, currentBal, 'no partial deduction');
  }

  step('pause_edit stops the status timer; resume_edit restarts it');
  const paused = await shop.pauseOrderEdit(client.id, placed.data.code);
  assert.ok(paused.ok, `pause: ${JSON.stringify(paused)}`);
  assert.equal(paused.data.paused, true, 'order reports paused');
  assert.equal(paused.data.nextChangeInMs, 0, 'no countdown while paused');
  await new Promise((r) => setTimeout(r, 4000)); 
  await shop.syncOrderStatuses(client.id);
  const stillPlaced = await shop.getOrderForClient(client.id, placed.data.code);
  assert.equal(stillPlaced.data.status, 'PLACED', 'paused order must not advance');
  const resumed = await shop.resumeOrderEdit(client.id, placed.data.code);
  assert.ok(resumed.ok, `resume: ${JSON.stringify(resumed)}`);
  assert.equal(resumed.data.paused, false, 'order reports running');
  assert.ok(resumed.data.nextChangeInMs > 0, 'countdown restarted');

  step('cancelling a wallet order refunds the full amount');
  const balBeforeCancel = (await wallet.getWallet(client.id)).balanceInr;
  const orderBeforeCancel = await shop.getOrderForClient(client.id, placed.data.code);
  const cancelled = await shop.cancelOrder(client.id, placed.data.code, 'wallet test');
  assert.ok(cancelled.ok, `cancel: ${JSON.stringify(cancelled)}`);
  const balAfterCancel = (await wallet.getWallet(client.id)).balanceInr;
  assert.equal(
    balAfterCancel,
    balBeforeCancel + orderBeforeCancel.data.totalInr,
    'full refund on cancel',
  );
  assert.ok(
    (await wallet.getWallet(client.id)).transactions.some((t) => t.label.includes('Refund')),
    'refund ledger entry',
  );

  step('a wallet order that exceeds the balance is rejected (no order created)');
  await shop.addToCart(client.id, huge[0].id, 10);
  const overCart = await shop.getCart(client.id);
  const balanceNow = (await wallet.getWallet(client.id)).balanceInr;
  if (overCart.totalInr > balanceNow) {
    const overPlace = await shop.placeOrder(client.id, {
      shippingAddress: '1 Test Lane, Lucknow 226001',
      paymentMethod: 'WALLET',
    });
    assert.equal(overPlace.ok, false, 'over-balance placement must fail');
    assert.equal(overPlace.error.code, 'INSUFFICIENT_BALANCE');
    const orders = await shop.listOrders(client.id);
    assert.ok(!orders.some((o) => o.totalInr === overCart.totalInr), 'no order was created');
  }

  step('COD orders leave the wallet untouched');
  const balBeforeCod = (await wallet.getWallet(client.id)).balanceInr;
  await shop.clearCart(client.id);
  await shop.addToCart(client.id, cheap.id, 1);
  const cod = await shop.placeOrder(client.id, {
    shippingAddress: '1 Test Lane, Lucknow 226001',
    paymentMethod: 'COD',
  });
  assert.ok(cod.ok, `place COD order: ${JSON.stringify(cod)}`);
  assert.equal((await wallet.getWallet(client.id)).balanceInr, balBeforeCod, 'COD does not deduct');

  console.log('\n✔ wallet + edit-pause behaviour verified');
} catch (error) {
  console.error('\n✖ FAILED:', error);
  process.exitCode = 1;
} finally {
  for (const id of created) {
    await prisma.client.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
}
