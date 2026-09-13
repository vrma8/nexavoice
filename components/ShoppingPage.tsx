"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  Filter,
  Gift,
  Github,
  Headset,
  Heart,
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  Mic,
  Minus,
  Package,
  Pause,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Star,
  Trash2,
  Truck,
  UserRound,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import AgentDock from "@/components/AgentDock";
import ShoppingComparisonPanel from "@/components/ShoppingComparisonPanel";
import {
  addToCart,
  addWalletMoney,
  clearCart,
  editOrder,
  getCart,
  getOrders,
  getProducts,
  getWallet,
  placeOrder,
  setCartQty,
  type CartView,
  type OrderView,
  type ProductView,
  type WalletView,
} from "@/lib/api";
import { PROJECT_GITHUB_URL } from "@/lib/site";
import { clearClientSession, getClientSession, saveClientSession, type ClientSession } from "@/lib/session";
import type { Conversation } from "@/lib/support/types";
import type { ShoppingUiState } from "@/lib/shopping/types";

const ORDER_POLL_MS = 4000;

const STATUS_STYLES: Record<string, string> = {
  PLACED: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  ON_THE_WAY: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
  DELIVERED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  CANCELLED: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
};

const STATUS_STEP_ACTIVE: Record<string, string> = {
  PLACED: "bg-[hsl(191_100%_50%)] text-[hsl(223_47%_4%)]",
  ON_THE_WAY: "bg-[hsl(191_100%_50%)] text-[hsl(223_47%_4%)]",
  DELIVERED: "bg-[hsl(142_70%_45%)] text-white",
};

const STATUS_STEPS: Array<{ key: string; label: string }> = [
  { key: "PLACED", label: "Placed" },
  { key: "ON_THE_WAY", label: "On the way" },
  { key: "DELIVERED", label: "Delivered" },
];

