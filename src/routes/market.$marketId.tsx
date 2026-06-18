import { createFileRoute, Link } from "@tanstack/react-router";
import { Countdown } from "@/components/market/Countdown";
import { OrderBookTable } from "@/components/market/OrderBookTable";
import { OrderTicket } from "@/components/market/OrderTicket";
import { selectDisplayPrice, useSimStore } from "@/lib/store/sim-store";
import type { Outcome } from "@/lib/sim/types";

export const Route = createFileRoute("/market/$marketId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.marketId} — Polysim` },
      { name: "description", content: "Détail marché Polymarket CLOB et paper trading." },
    ],
  }),
  component: MarketDetail,
});

function MarketDetail() {
  const { marketId } = Route.useParams();
  const market = useSimStore((state) => state.markets[marketId]);
  const book = useSimStore((state) => state.books[marketId]);
  const clobStatus = useSimStore((state) => state.clobStatus);
  const fills = useSimStore((state) => state.portfolio.fills.filter((fill) => fill.marketId === marketId).slice(-8).reverse());

  if (!market) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Marché Polymarket introuvable ou discovery en cours. <Link to="/" className="text-primary">Retour</Link>
      </div>
    );
  }

  const upPx = selectDisplayPrice(book, "UP") ?? market.outcomePrices.UP;
  const downPx = selectDisplayPrice(book, "DOWN") ?? market.outcomePrices.DOWN;
  const canTrade = market.state === "LIVE" || market.state === "CLOSING";

  return (
    <div className="space-y-4">
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Tous les marchés</Link>

      <header className="rounded-lg border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold">{market.question}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Polymarket · {market.asset} · {market.windowMin === 60 ? "1h" : `${market.windowMin}m`} · {market.slug}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Stat label="Statut" value={market.status} />
            <Stat label="CLOB" value={clobStatus} />
            <Stat label={market.status === "upcoming" ? "Ouverture" : "Clôture"} value={market.status === "resolved" ? "Résolu" : <Countdown to={market.status === "upcoming" ? market.startDate : market.endDate} />} />
            <Stat label="Fee taker" value={`${(market.feeRateBps / 100).toFixed(2)}%`} />
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Condition" value={shortId(market.conditionId)} />
        <Metric label={market.outcomeLabels.UP} value={upPx != null ? `${Math.round(upPx * 100)}¢` : "—"} tone="up" />
        <Metric label={market.outcomeLabels.DOWN} value={downPx != null ? `${Math.round(downPx * 100)}¢` : "—"} tone="down" />
        <Metric label="Liquidité visible" value={`$${book ? (book.UP.liquidity + book.DOWN.liquidity).toFixed(0) : market.liquidity.toFixed(0)}`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-hairline bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Tokens CLOB</h2>
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <TokenRow outcome="UP" label={market.outcomeLabels.UP} tokenId={market.clobTokenIds.UP} />
              <TokenRow outcome="DOWN" label={market.outcomeLabels.DOWN} tokenId={market.clobTokenIds.DOWN} />
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <BookPanel title={market.outcomeLabels.UP} price={upPx} outcome="UP" book={book?.UP} />
            <BookPanel title={market.outcomeLabels.DOWN} price={downPx} outcome="DOWN" book={book?.DOWN} />
          </section>

          <section className="rounded-lg border border-hairline bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Derniers fills paper</h2>
              <span className="text-[10px] uppercase text-muted-foreground">local</span>
            </div>
            {fills.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Aucun fill paper sur ce marché.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-muted-foreground">
                    <tr><th className="py-1 text-left">Heure</th><th>Outcome</th><th>Side</th><th className="text-right">Prix</th><th className="text-right">Size</th><th className="text-right">Fee</th></tr>
                  </thead>
                  <tbody>
                    {fills.map((fill) => (
                      <tr key={fill.id} className="border-t border-hairline">
                        <td className="py-2 text-muted-foreground">{new Date(fill.ts).toLocaleTimeString()}</td>
                        <td className={fill.outcome === "UP" ? "text-up" : "text-down"}>{fill.outcome}</td>
                        <td>{fill.side}</td>
                        <td className="num text-right">{Math.round(fill.price * 100)}¢</td>
                        <td className="num text-right">{fill.size.toFixed(2)}</td>
                        <td className="num text-right">${fill.fee.toFixed(5)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {canTrade ? (
            <OrderTicket market={market} />
          ) : (
            <div className="rounded-lg border border-hairline bg-surface p-4 text-sm">
              <div className="text-xs text-muted-foreground">{market.status === "upcoming" ? "Marché à venir" : "Marché résolu"}</div>
              <div className="mt-1 text-2xl font-bold">{market.resolvedOutcome ?? market.status}</div>
              <p className="mt-2 text-xs text-muted-foreground">
                Aucun ordre paper ne sera exécuté hors fenêtre live/closing.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function BookPanel({ title, price, outcome, book }: { title: string; price: number | null; outcome: Outcome; book: any }) {
  const tone = outcome === "UP" ? "up" : "down";
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className={`text-sm font-semibold ${tone === "up" ? "text-up" : "text-down"}`}>{title} · {price != null ? `${Math.round(price * 100)}¢` : "—"}</h3>
        <span className="text-[10px] text-muted-foreground">CLOB</span>
      </div>
      {book ? <OrderBookTable book={book} accent={tone} /> : <Empty />}
    </div>
  );
}

function TokenRow({ outcome, label, tokenId }: { outcome: Outcome; label: string; tokenId: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface-2 p-3">
      <div className={outcome === "UP" ? "text-up" : "text-down"}>{label}</div>
      <div className="num mt-1 break-all text-muted-foreground">{tokenId}</div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`num text-lg font-bold ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : ""}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="num font-semibold capitalize">{value}</div>
    </div>
  );
}

function Empty() {
  return <div className="py-6 text-center text-xs text-muted-foreground">Bootstrap CLOB en cours…</div>;
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
