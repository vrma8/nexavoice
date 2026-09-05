import ShoppingPage from "@/components/ShoppingPage";

/**
 * The page a client lands on after signing in: the NexaMart shop.
 *
 * Catalogue, cart, profile and orders all come from PostgreSQL, and the support
 * agent (chat or voice) is one click away in the dock at the bottom right.
 */
export default function ClientPage() {
  return <ShoppingPage />;
}
