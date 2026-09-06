/**
 * Verifies the DATABASE_UNAVAILABLE path: when PostgreSQL is unreachable, the
 * tools must return an explicit error that tells the agent to apologise and
 * NEVER invent products/order data — not a generic TOOL_FAILED the model will
 * improvise around.
 *
 * Run with a DATABASE_URL that cannot be reached:
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5499/postgres \
 *     node --env-file-if-exists=.env.local --import tsx scripts/test-db-unavailable.ts
 */
import { executeTool } from '../lib/support/tools';
import { createConversation, resetSupportDb } from '../lib/support/store';

async function main() {
  resetSupportDb();
  const conversation = createConversation({
    mode: 'VOICE',
    customerName: 'Test Caller',
    customer: {
      id: 'test-client-id',
      name: 'Test Caller',
      phone: '9000000001',
      email: 'test@example.com',
      tier: 'standard',
      city: 'Delhi',
    },
  });

  console.log('calling get_cart_status with an unreachable database…\n');
  const cart = await executeTool(conversation.id, 'get_cart_status');
  console.log(JSON.stringify(cart, null, 2));
  const pass =
    cart.ok === false &&
    cart.result.error === 'DATABASE_UNAVAILABLE' &&
    /NEVER invent/i.test(String(cart.result.message));

  console.log('\nsearch_products with an unreachable database…\n');
  const search = await executeTool(conversation.id, 'search_products', { query: 'kettle' });
  console.log(JSON.stringify(search, null, 2));
  const searchPass =
    search.ok === false &&
    search.result.error === 'DATABASE_UNAVAILABLE' &&
    /NEVER invent/i.test(String(search.result.message));

  console.log(`\nget_cart_status: ${pass ? 'PASS' : 'FAIL'}`);
  console.log(`search_products: ${searchPass ? 'PASS' : 'FAIL'}`);
  process.exit(pass && searchPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
