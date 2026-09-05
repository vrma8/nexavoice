"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Headset,
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  Minus,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AgentDock from "@/components/AgentDock";
import {
  addToCart,
  clearCart,
  editOrder,
  getCart,
  getOrders,
  getProducts,
  placeOrder,
  setCartQty,
  type CartView,
  type OrderView,
  type ProductView,
} from "@/lib/api";
import { clearClientSession, getClientSession, saveClientSession, type ClientSession } from "@/lib/session";

const ORDER_POLL_MS = 4000;

const STATUS_STYLES: Record<string, string> = {
  PLACED: "bg-amber-900/40 text-amber-200 border-amber-700",
  ON_THE_WAY: "bg-blue-900/40 text-blue-200 border-blue-700",
  DELIVERED: "bg-emerald-900/40 text-emerald-200 border-emerald-700",
  CANCELLED: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const STATUS_STEPS: Array<{ key: string; label: string }> = [
  { key: "PLACED", label: "Placed" },
  { key: "ON_THE_WAY", label: "On the way" },
  { key: "DELIVERED", label: "Delivered" },
];

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function countdown(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function ShoppingPage() {
  const router = useRouter();
  const [client, setClient] = useState<ClientSession | null>(null);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [cart, setCart] = useState<CartView>({ lines: [], itemCount: 0, totalInr: 0 });
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState("COD");
  const [placing, setPlacing] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const [dock, setDock] = useState<"chat" | "voice" | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- session ------------------------------------------------------------
  useEffect(() => {
    const session = getClientSession();
    if (!session) {
      router.replace("/login?role=client");
      return;
    }
    setClient(session);
    setAddress(session.address ?? "");
    // The database is the source of truth: re-read the record behind the session.
    fetch(`/api/auth/me?role=client&id=${encodeURIComponent(session.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { client?: ClientSession } | null) => {
        if (data?.client) {
          setClient(data.client);
          saveClientSession(data.client);
          setAddress((current) => current || data.client!.address || "");
        }
      })
      .catch(() => {});
  }, [router]);

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  // --- data ---------------------------------------------------------------
  const refreshOrders = useCallback(async (clientId: string) => {
    const list = await getOrders(clientId);
    setOrders(list);
  }, []);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const [catalogue, currentCart, orderList] = await Promise.all([
          getProducts(),
          getCart(client.id),
          getOrders(client.id),
        ]);
        if (cancelled) return;
        setProducts(catalogue);
        setCart(currentCart);
        setOrders(orderList);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the shop.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  // Orders change status on their own — poll, and tick a local clock so the
  // "next update in …" countdown moves every second.
  useEffect(() => {
    if (!client) return;
    const poll = setInterval(() => void refreshOrders(client.id).catch(() => {}), ORDER_POLL_MS);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [client, refreshOrders]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products],
  );

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      if (!needle) return true;
      return `${p.title} ${p.description} ${p.category} ${p.sku}`.toLowerCase().includes(needle);
    });
  }, [products, query, category]);

  // --- cart ---------------------------------------------------------------
  const onAdd = async (product: ProductView) => {
    if (!client) return;
    try {
      setCart(await addToCart(client.id, product.id, 1));
      flash(`${product.title} added to cart`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to cart");
    }
  };

  const onQty = async (productId: string, qty: number) => {
    if (!client) return;
    setCart(await setCartQty(client.id, productId, qty));
  };

  const onClearCart = async () => {
    if (!client) return;
    setCart(await clearCart(client.id));
  };

  const onPlaceOrder = async () => {
    if (!client || cart.lines.length === 0) return;
    setPlacing(true);
    setError(null);
    try {
      const result = await placeOrder(client.id, { shippingAddress: address.trim(), paymentMethod: payment });
      setCart(result.cart);
      setOrders(result.orders);
      flash(`Order ${result.order.code} placed — you can still change its items while it is "Placed".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place the order");
    } finally {
      setPlacing(false);
    }
  };

  const signOut = () => {
    clearClientSession();
    router.replace("/login?role=client");
  };

  if (!client) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your account…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">NexaMart</h1>
            <p className="text-[11px] text-zinc-500">Shopping · NexaVoice support built in</p>
          </div>

          <div className="relative ml-4 hidden flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 50 products — headphones, kettle, saree, atta…"
              className="w-full rounded-full border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 sm:flex">
              <UserRound className="h-3.5 w-3.5 text-blue-400" />
              {client.name}
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300">
              <ShoppingCart className="h-3.5 w-3.5 text-emerald-400" />
              {cart.itemCount} · {inr(cart.totalInr)}
            </span>
            <button
              onClick={signOut}
              className="flex items-center gap-1 rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      {(notice || error) && (
        <div className="mx-auto max-w-[1500px] px-4 pt-3">
          {notice && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
              <Check className="h-4 w-4" /> {notice}
            </div>
          )}
          {error && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              <X className="h-4 w-4" /> {error}
            </div>
          )}
        </div>
      )}

      <main className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_420px]">
        {/* Catalogue */}
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  category === c
                    ? "border-blue-600 bg-blue-950/60 text-blue-200"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {c}
              </button>
            ))}
            <span className="ml-auto text-xs text-zinc-600">
              {visibleProducts.length} of {products.length} products
            </span>
          </div>

          <div className="mb-3 md:hidden">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center text-zinc-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading the catalogue…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => (
                <article
                  key={product.id}
                  className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-700"
                >
                  <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-zinc-950 text-4xl">
                    {product.emoji}
                  </div>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-600">{product.category}</p>
                  <h3 className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug">{product.title}</h3>
                  <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{product.description}</p>
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div>
                      <p className="text-base font-semibold">{inr(product.priceInr)}</p>
                      <p className="text-[10px] text-amber-400">★ {product.rating.toFixed(1)}</p>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 bg-blue-600 px-3 text-xs hover:bg-blue-700"
                      onClick={() => void onAdd(product)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                </article>
              ))}
              {visibleProducts.length === 0 && (
                <p className="col-span-full py-12 text-center text-sm text-zinc-500">
                  Nothing matches “{query}”. Try another word.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Sidebar: profile, cart, orders */}
        <aside className="flex min-w-0 flex-col gap-4">
          <ProfileCard client={client} />

          <CartCard
            cart={cart}
            address={address}
            payment={payment}
            placing={placing}
            onAddress={setAddress}
            onPayment={setPayment}
            onQty={onQty}
            onClear={() => void onClearCart()}
            onPlace={() => void onPlaceOrder()}
          />

          <OrdersCard
            orders={orders}
            products={products}
            clientId={client.id}
            now={tick}
            onRefresh={() => void refreshOrders(client.id)}
            onChanged={(updated) => setOrders(updated)}
            onError={setError}
            onNotice={flash}
          />
        </aside>
      </main>

      {/* Talk to the agent — chat or call, right here on the shopping page */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        {dock === null && (
          <>
            <button
              onClick={() => setDock("voice")}
              className="flex items-center gap-2 rounded-full border border-green-700 bg-green-900/80 px-4 py-2.5 text-sm font-medium text-green-100 shadow-lg backdrop-blur hover:bg-green-800"
            >
              <Phone className="h-4 w-4" /> Call the agent
            </button>
            <button
              onClick={() => setDock("chat")}
              className="flex items-center gap-2 rounded-full border border-blue-700 bg-blue-900/80 px-4 py-2.5 text-sm font-medium text-blue-100 shadow-lg backdrop-blur hover:bg-blue-800"
            >
              <MessageSquare className="h-4 w-4" /> Chat with the agent
            </button>
          </>
        )}
      </div>

      {dock && (
        <AgentDock
          mode={dock}
          client={client}
          onClose={() => {
            setDock(null);
            void refreshOrders(client.id).catch(() => {});
          }}
          onSwitch={(next) => setDock(next)}
          onOrdersMayHaveChanged={() => void refreshOrders(client.id).catch(() => {})}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfileCard({ client }: { client: ClientSession }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{client.name}</p>
          <p className="truncate text-xs text-zinc-500">{client.email}</p>
        </div>
        <span className="ml-auto rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
          {client.tier}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-[80px_1fr] gap-y-1 text-xs">
        <dt className="text-zinc-600">Mobile</dt>
        <dd className="text-zinc-300">{client.phone}</dd>
        <dt className="text-zinc-600">City</dt>
        <dd className="text-zinc-300">{client.city || "—"}</dd>
        <dt className="text-zinc-600">Language</dt>
        <dd className="text-zinc-300 capitalize">{client.preferredLanguage}</dd>
        <dt className="text-zinc-600">Address</dt>
        <dd className="truncate text-zinc-300">{client.address || "—"}</dd>
      </dl>
      <p className="mt-2 text-[10px] text-zinc-600">
        Profile, cart and orders are stored in the NexaVoice PostgreSQL database.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

function CartCard({
  cart,
  address,
  payment,
  placing,
  onAddress,
  onPayment,
  onQty,
  onClear,
  onPlace,
}: {
  cart: CartView;
  address: string;
  payment: string;
  placing: boolean;
  onAddress: (value: string) => void;
  onPayment: (value: string) => void;
  onQty: (productId: string, qty: number) => void;
  onClear: () => void;
  onPlace: () => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-800 p-3">
        <ShoppingCart className="h-4 w-4 text-emerald-400" />
        <h2 className="text-sm font-semibold">Your cart</h2>
        <span className="ml-auto text-xs text-zinc-500">{cart.itemCount} item(s)</span>
        {cart.lines.length > 0 && (
          <button onClick={onClear} className="text-xs text-zinc-500 hover:text-red-400">
            clear
          </button>
        )}
      </div>

      {cart.lines.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">Your cart is empty — add something from the catalogue.</p>
      ) : (
        <>
          <ul className="max-h-56 divide-y divide-zinc-800 overflow-y-auto">
            {cart.lines.map((line) => (
              <li key={line.productId} className="flex items-center gap-2 p-2.5">
                <span className="text-xl">{line.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{line.title}</p>
                  <p className="text-[11px] text-zinc-500">{inr(line.priceInr)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn onClick={() => onQty(line.productId, line.qty - 1)} label="Decrease">
                    <Minus className="h-3 w-3" />
                  </IconBtn>
                  <span className="w-5 text-center text-sm">{line.qty}</span>
                  <IconBtn onClick={() => onQty(line.productId, line.qty + 1)} label="Increase">
                    <Plus className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn onClick={() => onQty(line.productId, 0)} label="Remove" danger>
                    <Trash2 className="h-3 w-3" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t border-zinc-800 p-3">
            <label className="block text-xs text-zinc-500">
              Delivery address
              <textarea
                value={address}
                onChange={(e) => onAddress(e.target.value)}
                rows={2}
                placeholder="House/flat, street, area, city, PIN code"
                className="mt-1 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Payment</span>
              {["COD", "UPI", "CARD"].map((method) => (
                <button
                  key={method}
                  onClick={() => onPayment(method)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${
                    payment === method
                      ? "border-blue-600 bg-blue-950/60 text-blue-200"
                      : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-zinc-400">Total</span>
              <span className="text-lg font-semibold">{inr(cart.totalInr)}</span>
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={placing || cart.lines.length === 0 || address.trim().length < 10}
              onClick={onPlace}
            >
              {placing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
              Place order
            </Button>
            {address.trim().length < 10 && (
              <p className="text-[11px] text-amber-400">Add a delivery address (house, area, city, PIN) to continue.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded border border-zinc-700 p-1 text-zinc-400 transition-colors hover:text-white ${
        danger ? "hover:border-red-700 hover:bg-red-950" : "hover:border-zinc-600 hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function OrdersCard({
  orders,
  products,
  clientId,
  now,
  onRefresh,
  onChanged,
  onError,
  onNotice,
}: {
  orders: OrderView[];
  products: ProductView[];
  clientId: string;
  now: number;
  onRefresh: () => void;
  onChanged: (orders: OrderView[]) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string) => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-800 p-3">
        <Truck className="h-4 w-4 text-blue-400" />
        <h2 className="text-sm font-semibold">Your orders</h2>
        <span className="ml-auto text-[11px] text-zinc-600">status updates live</span>
        <button onClick={onRefresh} className="text-zinc-500 hover:text-zinc-200" aria-label="Refresh orders">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-[520px] space-y-3 overflow-y-auto p-3">
        {orders.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500">
            No orders yet. Place one and watch it go Placed → On the way → Delivered.
          </p>
        )}
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            products={products}
            clientId={clientId}
            now={now}
            onChanged={onChanged}
            onError={onError}
            onNotice={onNotice}
          />
        ))}
      </div>
    </section>
  );
}

function OrderCard({
  order,
  products,
  clientId,
  now,
  onChanged,
  onError,
  onNotice,
}: {
  order: OrderView;
  products: ProductView[];
  clientId: string;
  now: number;
  onChanged: (orders: OrderView[]) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addressDraft, setAddressDraft] = useState(order.shippingAddress);
  const [showAddress, setShowAddress] = useState(false);

  const remaining = Math.max(0, order.nextChangeInMs - (now - order.statusUpdatedAt < 0 ? 0 : 0));
  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);

  const apply = async (edit: Parameters<typeof editOrder>[2], successMessage: string) => {
    setBusy(true);
    onError(null);
    try {
      const result = await editOrder(clientId, order.code, edit);
      onChanged(result.orders);
      onNotice(successMessage);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not change the order");
    } finally {
      setBusy(false);
    }
  };

  const suggestions = addQuery.trim()
    ? products
        .filter((p) => `${p.title} ${p.category} ${p.sku}`.toLowerCase().includes(addQuery.trim().toLowerCase()))
        .slice(0, 4)
    : [];

  return (
    <article className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-zinc-300">{order.code}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[order.status]}`}>
          {order.statusText}
        </span>
        <span className="ml-auto text-sm font-semibold">{inr(order.totalInr)}</span>
      </div>

      {/* Progress: Placed → On the way → Delivered */}
      {order.status !== "CANCELLED" && (
        <div className="mt-3 flex items-center gap-1">
          {STATUS_STEPS.map((step, i) => (
            <div key={step.key} className="flex flex-1 items-center gap-1">
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] ${
                  i <= stepIndex ? "bg-blue-600 text-white" : "border border-zinc-700 bg-zinc-900 text-zinc-600"
                }`}
              >
                {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-[10px] ${i <= stepIndex ? "text-zinc-300" : "text-zinc-600"}`}>{step.label}</span>
              {i < STATUS_STEPS.length - 1 && (
                <div className={`h-px flex-1 ${i < stepIndex ? "bg-blue-600" : "bg-zinc-800"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {order.nextChangeInMs > 0 && (
        <p className="mt-2 text-[11px] text-zinc-500">
          Next status change in <span className="text-zinc-300">{countdown(remaining)}</span>
        </p>
      )}

      <ul className="mt-2 space-y-1">
        {order.items.map((item) => (
          <li key={item.productId} className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="flex-1 truncate">
              {item.qty} × {item.title}
            </span>
            <span className="text-zinc-500">{inr(item.lineTotalInr)}</span>
            {editing && order.editable && (
              <div className="flex items-center gap-1">
                <IconBtn onClick={() => void apply({ action: "set_qty", productId: item.productId, qty: item.qty - 1 }, `Removed one ${item.title}`)} label="One less">
                  <Minus className="h-3 w-3" />
                </IconBtn>
                <IconBtn onClick={() => void apply({ action: "set_qty", productId: item.productId, qty: item.qty + 1 }, `Added one ${item.title}`)} label="One more">
                  <Plus className="h-3 w-3" />
                </IconBtn>
                <IconBtn onClick={() => void apply({ action: "remove_item", product: item.sku }, `${item.title} removed from ${order.code}`)} label="Remove item" danger>
                  <Trash2 className="h-3 w-3" />
                </IconBtn>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-2 flex items-start gap-1 text-[11px] text-zinc-500">
        <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {order.shippingAddress}
      </p>

      {order.editable ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-blue-600 hover:text-white"
            disabled={busy}
          >
            {editing ? "Done editing" : "Change items"}
          </button>
          <button
            onClick={() => setShowAddress((v) => !v)}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-blue-600 hover:text-white"
            disabled={busy}
          >
            Change address
          </button>
          <button
            onClick={() => void apply({ action: "cancel", reason: "cancelled by customer on the shopping page" }, `${order.code} cancelled`)}
            className="rounded-md border border-red-900 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-950"
            disabled={busy}
          >
            Cancel order
          </button>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-zinc-600">
          {order.status === "CANCELLED"
            ? `Cancelled${order.cancellationReason ? ` — ${order.cancellationReason}` : ""}`
            : "Items are locked once the order leaves the “Placed” stage."}
        </p>
      )}

      {editing && order.editable && (
        <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900 p-2">
          <p className="mb-1 text-[11px] text-zinc-500">Add another product to this order</p>
          <input
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            placeholder="Search the catalogue…"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
          <ul className="mt-1 space-y-1">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setAddQuery("");
                    void apply({ action: "add_item", product: p.sku, qty: 1 }, `${p.title} added to ${order.code}`);
                  }}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  <span>{p.emoji}</span>
                  <span className="flex-1 truncate">{p.title}</span>
                  <span className="text-zinc-500">{inr(p.priceInr)}</span>
                  <ArrowRight className="h-3 w-3 text-zinc-600" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showAddress && order.editable && (
        <div className="mt-2 space-y-1">
          <textarea
            value={addressDraft}
            onChange={(e) => setAddressDraft(e.target.value)}
            rows={2}
            className="w-full resize-none rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
          <Button
            size="sm"
            className="h-7 bg-blue-600 text-[11px] hover:bg-blue-700"
            disabled={busy || addressDraft.trim().length < 10}
            onClick={() => {
              setShowAddress(false);
              void apply({ action: "address", address: addressDraft.trim() }, `Address updated for ${order.code}`);
            }}
          >
            Save address
          </Button>
        </div>
      )}

      {order.history.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-zinc-600 hover:text-zinc-400">Timeline</summary>
          <ul className="mt-1 space-y-0.5">
            {order.history.map((h, i) => (
              <li key={i} className="text-[11px] text-zinc-500">
                <span className="font-mono text-zinc-600">
                  {new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>{" "}
                {h.event}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

/** Small helper used by the empty state of the page when signed out. */
export function SignInPrompt() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <Headset className="mx-auto mb-3 h-8 w-8 text-blue-400" />
        <p className="mb-3 text-sm text-zinc-400">Sign in to start shopping.</p>
        <Link href="/login?role=client" className="text-sm text-blue-400 hover:text-blue-300">
          Go to sign in →
        </Link>
      </div>
    </div>
  );
}