const TOP_UP_CHOICES_INR = [200, 500, 1000, 2000];

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function countdown(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const [shoppingState, setShoppingState] = useState<{ key: string; state: ShoppingUiState } | null>(null);
  const handleConversationSnapshot = useCallback((conversation: unknown) => {
    const c = conversation as Conversation | null;
    const shopping = c?.context?.shopping;
    if (!shopping) return;
    setShoppingState({ key: `${c!.id}:${shopping.startedAt}`, state: shopping });
  }, []);
  const dismissShoppingPanel = useCallback(() => setShoppingState(null), []);
  const [walletOpen, setWalletOpen] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleWishlist = (id: string) =>
    setWishlist((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  useEffect(() => {
    const session = getClientSession();
    if (!session) {
      router.replace("/login?role=client");
      return;
    }
    setClient(session);
    setAddress(session.address ?? "");
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

  const [ordersFetchedAt, setOrdersFetchedAt] = useState(() => Date.now());
  const refreshOrders = useCallback(async (clientId: string) => {
    const list = await getOrders(clientId);
    setOrdersFetchedAt(Date.now());
    setOrders(list);
  }, []);

  const refreshCart = useCallback(async (clientId: string) => {
    const currentCart = await getCart(clientId);
    setCart(currentCart);
  }, []);

  const refreshWallet = useCallback(async (clientId: string) => {
    const currentWallet = await getWallet(clientId);
    setWallet(currentWallet);
  }, []);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const [catalogue, currentCart, orderList, currentWallet] = await Promise.all([
          getProducts(),
          getCart(client.id),
          getOrders(client.id),
          getWallet(client.id),
        ]);
        if (cancelled) return;
        setProducts(catalogue);
        setCart(currentCart);
        setOrders(orderList);
        setWallet(currentWallet);
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

  useEffect(() => {
    if (!client) return;
    const poll = setInterval(() => {
      void refreshOrders(client.id).catch(() => {});
      void refreshCart(client.id).catch(() => {});
      void refreshWallet(client.id).catch(() => {});
    }, ORDER_POLL_MS);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [client, refreshOrders, refreshCart, refreshWallet]);

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
      void refreshWallet(client.id).catch(() => {});
      const walletNote =
        result.order.paymentMethod === "WALLET" ? ` ${inr(result.order.totalInr)} deducted from your NexaCash wallet.` : "";
      flash(`Order ${result.order.code} placed —${walletNote} you can still change its items while it is "Placed".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place the order");
    } finally {
      setPlacing(false);
    }
  };

  const onAddMoney = async (amountInr: number) => {
    if (!client || topUpBusy) return;
    setTopUpBusy(true);
    setError(null);
    try {
      setWallet(await addWalletMoney(client.id, amountInr));
      setTopUpOpen(false);
      setTopUpAmount("");
      flash(`${inr(amountInr)} added to your NexaCash wallet`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add money to the wallet");
    } finally {
      setTopUpBusy(false);
    }
  };

  const signOut = () => {
    clearClientSession();
    router.replace("/login?role=client");
  };

  if (!client) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(223_47%_4%)] text-[hsl(220_10%_50%)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your account…
      </div>
    );
  }

  const bannerOrders = orders.slice(0, 6);

  return (
    <div className="flex h-dvh flex-col bg-[hsl(223_47%_4%)] text-[hsl(220_15%_95%)]">
      {/* Top nav */}
      <header className="z-30 flex-shrink-0 border-b border-[hsl(222_25%_13%)] bg-[hsl(223_47%_4%_/_0.95)] backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.12)]">
              <Mic className="h-3.5 w-3.5 text-[hsl(191_100%_55%)]" />
            </div>
            <span className="font-serif hidden text-lg text-white sm:block">NexaMart</span>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(220_10%_40%)]" />
            <input
              className="w-full rounded-xl border border-[hsl(222_25%_15%)] bg-[hsl(222_40%_7%)] py-2 pr-3 pl-9 text-sm text-white transition-colors placeholder:text-[hsl(220_10%_35%)] focus:border-[hsl(191_100%_50%_/_0.4)] focus:outline-none"
              placeholder="Search products…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Orders chip */}
            <button
              onClick={() => scrollToId("nv-orders")}
              className="hidden items-center gap-1.5 rounded-lg border border-[hsl(222_25%_15%)] bg-[hsl(222_35%_9%)] px-3 py-1.5 text-xs text-[hsl(220_10%_55%)] transition-colors hover:border-[hsl(222_25%_22%)] sm:flex"
            >
              <Package className="h-3.5 w-3.5" /> Orders
            </button>
            {/* Notifications */}
            <button
              className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(222_25%_15%)] bg-[hsl(222_35%_9%)] text-[hsl(220_10%_55%)] transition-colors hover:text-white"
              aria-label="Notifications"
            >
              <Bell className="h-3.5 w-3.5" />
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[hsl(191_100%_55%)]" />
            </button>
            {/* Project on GitHub */}
            <a
              href={PROJECT_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(222_25%_15%)] bg-[hsl(222_35%_9%)] text-[hsl(220_10%_55%)] transition-colors hover:text-white"
              aria-label="View the source on GitHub"
              title="View the source on GitHub"
            >
              <Github className="h-3.5 w-3.5" />
            </a>
            {/* Wallet — live NexaCash balance from the database */}
            <div className="relative">
              <button
                onClick={() => {
                  setWalletOpen((v) => !v);
                  setTopUpOpen(false);
                }}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  walletOpen
                    ? "border-[hsl(40_100%_50%_/_0.35)] bg-[hsl(40_100%_50%_/_0.1)] text-[hsl(40_100%_60%)]"
                    : "border-[hsl(40_50%_30%_/_0.5)] bg-[hsl(40_100%_50%_/_0.06)] text-[hsl(40_100%_55%)] hover:bg-[hsl(40_100%_50%_/_0.1)]"
                }`}
              >
                <Wallet className="h-3.5 w-3.5" />
                <span className="hidden sm:block">{inr(wallet?.balanceInr ?? client.walletBalanceInr ?? 0)}</span>
              </button>

              {walletOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setWalletOpen(false)} />
                  <div className="animate-fade-up absolute top-10 right-0 z-50 w-80 rounded-2xl border border-[hsl(222_25%_16%)] bg-[hsl(222_40%_7%)] shadow-2xl shadow-black/40">
                    {/* Balance card */}
                    <div className="rounded-t-2xl border-b border-[hsl(222_25%_14%)] bg-gradient-to-br from-[hsl(40_100%_50%_/_0.12)] to-[hsl(40_60%_40%_/_0.06)] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[hsl(40_100%_50%_/_0.2)] bg-[hsl(40_100%_50%_/_0.15)]">
                            <Wallet className="h-4 w-4 text-[hsl(40_100%_55%)]" />
                          </div>
                          <div>
                            <p className="text-[11px] text-[hsl(220_10%_45%)]">NexaCash balance</p>
                            <p className="text-xl font-bold text-white">{inr(wallet?.balanceInr ?? 0)}</p>
                          </div>
                        </div>
                        <span className="rounded-full border border-[hsl(40_100%_50%_/_0.2)] bg-[hsl(40_100%_50%_/_0.08)] px-2 py-0.5 text-[10px] font-medium text-[hsl(40_100%_55%)]">
                          Active
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setTopUpOpen((v) => !v)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-colors ${
                            topUpOpen
                              ? "border-[hsl(40_100%_50%_/_0.4)] bg-[hsl(40_100%_50%_/_0.16)] text-[hsl(40_100%_60%)]"
                              : "border-[hsl(40_100%_50%_/_0.2)] bg-[hsl(40_100%_50%_/_0.08)] text-[hsl(40_100%_55%)] hover:bg-[hsl(40_100%_50%_/_0.14)]"
                          }`}
                        >
                          <ArrowDownLeft className="h-3.5 w-3.5" /> Add money
                        </button>
                        <button
                          onClick={() => {
                            setWalletOpen(false);
                            scrollToId("nv-orders");
                          }}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[hsl(222_25%_18%)] bg-[hsl(222_35%_10%)] py-2 text-xs font-medium text-[hsl(220_10%_55%)] transition-colors hover:bg-[hsl(222_35%_13%)]"
                          title="Wallet-paid orders appear here"
                        >
                          <Gift className="h-3.5 w-3.5" /> Orders
                        </button>
                      </div>

                      {/* Add money */}
                      {topUpOpen && (
                        <div className="mt-3 rounded-xl border border-[hsl(222_25%_16%)] bg-[hsl(222_40%_7%)] p-3">
                          <p className="mb-2 text-[11px] text-[hsl(220_10%_45%)]">Add money to your wallet</p>
                          <div className="mb-2 grid grid-cols-4 gap-1.5">
                            {TOP_UP_CHOICES_INR.map((amount) => (
                              <button
                                key={amount}
                                disabled={topUpBusy}
                                onClick={() => void onAddMoney(amount)}
                                className="rounded-lg border border-[hsl(40_100%_50%_/_0.2)] bg-[hsl(40_100%_50%_/_0.06)] py-1.5 text-[11px] font-medium text-[hsl(40_100%_55%)] transition-colors hover:bg-[hsl(40_100%_50%_/_0.14)] disabled:opacity-50"
                              >
                                +₹{amount}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1.5">
                            <input
                              type="number"
                              min={1}
                              value={topUpAmount}
                              onChange={(e) => setTopUpAmount(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void onAddMoney(Math.floor(Number(topUpAmount)));
                              }}
                              placeholder="Custom amount (₹)"
                              className="min-w-0 flex-1 rounded-lg border border-[hsl(222_25%_20%)] bg-[hsl(223_47%_4%)] px-2.5 py-1.5 text-xs text-white placeholder:text-[hsl(220_10%_35%)] focus:border-[hsl(40_100%_50%_/_0.5)] focus:outline-none"
                            />
                            <button
                              disabled={topUpBusy || !(Number(topUpAmount) >= 1)}
                              onClick={() => void onAddMoney(Math.floor(Number(topUpAmount)))}
                              className="flex items-center gap-1 rounded-lg bg-[hsl(40_100%_50%)] px-3 py-1.5 text-[11px] font-semibold text-[hsl(223_47%_4%)] transition-opacity hover:opacity-90 disabled:opacity-40"
                            >
                              {topUpBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Transactions — straight from the wallet ledger */}
                    <div className="max-h-72 overflow-y-auto p-3">
                      <p className="mb-2 px-1 text-[10px] font-semibold tracking-wide text-[hsl(220_10%_35%)] uppercase">
                        Recent transactions
                      </p>
                      {!wallet || wallet.transactions.length === 0 ? (
                        <p className="py-3 text-center text-[11px] text-[hsl(220_10%_40%)]">
                          No transactions yet — add money or pay for an order with NexaCash.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {wallet.transactions.map((t) => {
                            const credit = t.amountInr >= 0;
                            return (
                              <li
                                key={t.id}
                                className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-[hsl(222_35%_10%)]"
                              >
                                <div
                                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                                    credit ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                                  }`}
                                >
                                  {credit ? (
                                    <ArrowDownLeft className="h-3.5 w-3.5" />
                                  ) : (
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="truncate text-xs text-[hsl(220_15%_80%)]">{t.label}</p>
                                  <p className="text-[10px] text-[hsl(220_10%_40%)]">
                                    {new Date(t.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                                  </p>
                                </div>
                                <span
                                  className={`flex-shrink-0 text-xs font-semibold ${
                                    credit ? "text-emerald-400" : "text-red-400"
                                  }`}
                                >
                                  {credit ? "+" : "-"}₹{Math.abs(t.amountInr).toLocaleString("en-IN")}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Cart */}
            <button
              onClick={() => scrollToId("nv-cart")}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(222_25%_15%)] bg-[hsl(222_35%_9%)] text-[hsl(220_10%_55%)] transition-colors hover:text-white"
              aria-label="Cart"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {cart.itemCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(191_100%_50%)] text-[9px] font-bold text-[hsl(223_47%_4%)]">
                  {cart.itemCount}
                </span>
              )}
            </button>
            {/* User */}
            <div className="flex items-center gap-2 rounded-lg border border-[hsl(222_25%_15%)] bg-[hsl(222_35%_9%)] px-2.5 py-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(191_100%_50%_/_0.2)] text-[10px] font-semibold text-[hsl(191_100%_55%)]">
                {client.name.charAt(0)}
              </div>
              <span className="hidden text-xs text-[hsl(220_10%_60%)] sm:block">{client.name.split(" ")[0]}</span>
              <button onClick={signOut} className="text-[hsl(220_10%_40%)] transition-colors hover:text-red-400" aria-label="Sign out">
                <LogOut className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {(notice || error) && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-3">
          {notice && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              <Check className="h-4 w-4" /> {notice}
            </div>
          )}
          {error && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <X className="h-4 w-4" /> {error}
            </div>
          )}
        </div>
      )}

      {/*
        Layout: each column scrolls on its own. On small screens the whole
        page scrolls as one (outer overflow-y-auto); on lg the outer pane is
        clipped and the products list and the right-hand details each get an
        independent scrollbar — so the cart/profile/orders sidebar can always
        be scrolled without first scrolling through every product.
      */}
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-6 lg:flex-row lg:overflow-hidden">
        {/* Main content */}
        <main className="min-w-0 flex-1 space-y-6 lg:overflow-y-auto lg:pr-1">
          {/* Active orders banner */}
          <div className="rounded-xl border border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.04)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Truck className="h-4 w-4 text-[hsl(191_100%_55%)]" /> Active orders
              </h2>
              <span className="text-[11px] text-[hsl(220_10%_40%)]">
                {visibleProducts.length} of {products.length} products
              </span>
            </div>
            {bannerOrders.length === 0 ? (
              <p className="text-xs text-[hsl(220_10%_45%)]">
                No active orders yet — place one from the catalogue and watch it move Placed → On the way → Delivered.
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {bannerOrders.map((o) => (
                  <div
                    key={o.id}
                    className="flex min-w-[230px] flex-shrink-0 items-center gap-3 rounded-lg border border-[hsl(222_25%_16%)] bg-[hsl(222_40%_7%)] px-3 py-2.5"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(222_35%_12%)]">
                      <Package className="h-4 w-4 text-[hsl(220_10%_50%)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-white">
                        {o.items.map((i) => i.title).join(", ")}
                      </p>
                      <p
                        className={`text-[11px] ${
                          o.status === "DELIVERED"
                            ? "text-[hsl(142_70%_50%)]"
                            : o.status === "ON_THE_WAY"
                              ? "text-[hsl(191_100%_55%)]"
                              : o.status === "PLACED"
                                ? "text-amber-300"
                                : "text-[hsl(220_10%_50%)]"
                        }`}
                      >
                        {o.statusText} · {new Date(o.placedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </p>
                      <p className="font-mono text-[10px] text-[hsl(220_10%_35%)]">{o.code}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                  category === cat
                    ? "border border-[hsl(191_100%_50%_/_0.25)] bg-[hsl(191_100%_50%_/_0.15)] text-[hsl(191_100%_60%)]"
                    : "border border-[hsl(222_25%_15%)] bg-[hsl(222_35%_8%)] text-[hsl(220_10%_50%)] hover:text-[hsl(220_10%_70%)]"
                }`}
              >
                {cat}
              </button>
            ))}
            <button className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[hsl(222_25%_15%)] bg-[hsl(222_35%_8%)] px-3.5 py-1.5 text-xs text-[hsl(220_10%_50%)] hover:text-white">
              <Filter className="h-3 w-3" /> Filter
            </button>
          </div>

          {/* Product grid */}
          {loading ? (
            <div className="flex h-64 items-center justify-center text-[hsl(220_10%_45%)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading the catalogue…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((p) => {
                const qty = cart.lines.find((l) => l.productId === p.id)?.qty ?? 0;
                return (
                  <div
                    key={p.id}
                    className="group relative flex flex-col overflow-hidden rounded-xl border border-[hsl(222_25%_13%)] bg-[hsl(222_40%_6%)] transition-all hover:border-[hsl(222_25%_20%)] hover:shadow-lg hover:shadow-black/20"
                  >
                    {/* Badge */}
                    {p.caution && (
                      <span className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md border border-red-400/30 bg-[hsl(0_60%_20%_/_0.9)] px-2 py-0.5 text-[10px] font-semibold text-red-200">
                        <ShieldAlert className="h-3 w-3" /> Caution
                      </span>
                    )}
                    {/* Wishlist */}
                    <button
                      onClick={() => toggleWishlist(p.id)}
                      className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(222_25%_18%)] bg-[hsl(222_40%_7%_/_0.9)] text-[hsl(220_10%_40%)] backdrop-blur-sm transition-colors hover:text-red-400"
                      aria-label="Toggle wishlist"
                    >
                      <Heart className={`h-3.5 w-3.5 ${wishlist.includes(p.id) ? "fill-red-400 text-red-400" : ""}`} />
                    </button>
                    {/* Image */}
                    <div className="aspect-square overflow-hidden bg-[hsl(222_35%_9%)]">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-4xl">{p.emoji}</div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <p className="text-[11px] font-medium text-[hsl(220_10%_40%)]">{p.category}</p>
                      <p className="line-clamp-2 text-sm leading-snug font-medium text-white">{p.title}</p>
                      <p className="line-clamp-2 text-[11px] text-[hsl(220_10%_45%)]">{p.description}</p>
                      <div className="flex items-center gap-1.5">
                        <Star className="h-3 w-3 fill-[hsl(40_100%_60%)] text-[hsl(40_100%_60%)]" />
                        <span className="text-xs text-[hsl(220_10%_60%)]">{p.rating.toFixed(1)}</span>
                      </div>
                      <div className="mt-auto flex items-baseline gap-2 pt-1">
                        <span className="text-base font-bold text-white">{inr(p.priceInr)}</span>
                      </div>
                      <button
                        onClick={() => void onAdd(p)}
                        disabled={qty > 0}
                        className={`mt-1 w-full rounded-lg py-1.5 text-xs font-semibold transition-all ${
                          qty > 0
                            ? "border border-[hsl(191_100%_50%_/_0.3)] bg-[hsl(191_100%_50%_/_0.08)] text-[hsl(191_100%_55%)]"
                            : "btn-primary py-1.5 text-xs"
                        }`}
                      >
                        {qty > 0 ? `In cart · ${qty}` : "Add to cart"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {visibleProducts.length === 0 && (
                <p className="col-span-full py-12 text-center text-sm text-[hsl(220_10%_45%)]">
                  Nothing matches “{query}”. Try another word.
                </p>
              )}
            </div>
          )}
        </main>

        {/* Right sidebar — scrolls independently on lg screens */}
        <aside className="flex w-full flex-col gap-4 pb-16 lg:w-[360px] lg:flex-shrink-0 lg:overflow-y-auto lg:pb-2 lg:pl-1">
          <div className="flex flex-col gap-4">
            <CartCard
              id="nv-cart"
              cart={cart}
              products={products}
              address={address}
              payment={payment}
              placing={placing}
              walletBalance={wallet?.balanceInr ?? client.walletBalanceInr ?? 0}
              onAddress={setAddress}
              onPayment={setPayment}
              onQty={onQty}
              onClear={() => void onClearCart()}
              onPlace={() => void onPlaceOrder()}
              onOpenWallet={() => {
                setWalletOpen(true);
                setTopUpOpen(true);
              }}
            />

            {/* Support CTA */}
            <div className="card border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.03)] p-4">
              <p className="mb-1 text-sm font-semibold text-white">Need help?</p>
              <p className="mb-3 text-xs leading-relaxed text-[hsl(220_10%_45%)]">
                Talk to Nexa, your AI support agent, about orders, returns, and more.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDock("chat")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[hsl(191_100%_50%_/_0.2)] bg-[hsl(191_100%_50%_/_0.08)] py-2 text-xs font-medium text-[hsl(191_100%_55%)] transition-colors hover:bg-[hsl(191_100%_50%_/_0.12)]"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Chat
                </button>
                <button
                  onClick={() => setDock("voice")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[hsl(142_70%_40%_/_0.2)] bg-[hsl(142_70%_40%_/_0.08)] py-2 text-xs font-medium text-[hsl(142_70%_55%)] transition-colors hover:bg-[hsl(142_70%_40%_/_0.12)]"
                >
                  <Phone className="h-3.5 w-3.5" /> Voice
                </button>
              </div>
            </div>

            <ProfileCard client={client} />

            <OrdersCard
              id="nv-orders"
              orders={orders}
              products={products}
              clientId={client.id}
              now={tick}
              fetchedAt={ordersFetchedAt}
              onRefresh={() => void refreshOrders(client.id)}
              onChanged={(updated) => {
                setOrdersFetchedAt(Date.now());
                setOrders(updated);
                void refreshWallet(client.id).catch(() => {});
              }}
              onError={setError}
              onNotice={flash}
            />
          </div>
        </aside>
      </div>

      {/* Floating support FAB (mobile) */}
      {dock === null && (
        <button
          onClick={() => setDock("chat")}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-[hsl(191_100%_50%_/_0.3)] bg-[hsl(191_100%_50%)] px-4 py-3 text-sm font-semibold text-[hsl(223_47%_4%)] shadow-lg shadow-[hsl(191_100%_50%_/_0.2)] transition-all hover:shadow-[hsl(191_100%_50%_/_0.35)] lg:hidden"
        >
          <Zap className="h-4 w-4" /> Get support
        </button>
      )}

      {/* Multi-store price comparison panel — fed by the conversation snapshot
          the chat/voice dock polls. Sits next to the existing NexaMart UI
          without replacing anything. */}
      <ShoppingComparisonPanel
        shopping={shoppingState?.state ?? null}
        onDismiss={dismissShoppingPanel}
      />

      {/* Talk to the agent — chat or call, right here on the shopping page */}
      {dock && (
        <AgentDock
          mode={dock}
          client={client}
          onClose={() => {
            setDock(null);
            void refreshOrders(client.id).catch(() => {});
            void refreshCart(client.id).catch(() => {});
            void refreshWallet(client.id).catch(() => {});
          }}
          onSwitch={(next) => setDock(next)}
          onConversationSnapshot={handleConversationSnapshot}
          onOrdersMayHaveChanged={() => {
            void refreshOrders(client.id).catch(() => {});
            void refreshCart(client.id).catch(() => {});
            void refreshWallet(client.id).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

function ProfileCard({ client }: { client: ClientSession }) {
  return (
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(191_100%_50%_/_0.15)] bg-[hsl(191_100%_50%_/_0.1)]">
          <UserRound className="h-5 w-5 text-[hsl(191_100%_55%)]" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{client.name}</p>
          <p className="truncate text-xs text-[hsl(220_10%_45%)]">{client.email}</p>
        </div>
        <span
          className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${
            client.tier === "prime"
              ? "border-[hsl(40_100%_50%_/_0.3)] bg-[hsl(40_100%_50%_/_0.08)] text-[hsl(40_100%_55%)]"
              : "border-[hsl(222_25%_20%)] bg-[hsl(222_35%_12%)] text-[hsl(220_10%_50%)]"
          }`}
        >
          {client.tier}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-[80px_1fr] gap-y-1 text-xs">
        <dt className="text-[hsl(220_10%_40%)]">Mobile</dt>
        <dd className="text-[hsl(220_15%_80%)]">{client.phone}</dd>
        <dt className="text-[hsl(220_10%_40%)]">City</dt>
        <dd className="text-[hsl(220_15%_80%)]">{client.city || "—"}</dd>
        <dt className="text-[hsl(220_10%_40%)]">Language</dt>
        <dd className="text-[hsl(220_15%_80%)] capitalize">{client.preferredLanguage}</dd>
        <dt className="text-[hsl(220_10%_40%)]">Address</dt>
        <dd className="truncate text-[hsl(220_15%_80%)]">{client.address || "—"}</dd>
      </dl>
      <p className="mt-2 text-[10px] text-[hsl(220_10%_35%)]">
        Profile, cart and orders are stored in the NexaVoice PostgreSQL database.
      </p>
    </section>
  );
}

function CartCard({
  id,
  cart,
  products,
  address,
  payment,
  placing,
  walletBalance,
  onAddress,
  onPayment,
  onQty,
  onClear,
  onPlace,
  onOpenWallet,
}: {
  id: string;
  cart: CartView;
  products: ProductView[];
  address: string;
  payment: string;
  placing: boolean;
  walletBalance: number;
  onAddress: (value: string) => void;
  onPayment: (value: string) => void;
  onQty: (productId: string, qty: number) => void;
  onClear: () => void;
  onPlace: () => void;
  onOpenWallet: () => void;
}) {
  const walletShortfall = payment === "WALLET" ? Math.max(0, cart.totalInr - walletBalance) : 0;
  return (
    <section id={id} className="card scroll-mt-20 p-4">
      <h3 className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
        <span className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-[hsl(191_100%_55%)]" /> Cart
        </span>
        <span className="rounded-full bg-[hsl(191_100%_50%_/_0.12)] px-2 py-0.5 text-[11px] font-medium text-[hsl(191_100%_55%)]">
          {cart.itemCount}
        </span>
      </h3>

      {cart.lines.length === 0 ? (
        <p className="py-4 text-center text-xs text-[hsl(220_10%_40%)]">Your cart is empty</p>
      ) : (
        <div className="space-y-2">
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {cart.lines.map((line) => {
              const p = products.find((x) => x.id === line.productId);
              return (
                <li key={line.productId} className="flex items-center gap-2 text-xs">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(222_35%_10%)] text-base">
                    {p?.imageUrl ? (
                      <img src={p.imageUrl} alt={line.title} className="h-full w-full object-cover" />
                    ) : (
                      line.emoji
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[hsl(220_15%_80%)]">{line.title}</p>
                    <p className="font-medium text-[hsl(191_100%_55%)]">{inr(line.priceInr)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconBtn onClick={() => onQty(line.productId, line.qty - 1)} label="Decrease">
                      <Minus className="h-3 w-3" />
                    </IconBtn>
                    <span className="w-5 text-center">{line.qty}</span>
                    <IconBtn onClick={() => onQty(line.productId, line.qty + 1)} label="Increase">
                      <Plus className="h-3 w-3" />
                    </IconBtn>
                    <IconBtn onClick={() => onQty(line.productId, 0)} label="Remove" danger>
                      <Trash2 className="h-3 w-3" />
                    </IconBtn>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-2 space-y-2 border-t border-[hsl(222_25%_15%)] pt-3">
            <label className="block text-xs text-[hsl(220_10%_45%)]">
              Delivery address
              <textarea
                value={address}
                onChange={(e) => onAddress(e.target.value)}
                rows={2}
                placeholder="House/flat, street, area, city, PIN code"
                className="input-field mt-1 resize-none"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[hsl(220_10%_45%)]">Payment</span>
              {["COD", "UPI", "CARD", "WALLET"].map((method) => (
                <button
                  key={method}
                  onClick={() => onPayment(method)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    payment === method
                      ? method === "WALLET"
                        ? "border-[hsl(40_100%_50%_/_0.4)] bg-[hsl(40_100%_50%_/_0.12)] text-[hsl(40_100%_60%)]"
                        : "border-[hsl(191_100%_50%_/_0.3)] bg-[hsl(191_100%_50%_/_0.12)] text-[hsl(191_100%_60%)]"
                      : "border-[hsl(222_25%_20%)] text-[hsl(220_10%_50%)] hover:text-[hsl(220_10%_70%)]"
                  }`}
                  title={method === "WALLET" ? `NexaCash wallet — balance ${inr(walletBalance)}` : method}
                >
                  {method === "WALLET" ? `NexaCash · ${inr(walletBalance)}` : method}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-[hsl(220_10%_55%)]">Total</span>
              <span className="text-lg font-semibold text-white">{inr(cart.totalInr)}</span>
            </div>
            <button
              className="btn-primary w-full text-xs py-2"
              disabled={placing || cart.lines.length === 0 || address.trim().length < 10 || walletShortfall > 0}
              onClick={onPlace}
            >
              {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              Place order{payment === "WALLET" && cart.lines.length > 0 ? ` · pay ${inr(cart.totalInr)} from wallet` : ""}
            </button>
            {address.trim().length < 10 && (
              <p className="text-[11px] text-amber-300">Add a delivery address (house, area, city, PIN) to continue.</p>
            )}
            {payment === "WALLET" && cart.lines.length > 0 && walletShortfall === 0 && (
              <p className="text-[11px] text-[hsl(40_100%_55%)]">
                {inr(cart.totalInr)} will be deducted from your NexaCash wallet. Cancelling the order refunds it.
              </p>
            )}
            {walletShortfall > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
                <Wallet className="h-3 w-3 flex-shrink-0" />
                Wallet is short by {inr(walletShortfall)} —
                <button onClick={onOpenWallet} className="font-semibold underline underline-offset-2 hover:text-amber-200">
                  add money
                </button>
                or pick another payment method.
              </p>
            )}
          </div>
        </div>
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
      className={`rounded border p-1 text-[hsl(220_10%_50%)] transition-colors ${
        danger
          ? "border-[hsl(222_25%_20%)] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
          : "border-[hsl(222_25%_20%)] hover:border-[hsl(222_25%_28%)] hover:bg-[hsl(222_35%_13%)] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function OrdersCard({
  id,
  orders,
  products,
  clientId,
  now,
  fetchedAt,
  onRefresh,
  onChanged,
  onError,
  onNotice,
}: {
  id: string;
  orders: OrderView[];
  products: ProductView[];
  clientId: string;
  now: number;
  fetchedAt: number;
  onRefresh: () => void;
  onChanged: (orders: OrderView[]) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string) => void;
}) {
  return (
    <section id={id} className="card scroll-mt-20">
      <div className="flex items-center gap-2 border-b border-[hsl(222_25%_15%)] p-3">
        <Truck className="h-4 w-4 text-[hsl(191_100%_55%)]" />
        <h2 className="text-sm font-semibold text-white">Your orders</h2>
        <span className="ml-auto text-[11px] text-[hsl(220_10%_40%)]">status updates live</span>
        <button
          onClick={onRefresh}
          className="rounded p-1 text-[hsl(220_10%_40%)] transition-colors hover:bg-[hsl(222_35%_12%)] hover:text-white"
          aria-label="Refresh orders"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-[520px] space-y-3 overflow-y-auto p-3">
        {orders.length === 0 && (
          <p className="py-6 text-center text-xs text-[hsl(220_10%_40%)]">
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
            fetchedAt={fetchedAt}
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
  fetchedAt,
  onChanged,
  onError,
  onNotice,
}: {
  order: OrderView;
  products: ProductView[];
  clientId: string;
  now: number;
  fetchedAt: number;
  onChanged: (orders: OrderView[]) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addressDraft, setAddressDraft] = useState(order.shippingAddress);
  const [showAddress, setShowAddress] = useState(false);
  const pauseState = useRef({ editing: false, paused: false });
  useEffect(() => {
    pauseState.current = { editing, paused: order.paused };
  }, [editing, order.paused]);

  const remaining = Math.max(0, order.nextChangeInMs - Math.max(0, now - fetchedAt));
  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);

  const apply = async (edit: Parameters<typeof editOrder>[2], successMessage: string) => {
    setBusy(true);
    onError(null);
    try {
      const result = await editOrder(clientId, order.code, edit);
      onChanged(result.orders);
      if (successMessage) onNotice(successMessage);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not change the order");
    } finally {
      setBusy(false);
    }
  };

  const toggleEditing = () => {
    if (!order.editable) return;
    if (!editing) {
      setEditing(true);
      void apply({ action: "pause_edit" }, "Status timer paused — take your time editing.");
    } else {
      setEditing(false);
      void apply({ action: "resume_edit" }, "Editing finished — the status timer is running again.");
    }
  };

  useEffect(() => {
    return () => {
      const { editing: wasEditing, paused: wasPaused } = pauseState.current;
      if (!wasEditing || !wasPaused) return;
      void fetch(`/api/shop/orders/${encodeURIComponent(order.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-nexavoice-client-id": clientId },
        body: JSON.stringify({ action: "resume_edit" }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [order.code, clientId]);

  const suggestions = addQuery.trim()
    ? products
        .filter((p) => `${p.title} ${p.category} ${p.sku}`.toLowerCase().includes(addQuery.trim().toLowerCase()))
        .slice(0, 4)
    : [];

  return (
    <article className="rounded-xl border border-[hsl(222_25%_15%)] bg-[hsl(223_47%_4%)] p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-[hsl(220_15%_85%)]">{order.code}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[order.status]}`}>
          {order.statusText}
        </span>
        <span className="ml-auto text-sm font-semibold text-white">{inr(order.totalInr)}</span>
      </div>

      {/* Progress: Placed → On the way → Delivered */}
      {order.status !== "CANCELLED" && (
        <div className="mt-3 flex items-center gap-1">
          {STATUS_STEPS.map((step, i) => (
            <div key={step.key} className="flex flex-1 items-center gap-1">
              <div
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] ${
                  i <= stepIndex
                    ? STATUS_STEP_ACTIVE[order.status]
                    : "border border-[hsl(222_25%_20%)] bg-[hsl(222_35%_10%)] text-[hsl(220_10%_40%)]"
                }`}
              >
                {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-[10px] ${i <= stepIndex ? "text-[hsl(220_15%_80%)]" : "text-[hsl(220_10%_40%)]"}`}>
                {step.label}
              </span>
              {i < STATUS_STEPS.length - 1 && (
                <div className={`h-px flex-1 ${i < stepIndex ? "bg-[hsl(191_100%_50%)]" : "bg-[hsl(222_25%_18%)]"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {order.paused ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-300">
          <Pause className="h-3 w-3 flex-shrink-0" />
          Status timer stopped while you edit — it resumes when you press “Done editing”.
        </p>
      ) : (
        order.nextChangeInMs > 0 && (
          <p className="mt-2 text-[11px] text-[hsl(220_10%_45%)]">
            {order.editable && order.statusUpdatedAt > order.placedAt ? (
              <>
                Timer restarted — <span className="text-[hsl(220_15%_80%)]">{countdown(remaining)}</span> to the next
                stage. Press “Change items” to pause it while you edit.
              </>
            ) : (
              <>
                Next status change in <span className="text-[hsl(220_15%_80%)]">{countdown(remaining)}</span>
              </>
            )}
          </p>
        )
      )}

      <ul className="mt-2 space-y-1">
        {order.items.map((item) => {
          const p = products.find((x) => x.id === item.productId);
          return (
            <li key={item.productId} className="flex items-center gap-2 text-xs text-[hsl(220_10%_55%)]">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-[hsl(222_35%_12%)] text-[10px]">
                {p?.imageUrl ? (
                  <img src={p.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  p?.emoji ?? "📦"
                )}
              </div>
              <span className="flex-1 truncate">
                {item.qty} × {item.title}
              </span>
              <span className="text-[hsl(220_10%_40%)]">{inr(item.lineTotalInr)}</span>
              {editing && order.editable && (
                <div className="flex items-center gap-1">
                  <IconBtn
                    onClick={() => void apply({ action: "set_qty", productId: item.productId, qty: item.qty - 1 }, `Removed one ${item.title}`)}
                    label="One less"
                  >
                    <Minus className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn
                    onClick={() => void apply({ action: "set_qty", productId: item.productId, qty: item.qty + 1 }, `Added one ${item.title}`)}
                    label="One more"
                  >
                    <Plus className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn
                    onClick={() => void apply({ action: "remove_item", product: item.sku }, `${item.title} removed from ${order.code}`)}
                    label="Remove item"
                    danger
                  >
                    <Trash2 className="h-3 w-3" />
                  </IconBtn>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 flex items-start gap-1 text-[11px] text-[hsl(220_10%_45%)]">
        <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" /> {order.shippingAddress}
      </p>

      {order.editable ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={toggleEditing}
            className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
              editing
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15"
                : "border-[hsl(222_25%_20%)] text-[hsl(220_15%_80%)] hover:border-[hsl(191_100%_50%_/_0.4)] hover:text-white"
            }`}
            disabled={busy}
            title={editing ? "Resume the status timer" : "Edit items — pauses the status timer while you edit"}
          >
            {editing ? "Done editing" : "Change items"}
          </button>
          <button
            onClick={() => setShowAddress((v) => !v)}
            className="rounded-md border border-[hsl(222_25%_20%)] px-2.5 py-1 text-[11px] text-[hsl(220_15%_80%)] transition-colors hover:border-[hsl(191_100%_50%_/_0.4)] hover:text-white"
            disabled={busy}
          >
            Change address
          </button>
          <button
            onClick={() => void apply({ action: "cancel", reason: "cancelled by customer on the shopping page" }, `${order.code} cancelled`)}
            className="rounded-md border border-red-500/30 px-2.5 py-1 text-[11px] text-red-300 transition-colors hover:bg-red-500/10"
            disabled={busy}
          >
            Cancel order
          </button>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[hsl(220_10%_40%)]" />}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-[hsl(220_10%_35%)]">
          {order.status === "CANCELLED"
            ? `Cancelled${order.cancellationReason ? ` — ${order.cancellationReason}` : ""}`
            : "Items are locked once the order leaves the “Placed” stage."}
        </p>
      )}

      {editing && order.editable && (
        <div className="mt-2 rounded-md border border-[hsl(222_25%_15%)] bg-[hsl(222_40%_7%)] p-2">
          <p className="mb-1 text-[11px] text-[hsl(220_10%_45%)]">Add another product to this order</p>
          <input
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            placeholder="Search the catalogue…"
            className="w-full rounded border border-[hsl(222_25%_20%)] bg-[hsl(223_47%_4%)] px-2 py-1.5 text-xs text-white placeholder:text-[hsl(220_10%_35%)] focus:border-[hsl(191_100%_50%_/_0.4)] focus:outline-none"
          />
          <ul className="mt-1 space-y-1">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setAddQuery("");
                    void apply({ action: "add_item", product: p.sku, qty: 1 }, `${p.title} added to ${order.code}`);
                  }}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-[hsl(220_15%_80%)] transition-colors hover:bg-[hsl(222_35%_12%)]"
                >
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-[hsl(222_35%_12%)] text-xs">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
                    ) : (
                      p.emoji
                    )}
                  </div>
                  <span className="flex-1 truncate">{p.title}</span>
                  <span className="text-[hsl(220_10%_40%)]">{inr(p.priceInr)}</span>
                  <ArrowRight className="h-3 w-3 text-[hsl(220_10%_40%)]" />
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
            className="w-full resize-none rounded border border-[hsl(222_25%_20%)] bg-[hsl(223_47%_4%)] px-2 py-1.5 text-xs text-white focus:border-[hsl(191_100%_50%_/_0.4)] focus:outline-none"
          />
          <button
            className="btn-primary h-7 rounded-md px-3 text-[11px]"
            disabled={busy || addressDraft.trim().length < 10}
            onClick={() => {
              setShowAddress(false);
              void apply({ action: "address", address: addressDraft.trim() }, `Address updated for ${order.code}`);
            }}
          >
            Save address
          </button>
        </div>
      )}

      {order.history.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-[hsl(220_10%_40%)] hover:text-[hsl(220_10%_60%)]">
            Timeline
          </summary>
          <ul className="mt-1 space-y-0.5">
            {order.history.map((h, i) => (
              <li key={i} className="text-[11px] text-[hsl(220_10%_45%)]">
                <span className="font-mono text-[hsl(220_10%_35%)]">
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

export function SignInPrompt() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(223_47%_4%)] text-white">
      <div className="rounded-xl border border-[hsl(222_25%_15%)] bg-[hsl(222_40%_7%)] p-8 text-center">
        <Headset className="mx-auto mb-3 h-8 w-8 text-[hsl(191_100%_55%)]" />
        <p className="mb-3 text-sm text-[hsl(220_10%_50%)]">Sign in to start shopping.</p>
        <Link href="/login?role=client" className="text-sm text-[hsl(191_100%_55%)] hover:text-[hsl(191_100%_65%)]">
          Go to sign in →
        </Link>
      </div>
    </div>
  );
}
