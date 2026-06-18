import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSimStore, selectDisplayPrice } from "@/lib/store/sim-store";
import { OrderBookTable } from "@/components/market/OrderBookTable";
import { OrderTicket } from "@/components/market/OrderTicket";
import { PriceChart } from "@/components/market/PriceChart";
import { Countdown } from "@/components/market/Countdown";

export const Route = createFileRoute("/market/$marketId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.marketId} — Polysim` },
      { name: "description", content: "Marché Up/Down crypto — carnet d'ordres, prix temps réel, paper trading." },
    ],
  }),
  component: MarketDetail,
  notFoundComponent: () => (
    <div className="py-20 text-center text-sm text-muted-foreground">
      Marché introuvable. <Link to="/" className="text-primary">Retour</Link>
    </div>
  ),
});

function MarketDetail() {
  const { marketId } = Route.useParams();
  const market = useSimStore((s) => s.markets[marketId]);
  const book = useSimStore((s) => s.books[marketId]);
  const history = useSimStore((s) => s.history[marketId] ?? []);

  if (!market) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Marché en cours de chargement… si le flux Binance n'est pas encore connecté, patientez quelques secondes.
      </div>
    );
  }

  const upPx = selectDisplayPrice(book, "UP");
  const downPx = selectDisplayPrice(book, "DOWN");
  const direction = market.currentPrice >= market.priceToBeat;
  const delta = market.currentPrice - market.priceToBeat;

  return (
    <div className="space-y-4">
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Tous les marchés</Link>

      <header className="rounded-lg border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <h1 className="text-lg font-bold">
              {market.asset} Up or Down — {market.windowMin} min
            </h1>
            <p className="text-xs text-muted-foreground">
              {market.state === "OPEN" ? "Ouvre " : "Ouvert "}
              {new Date(market.openAt).toLocaleTimeString()} → {new Date(market.closeAt).toLocaleTimeString()}
            </p>
          </div>
          <div className="flex gap-6 ml-auto text-sm">
            <Stat label="Prix à battre" value={`$${market.priceToBeat.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
            <Stat
              label="Prix actuel"
              value={`$${market.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              extra={
                <span className={`num text-xs ${direction ? "text-up" : "text-down"}`}>
                  {delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(2)}
                </span>
              }
            />
            <Stat
              label="Clôture dans"
              value={market.state === "OPEN" ? <Countdown to={market.closeAt} /> : market.state}
            />
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-hairline bg-surface p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Prix {market.asset}/USDT</h2>
              <span className="text-[10px] uppercase text-muted-foreground">Binance · live</span>
            </div>
            {history.length > 1 ? (
              <PriceChart data={history} priceToBeat={market.priceToBeat} color={direction ? "var(--up)" : "var(--down)"} />
            ) : (
              <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">
                Construction de l'historique…
              </div>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-up">Carnet Up · {upPx != null ? `${Math.round(upPx * 100)}¢` : "—"}</h3>
                <span className="text-[10px] text-muted-foreground">{market.state === "OPEN" ? "Live" : "Closed"}</span>
              </div>
              {book ? <OrderBookTable book={book.UP} accent="up" /> : <Empty />}
            </div>
            <div className="rounded-lg border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-down">Carnet Down · {downPx != null ? `${Math.round(downPx * 100)}¢` : "—"}</h3>
                <span className="text-[10px] text-muted-foreground">{market.state === "OPEN" ? "Live" : "Closed"}</span>
              </div>
              {book ? <OrderBookTable book={book.DOWN} accent="down" /> : <Empty />}
            </div>
          </section>

          <section className="rounded-lg border border-hairline bg-surface p-4 text-xs text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground mb-1">Règles</h3>
            <p>
              Si <span className="num text-foreground">{market.asset}</span> clôture à{" "}
              <span className="num text-foreground">{new Date(market.closeAt).toLocaleTimeString()}</span>{" "}
              au-dessus de <span className="num text-foreground">${market.priceToBeat.toFixed(2)}</span>, le token{" "}
              <span className="text-up font-semibold">Up</span> est résolu à $1. Sinon, le token{" "}
              <span className="text-down font-semibold">Down</span> est résolu à $1. Source: Binance spot price.
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          {market.state === "OPEN" ? (
            <OrderTicket market={market} />
          ) : (
            <div className="rounded-lg border border-hairline bg-surface p-4 text-sm">
              <div className="text-muted-foreground text-xs mb-1">Marché résolu</div>
              <div className={`text-2xl font-bold ${market.resolvedOutcome === "UP" ? "text-up" : "text-down"}`}>
                {market.resolvedOutcome}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Va dans Portfolio pour racheter tes positions gagnantes.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, extra }: { label: string; value: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="num font-semibold text-base flex items-baseline gap-2">{value} {extra}</div>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-muted-foreground py-6 text-center">Carnet en cours de construction…</div>;
}
