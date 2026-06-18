import { Link } from "@tanstack/react-router";
import type { Market } from "@/lib/sim/types";
import { useSimStore, selectDisplayPrice } from "@/lib/store/sim-store";
import { Countdown } from "./Countdown";

const ASSET_COLOR: Record<string, string> = {
  BTC: "bg-[#f7931a]",
  ETH: "bg-[#627eea]",
  SOL: "bg-[#9945ff]",
};

export function MarketCard({ market }: { market: Market }) {
  const book = useSimStore((s) => s.books[market.id]);
  const upPrice = selectDisplayPrice(book, "UP");
  const downPrice = selectDisplayPrice(book, "DOWN");
  const upPct = upPrice != null ? Math.round(upPrice * 100) : null;
  const downPct = downPrice != null ? Math.round(downPrice * 100) : null;
  const direction = market.currentPrice >= market.priceToBeat ? "up" : "down";

  return (
    <Link
      to="/market/$marketId"
      params={{ marketId: market.id }}
      className="block rounded-lg border border-hairline bg-surface hover:bg-surface-2 transition p-4"
    >
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-full ${ASSET_COLOR[market.asset]} flex items-center justify-center text-white text-xs font-bold`}>
          {market.asset}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">
            {market.asset} Up or Down — {market.windowMin}m
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="num">${market.priceToBeat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span>→</span>
            <span className={`num ${direction === "up" ? "text-up" : "text-down"}`}>
              ${market.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide">closes</div>
          <Countdown to={market.closeAt} className="text-sm font-semibold" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-up/10 border border-up/20 px-3 py-2">
          <div className="text-[10px] uppercase text-up tracking-wide">Up</div>
          <div className="num text-up font-semibold">{upPct != null ? `${upPct}¢` : "—"}</div>
        </div>
        <div className="rounded-md bg-down/10 border border-down/20 px-3 py-2">
          <div className="text-[10px] uppercase text-down tracking-wide">Down</div>
          <div className="num text-down font-semibold">{downPct != null ? `${downPct}¢` : "—"}</div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground flex justify-between">
        <span>Vol ${market.volume.toFixed(0)}</span>
        <span>{market.windowMin}m window</span>
      </div>
    </Link>
  );
}
