import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MarketChart } from "@/components/market/MarketChart";
import { MarketTimer } from "@/components/market/MarketTimer";
import { MarketResolution } from "@/components/market/MarketResolution";
import { MarketNavigation } from "@/components/market/MarketNavigation";
import { OrderTicket } from "@/components/market/OrderTicket";
import { OrderBookTable } from "@/components/market/OrderBookTable";
import { CryptoSidebar } from "@/components/market/CryptoSidebar";
import { selectDisplayPrice, useSimStore } from "@/lib/store/sim-store";
import { useTimezone, formatTime, formatDate, tzLabel } from "@/hooks/use-timezone";
import type { Outcome, OutcomeBook } from "@/lib/sim/types";

const ASSET_ICONS: Record<string, { bg: string; symbol: string }> = {
  BTC: { bg: "bg-[#f7931a]", symbol: "₿" },
  ETH: { bg: "bg-[#627eea]", symbol: "Ξ" },
  SOL: { bg: "bg-[#14f195] text-background", symbol: "◎" },
};

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
  const market = useSimStore((s) => s.markets[marketId]);
  const book = useSimStore((s) => s.books[marketId]);
  const markets = useSimStore((s) => s.markets);
  const portfolio = useSimStore((s) => s.portfolio);
  const [tz] = useTimezone();
  const [showOrderBook, setShowOrderBook] = useState(false);

  const positions = useMemo(
    () => portfolio.positions.filter((p) => p.marketId === marketId && p.size > 0),
    [portfolio.positions, marketId],
  );

  if (!market) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Marché Polymarket introuvable ou discovery en cours.{" "}
        <Link to="/" className="text-primary">Retour</Link>
      </div>
    );
  }

  const upPx = selectDisplayPrice(book, "UP") ?? market.outcomePrices.UP;
  const downPx = selectDisplayPrice(book, "DOWN") ?? market.outcomePrices.DOWN;
  const canTrade = market.state === "LIVE" || market.state === "CLOSING";
  const isLive = market.state === "LIVE" || market.state === "CLOSING";
  const isAwaitingResolution = market.state === "ENDED" || market.state === "AWAITING_RESOLUTION";
  const isResolved = market.state === "RESOLVED";
  const icon = ASSET_ICONS[market.asset] ?? { bg: "bg-muted", symbol: market.asset[0] };
  const windowLabel = market.windowMin === 60 ? "1h" : `${market.windowMin}m`;
  const title = `${market.asset} Up or Down ${windowLabel}`;
  const subtitle = `${formatDate(market.startDate, tz)}, ${formatTime(market.startDate, tz)}–${formatTime(market.endDate, tz)} ${tzLabel(tz)}`;

  return (
    <div className="market-page">
      {/* === HEADER === */}
      <header className="market-header">
        <Link to="/" className="market-header__back">← Marchés</Link>
        <div className="market-header__main">
          <div className={`market-header__icon ${icon.bg}`}>{icon.symbol}</div>
          <div className="market-header__text">
            <h1 className="market-header__title">{title}</h1>
            <p className="market-header__subtitle">{subtitle}</p>
          </div>
        </div>
        <div className="market-header__stats">
          <PriceStat label="Prix à battre" value={extractTargetDisplay(market.question)} />
          <PriceStat
            label={upPx != null && upPx >= (downPx ?? 0) ? "UP" : "DOWN"}
            value={upPx != null ? `${Math.round(upPx * 100)}¢` : "—"}
            tone={upPx != null && upPx >= 0.5 ? "up" : "down"}
          />
          <PriceStat
            label="Liquidité"
            value={`$${book ? (book.UP.liquidity + book.DOWN.liquidity).toFixed(0) : market.liquidity.toFixed(0)}`}
          />
        </div>
      </header>

      {/* === Resolution States === */}
      {(isAwaitingResolution || isResolved) && (
        <MarketResolution
          marketQuestion={market.question}
          windowLabel={subtitle}
          resolvedOutcome={market.resolvedOutcome}
          isAwaitingResolution={isAwaitingResolution}
        />
      )}

      {/* === MAIN LAYOUT === */}
      <div className="market-layout">
        {/* Left: Chart + OrderBook + Navigation */}
        <div className="market-layout__main">
          {/* Chart zone with timer */}
          <div className="market-chart-zone">
            <div className="market-chart-zone__timer">
              <MarketTimer endDate={market.endDate} isLive={isLive} />
            </div>
            <MarketChart
              market={market}
              upProb={upPx}
              positions={positions}
            />
          </div>

          {/* Collapsible Order Book */}
          <div className="market-orderbook-section">
            <button
              type="button"
              className="market-orderbook-section__toggle"
              onClick={() => setShowOrderBook(!showOrderBook)}
              aria-expanded={showOrderBook}
            >
              <span>Carnet d'ordres</span>
              <svg
                width="12"
                height="7"
                viewBox="0 0 12 7"
                fill="none"
                className={`market-orderbook-section__chevron ${showOrderBook ? "market-orderbook-section__chevron--open" : ""}`}
              >
                <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showOrderBook && book && (
              <div className="market-orderbook-section__content">
                <div className="market-orderbook-section__grid">
                  <BookPanel title={market.outcomeLabels.UP} price={upPx} outcome="UP" book={book.UP} />
                  <BookPanel title={market.outcomeLabels.DOWN} price={downPx} outcome="DOWN" book={book.DOWN} />
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <MarketNavigation
            currentMarketId={marketId}
            markets={markets}
            currentAsset={market.asset}
            currentWindow={market.windowMin}
          />
        </div>

        {/* Right: Order Ticket + Crypto Sidebar */}
        <aside className="market-layout__aside">
          {canTrade ? (
            <OrderTicket market={market} />
          ) : (
            <div className="market-layout__ticket-closed">
              <div className="text-xs text-muted-foreground">
                {market.status === "upcoming" ? "Marché à venir" : "Marché terminé"}
              </div>
              <div className="mt-1 text-2xl font-bold">
                {market.resolvedOutcome ?? market.status}
              </div>
            </div>
          )}
          <CryptoSidebar currentMarketId={marketId} currentWindow={market.windowMin} />
        </aside>
      </div>
    </div>
  );
}

function BookPanel({ title, price, outcome, book }: { title: string; price: number | null; outcome: Outcome; book: OutcomeBook }) {
  const tone = outcome === "UP" ? "up" : "down";
  return (
    <div className="market-book-panel">
      <div className="market-book-panel__header">
        <h3 className={`market-book-panel__title ${tone === "up" ? "text-up" : "text-down"}`}>
          {title} · {price != null ? `${Math.round(price * 100)}¢` : "—"}
        </h3>
        <span className="market-book-panel__badge">CLOB</span>
      </div>
      <OrderBookTable book={book} accent={tone} />
    </div>
  );
}

function PriceStat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="market-header__stat">
      <div className="market-header__stat-label">{label}</div>
      <div className={`market-header__stat-value num ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function extractTargetDisplay(question: string): string {
  const match = question.match(/\$[\d,]+\.?\d*/);
  return match ? match[0] : "—";
}
