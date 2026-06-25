import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Market, WindowMin } from "@/lib/sim/types";
import { selectDisplayPrice, useSimStore } from "@/lib/store/sim-store";

const ASSET_ICONS: Record<string, { bg: string; label: string }> = {
  BTC: { bg: "bg-[#f7931a]", label: "₿" },
  ETH: { bg: "bg-[#627eea]", label: "Ξ" },
  SOL: { bg: "bg-[#14f195] text-background", label: "◎" },
};

const WINDOW_TABS: { value: WindowMin; label: string }[] = [
  { value: 5, label: "5 min" },
  { value: 15, label: "15 min" },
  { value: 60, label: "1 heure" },
];

interface CryptoSidebarProps {
  currentMarketId: string;
  currentWindow: WindowMin;
}

export function CryptoSidebar({ currentMarketId, currentWindow }: CryptoSidebarProps) {
  const [windowFilter, setWindowFilter] = useState<WindowMin>(currentWindow);
  const markets = useSimStore((s) => s.markets);

  const otherMarkets = useMemo(() => {
    return Object.values(markets)
      .filter((m) => m.windowMin === windowFilter && m.id !== currentMarketId)
      .filter((m) => m.status === "live" || m.status === "closing" || m.status === "upcoming")
      .sort((a, b) => {
        const statusOrder = (s: string) => (s === "live" || s === "closing" ? 0 : 1);
        return statusOrder(a.status) - statusOrder(b.status) || a.endDate - b.endDate;
      });
  }, [markets, windowFilter, currentMarketId]);

  return (
    <div className="crypto-sidebar">
      <h3 className="crypto-sidebar__title">Autres marchés</h3>

      {/* Duration tabs */}
      <div className="crypto-sidebar__tabs">
        {WINDOW_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`crypto-sidebar__tab ${windowFilter === tab.value ? "crypto-sidebar__tab--active" : ""}`}
            onClick={() => setWindowFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Market list */}
      <div className="crypto-sidebar__list">
        {otherMarkets.length === 0 && (
          <div className="crypto-sidebar__empty">Aucun autre marché {windowFilter === 60 ? "1h" : `${windowFilter}m`} actif</div>
        )}
        {otherMarkets.map((m) => (
          <SidebarMarketRow key={m.id} market={m} />
        ))}
      </div>
    </div>
  );
}

function SidebarMarketRow({ market }: { market: Market }) {
  const book = useSimStore((s) => s.books[market.id]);
  const upPrice = selectDisplayPrice(book, "UP") ?? market.outcomePrices.UP;
  const isLive = market.status === "live" || market.status === "closing";
  const upPct = upPrice != null ? Math.round(upPrice * 100) : null;
  const direction = upPct != null && upPct >= 50 ? "Up" : "Down";
  const icon = ASSET_ICONS[market.asset] ?? { bg: "bg-muted", label: market.asset[0] };

  return (
    <Link
      to="/market/$marketId"
      params={{ marketId: market.id }}
      className="crypto-sidebar__row"
    >
      <div className={`crypto-sidebar__icon ${icon.bg}`}>{icon.label}</div>
      <div className="crypto-sidebar__info">
        <div className="crypto-sidebar__name">
          {market.asset} Up or Down – {market.windowMin === 60 ? "1h" : `${market.windowMin}m`}
        </div>
        {isLive && <span className="crypto-sidebar__live-dot" />}
      </div>
      <div className="crypto-sidebar__prob">
        <span className="crypto-sidebar__prob-value num">{upPct ?? "—"}%</span>
        <span className={`crypto-sidebar__prob-dir ${direction === "Up" ? "text-up" : "text-down"}`}>
          {direction}
        </span>
      </div>
    </Link>
  );
}
