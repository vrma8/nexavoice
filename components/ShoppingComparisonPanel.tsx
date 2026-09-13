"use client";

import { ExternalLink, Loader2, SearchX, ShieldAlert, X } from "lucide-react";
import type {
  ShoppingComparisonGroupUi,
  ShoppingComparisonPayload,
  ShoppingOfferUi,
  ShoppingStoreStatusUi,
  ShoppingUiState,
} from "@/lib/shopping/types";

const inr = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;

const STORE_DOT: Record<string, string> = {
  amazon: "bg-[hsl(33_95%_55%)]",
  flipkart: "bg-[hsl(213_90%_55%)]",
};

function StoreChips({ stores }: { stores: ShoppingStoreStatusUi[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stores.map((s) => (
        <span
          key={s.store}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            s.ok
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
              : "border-amber-400/25 bg-amber-400/10 text-amber-300"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STORE_DOT[s.store] ?? "bg-slate-400"}`} />
          {s.label}
          <span className="opacity-70">{s.ok ? `· ${s.productCount}` : "· unreachable"}</span>
        </span>
      ))}
    </div>
  );
}

function OfferRow({
  offer,
  best,
  savings,
}: {
  offer: ShoppingOfferUi;
  best: boolean;
  savings: number | null | undefined;
}) {
  return (
    <div
      className={`flex gap-2.5 rounded-xl border p-2.5 ${
        best
          ? "border-emerald-400/35 bg-emerald-400/[0.07]"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      {offer.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={offer.imageUrl}
          alt={offer.title}
          className="h-14 w-14 shrink-0 rounded-lg border border-white/10 bg-white object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[10px] text-slate-500">
          no image
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${STORE_DOT[offer.storeId] ?? "bg-slate-400"}`} />
          <span className="text-[11px] font-semibold text-slate-200">{offer.store}</span>
          {best && (
            <span className="rounded-full bg-emerald-400/15 px-1.5 py-px text-[9px] font-bold tracking-wide text-emerald-300">
              CHEAPEST
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-400" title={offer.title}>
          {offer.title}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-sm font-bold text-white">{inr(offer.priceInr)}</span>
          {offer.mrpInr != null && offer.priceInr != null && offer.mrpInr > offer.priceInr && (
            <span className="text-[10px] text-slate-500 line-through">{inr(offer.mrpInr)}</span>
          )}
          {offer.discountPercent != null && offer.discountPercent > 0 && (
            <span className="text-[10px] font-semibold text-emerald-400">{offer.discountPercent}% off</span>
          )}
          {offer.rating != null && (
            <span className="text-[10px] text-amber-300">
              ★ {offer.rating.toFixed(1)}
              {offer.reviewCount != null ? ` (${offer.reviewCount.toLocaleString("en-IN")})` : ""}
            </span>
          )}
          <span
            className={`text-[10px] ${
              offer.availability === "in_stock"
                ? "text-slate-400"
                : offer.availability === "out_of_stock"
                  ? "text-rose-300"
                  : "text-slate-500"
            }`}
          >
            {offer.availability === "in_stock" ? "In stock" : offer.availability === "out_of_stock" ? "Out of stock" : ""}
          </span>
        </div>
        {best && savings != null && savings > 0 && (
          <p className="mt-0.5 text-[11px] font-semibold text-emerald-300">You save {inr(savings)}</p>
        )}
      </div>
      <a
        href={offer.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 self-start rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-cyan-300 transition-colors hover:bg-white/10 hover:text-cyan-200"
      >
        <span className="flex items-center gap-1">
          View <ExternalLink className="h-3 w-3" />
        </span>
      </a>
    </div>
  );
}

function ComparisonGroups({ payload }: { payload: ShoppingComparisonPayload }) {
  const group = (g: ShoppingComparisonGroupUi) => {
    const bestIdx = Math.max(
      0,
      g.offers.findIndex((o) => o.storeId !== undefined && o.priceInr != null && o.priceInr === g.bestPriceInr),
    );
    return (
      <div key={g.label} className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="line-clamp-1 text-xs font-semibold text-slate-100" title={g.label}>
            {g.label}
          </p>
          <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-500">
            match {Math.round(g.matchConfidence * 100)}%
          </span>
        </div>
        {g.offers.map((o) => (
          <OfferRow key={o.storeId + o.url} offer={o} best={o === g.offers[bestIdx] && g.offers.length > 1} savings={g.savingsInr} />
        ))}
      </div>
    );
  };
  return (
    <div className="space-y-3">
      {payload.groups.map(group)}
      {payload.singletons.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Found on one store only
          </p>
          {payload.singletons.map((g) => (
            <OfferRow key={g.label} offer={g.offers[0]} best={false} savings={null} />
          ))}
        </div>
      )}
      {payload.groups.length === 0 && payload.singletons.length === 0 && (
        <p className="text-xs text-slate-400">Nothing found for this product on the stores that answered.</p>
      )}
    </div>
  );
}

export default function ShoppingComparisonPanel({
  shopping,
  onDismiss,
}: {
  shopping: ShoppingUiState | null;
  onDismiss?: () => void;
}) {
  if (!shopping) return null;
  const running = shopping.status === "running";
  const failed = shopping.status === "failed";
  const payload = shopping.comparison ?? shopping.search ?? null;
  const comparison = shopping.comparison ?? null;
  const search = shopping.search ?? null;
  const alternatives = search?.alternatives ?? null;

  return (
    <aside
      aria-live="polite"
      className="pointer-events-auto fixed bottom-24 right-4 z-40 w-[calc(100vw-2rem)] max-w-[400px] overflow-hidden rounded-2xl border border-white/10 bg-[hsl(222_47%_5%_/_0.96)] shadow-2xl shadow-black/60 backdrop-blur-md"
    >
      <header className="flex items-start justify-between gap-2 border-b border-white/10 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wide text-cyan-300 uppercase">
            {running
              ? "Comparing prices…"
              : failed
                ? "Price check failed"
                : shopping.kind === "compare"
                  ? "Live price comparison"
                  : shopping.kind === "alternatives"
                    ? "Cheaper options"
                    : "Live store prices"}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-400" title={shopping.query}>
            “{shopping.query}”
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
          aria-label="Dismiss comparison"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="max-h-[46vh] space-y-3 overflow-y-auto px-3.5 py-3">
        {running && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
              Checking {shopping.stores.join(" and ")}…
            </div>
            <p className="text-[10px] leading-snug text-slate-500">
              Pulling live prices from the store pages — this takes a few seconds.
            </p>
          </div>
        )}

        {failed && (
          <div className="flex gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-2.5 text-xs leading-snug text-rose-200">
            <SearchX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {shopping.note ?? "None of the stores could be reached just now."} No prices were shown — the agent
              will offer to retry instead of guessing.
            </span>
          </div>
        )}

        {!running && !failed && (
          <>
            {shopping.status === "partial" && shopping.storeStatus && <StoreChips stores={shopping.storeStatus} />}
            {shopping.status === "partial" && shopping.note && (
              <div className="flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-2 text-[11px] leading-snug text-amber-100">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                <span>{shopping.note} Prices below are from the store(s) that answered.</span>
              </div>
            )}

            {comparison && <ComparisonGroups payload={comparison} />}

            {!comparison && search && search.products.length > 0 && (
              <div className="space-y-1.5">
                {search.products.slice(0, 4).map((p) => (
                  <OfferRow key={p.url} offer={p} best={false} savings={null} />
                ))}
              </div>
            )}

            {alternatives && (alternatives.sameProductCheaper.length > 0 || alternatives.alternatives.length > 0) && (
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                {alternatives.sameProductCheaper.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                      Same product — cheaper elsewhere
                    </p>
                    {alternatives.sameProductCheaper.map((c) => (
                      <div key={c.url} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="line-clamp-1 text-slate-300">{c.store}</span>
                        <span className="whitespace-nowrap font-semibold text-emerald-300">
                          {inr(c.priceInr)} <span className="font-normal text-slate-500">({c.note})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {alternatives.alternatives.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-sky-300">
                      Alternatives (different brands)
                    </p>
                    {alternatives.alternatives.map((c) => (
                      <a
                        key={c.url}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-[11px] transition-colors hover:bg-white/[0.05]"
                      >
                        <span className="line-clamp-1 text-slate-300">{c.title}</span>
                        <span className="whitespace-nowrap font-semibold text-white">{inr(c.priceInr)}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!payload && <p className="text-xs text-slate-400">The stores answered, but nothing matched the request.</p>}
          </>
        )}
      </div>

      {!running && !failed && (
        <footer className="border-t border-white/10 px-3.5 py-2">
          <div className="flex items-center justify-between gap-2">
            {shopping.storeStatus ? <StoreChips stores={shopping.storeStatus} /> : <span />}
            <span className="shrink-0 text-[9px] text-slate-500">
              live · {new Date(shopping.finishedAt ?? shopping.startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className="mt-1 text-[9px] leading-snug text-slate-600">
            Prices are live from the stores and can change. NexaMart doesn’t sell these items — “View” opens the store
            page.
          </p>
        </footer>
      )}
    </aside>
  );
}
