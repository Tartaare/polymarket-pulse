import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MarketCard } from "@/components/market/MarketCard";
import { useSimStore } from "@/lib/store/sim-store";
import type { Asset, Market, PolymarketMarketStatus, WindowMin } from "@/lib/sim/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Markets — Polysim" },
      { name: "description", content: "Vrais marchés Polymarket crypto Up/Down 5m, 15m et 1h." },
    ],
  }),
  component: Browse,
});

const ASSETS: Array<Asset | "ALL"> = ["ALL", "BTC", "ETH", "SOL"];
const WINDOWS: Array<WindowMin | "ALL"> = ["ALL", 5, 15, 60];
const STATUSES: Array<PolymarketMarketStatus | "all"> = ["all", "upcoming", "live", "closing", "resolved"];

function Browse() {
  const [mounted, setMounted] = useState(false);
  const markets = useSimStore((state) => state.markets);
  const loading = useSimStore((state) => state.loadingMarkets);
  const error = useSimStore((state) => state.marketError);
  const clobStatus = useSimStore((state) => state.clobStatus);
  const refreshMarkets = useSimStore((state) => state.refreshMarkets);
  const [assetFilter, setAssetFilter] = useState<Asset | "ALL">("ALL");
  const [windowFilter, setWindowFilter] = useState<WindowMin | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<PolymarketMarketStatus | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const list = Object.values(markets)
    .filter((market) => assetFilter === "ALL" || market.asset === assetFilter)
    .filter((market) => windowFilter === "ALL" || market.windowMin === windowFilter)
    .filter((market) => statusFilter === "all" || market.status === statusFilter)
    .filter((market) => matchesQuery(market, query))
    .sort((a, b) => sortStatus(a.status) - sortStatus(b.status) || a.endDate - b.endDate);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Polymarket Crypto Up/Down</h1>
            <p className="text-xs text-muted-foreground">
              Discovery Gamma · CLOB temps réel · paper trading local 5m/15m/1h
            </p>
          </div>
          <div className="ml-auto grid grid-cols-3 gap-3 text-right text-xs">
            <Stat label="Markets" value={mounted ? String(Object.keys(markets).length) : "—"} />
            <Stat label="CLOB" value={mounted ? clobStatus : "idle"} />
            <Stat label="Live" value={mounted ? String(Object.values(markets).filter((market) => market.status === "live" || market.status === "closing").length) : "—"} />
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-3">
        <WindowStat label="5m" count={mounted ? countWindow(markets, 5) : null} />
        <WindowStat label="15m" count={mounted ? countWindow(markets, 15) : null} />
        <WindowStat label="1h" count={mounted ? countWindow(markets, 60) : null} />
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Rechercher slug, question, token…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 min-w-[220px] flex-1 rounded-md border border-hairline bg-surface px-3 text-sm"
        />
        <Filter values={ASSETS} active={assetFilter} label={(value) => value} onSelect={(value) => setAssetFilter(value as Asset | "ALL")} />
        <Filter values={WINDOWS} active={windowFilter} label={(value) => value === "ALL" ? "Tous" : value === 60 ? "1h" : `${value}m`} onSelect={(value) => setWindowFilter(value as WindowMin | "ALL")} />
        <Filter values={STATUSES} active={statusFilter} label={(value) => value === "all" ? "États" : value} onSelect={(value) => setStatusFilter(value as PolymarketMarketStatus | "all")} />
        <button
          type="button"
          onClick={() => void refreshMarkets()}
          className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
        >
          Rafraîchir
        </button>
      </section>

      {mounted && error && (
        <div className="rounded-md border border-down/30 bg-down/10 p-4 text-sm text-down">
          Discovery Polymarket indisponible : {error}
        </div>
      )}

      {mounted && loading && Object.keys(markets).length === 0 && (
        <div className="rounded-md border border-hairline bg-surface p-4 text-sm text-muted-foreground">
          Scan Gamma API en cours…
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mounted && list.map((market) => <MarketCard key={market.id} market={market} />)}
        {mounted && !loading && list.length === 0 && (
          <div className="col-span-full rounded-md border border-hairline bg-surface p-6 text-sm text-muted-foreground">
            Aucun marché Polymarket crypto Up/Down trouvé pour ces filtres.
          </div>
        )}
        {!mounted && (
          <div className="col-span-full rounded-md border border-hairline bg-surface p-6 text-sm text-muted-foreground">
            Initialisation du terminal Polymarket…
          </div>
        )}
      </section>
    </div>
  );
}

function Filter<T extends string | number>({ values, active, label, onSelect }: {
  values: T[];
  active: T;
  label: (value: T) => string;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
          className={`h-9 rounded-md border px-3 text-xs capitalize ${active === value ? "border-hairline bg-accent text-foreground" : "border-hairline text-muted-foreground"}`}
        >
          {label(value)}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="num font-semibold capitalize">{value}</div>
    </div>
  );
}

function WindowStat({ label, count }: { label: string; count: number | null }) {
  return (
    <div className="rounded-md border border-hairline bg-surface px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="num text-sm font-semibold">{count == null ? "—" : count}</div>
    </div>
  );
}

function countWindow(markets: Record<string, Market>, windowMin: WindowMin): number {
  return Object.values(markets).filter((market) => market.windowMin === windowMin).length;
}

function matchesQuery(market: Market, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = `${market.question} ${market.slug} ${market.conditionId} ${market.clobTokenIds.UP} ${market.clobTokenIds.DOWN}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function sortStatus(status: PolymarketMarketStatus): number {
  if (status === "live") return 0;
  if (status === "closing") return 1;
  if (status === "upcoming") return 2;
  return 3;
}
