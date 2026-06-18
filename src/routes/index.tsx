import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSimStore } from "@/lib/store/sim-store";
import { MarketCard } from "@/components/market/MarketCard";
import type { Asset, WindowMin } from "@/lib/sim/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Markets — Polysim" },
      { name: "description", content: "BTC, ETH, SOL — Up/Down 5m & 15m paper trading markets." },
    ],
  }),
  component: Browse,
});

const ASSETS: (Asset | "ALL")[] = ["ALL", "BTC", "ETH", "SOL"];
const WINDOWS: (WindowMin | "ALL")[] = ["ALL", 5, 15];

function Browse() {
  const markets = useSimStore((s) => s.markets);
  const prices = useSimStore((s) => s.cryptoPrices);
  const [assetFilter, setAssetFilter] = useState<Asset | "ALL">("ALL");
  const [winFilter, setWinFilter] = useState<WindowMin | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const list = Object.values(markets)
    .filter((m) => m.state === "OPEN")
    .filter((m) => assetFilter === "ALL" || m.asset === assetFilter)
    .filter((m) => winFilter === "ALL" || m.windowMin === winFilter)
    .filter((m) => !query || m.asset.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.closeAt - b.closeAt);

  const noFeed = Object.values(prices).every((p) => p === 0);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Crypto Up or Down</h1>
            <p className="text-xs text-muted-foreground">
              Marchés temps réel basés sur Binance · 5 min & 15 min · paper trading
            </p>
          </div>
          <div className="ml-auto grid grid-cols-3 gap-3 text-xs">
            {(["BTC", "ETH", "SOL"] as Asset[]).map((a) => (
              <div key={a} className="text-right">
                <div className="text-[10px] uppercase text-muted-foreground">{a}</div>
                <div className="num font-semibold">
                  {prices[a] > 0 ? `$${prices[a].toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Rechercher (BTC, ETH, SOL)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[180px] h-9 bg-surface border border-hairline rounded-md px-3 text-sm"
        />
        <div className="flex gap-1">
          {ASSETS.map((a) => (
            <button
              key={a}
              onClick={() => setAssetFilter(a as any)}
              className={`px-3 h-9 rounded-md text-xs border ${
                assetFilter === a ? "bg-accent border-hairline" : "border-hairline text-muted-foreground hover:text-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWinFilter(w as any)}
              className={`px-3 h-9 rounded-md text-xs border ${
                winFilter === w ? "bg-accent border-hairline" : "border-hairline text-muted-foreground hover:text-foreground"
              }`}
            >
              {w === "ALL" ? "Tous" : `${w}m`}
            </button>
          ))}
        </div>
      </section>

      {noFeed && (
        <div className="rounded-md border border-hairline bg-surface p-4 text-sm text-muted-foreground">
          Connexion au flux de prix Binance… les marchés s'ouvriront dans quelques secondes.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => (
          <MarketCard key={m.id} market={m} />
        ))}
        {!noFeed && list.length === 0 && (
          <div className="col-span-full text-sm text-muted-foreground">
            Aucun marché avec ces filtres.
          </div>
        )}
      </section>
    </div>
  );
}
