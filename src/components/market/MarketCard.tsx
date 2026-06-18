import { Link } from "@tanstack/react-router";
import type { Market } from "@/lib/sim/types";
import { selectDisplayPrice, useSimStore } from "@/lib/store/sim-store";
import { Countdown } from "./Countdown";

const ASSET_COLOR: Record<string, string> = {
  BTC: "bg-[#f7931a]",
  ETH: "bg-[#627eea]",
  SOL: "bg-[#14f195] text-background",
};

export function MarketCard({ market }: { market: Market }) {
  const book = useSimStore((state) => state.books[market.id]);
  const upPrice = selectDisplayPrice(book, "UP") ?? market.outcomePrices.UP;
  const downPrice = selectDisplayPrice(book, "DOWN") ?? market.outcomePrices.DOWN;
  const liquidity = book ? book.UP.liquidity + book.DOWN.liquidity : market.liquidity;

  return (
    <Link
      to="/market/$marketId"
      params={{ marketId: market.id }}
      className="block rounded-lg border border-hairline bg-surface p-4 transition hover:bg-surface-2"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${ASSET_COLOR[market.asset]}`}>
          {market.asset}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{market.question}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{market.windowMin === 60 ? "1h" : `${market.windowMin}m`}</span>
            <span>·</span>
            <span>{statusLabel(market.status)}</span>
            <span>·</span>
            <span className="num">{shortId(market.conditionId)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {market.status === "upcoming" ? "opens" : market.status === "resolved" ? "closed" : "closes"}
          </div>
          {market.status === "resolved" ? (
            <div className="text-sm font-semibold">Résolu</div>
          ) : (
            <Countdown to={market.status === "upcoming" ? market.startDate : market.endDate} className="text-sm font-semibold" />
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <OutcomeTile label={market.outcomeLabels.UP} price={upPrice} tone="up" />
        <OutcomeTile label={market.outcomeLabels.DOWN} price={downPrice} tone="down" />
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span className="num">Liq ${liquidity.toFixed(0)}</span>
        <span className="num">Fee {(market.feeRateBps / 100).toFixed(2)}%</span>
      </div>
    </Link>
  );
}

function OutcomeTile({ label, price, tone }: { label: string; price: number | null; tone: "up" | "down" }) {
  const color = tone === "up" ? "text-up border-up/20 bg-up/10" : "text-down border-down/20 bg-down/10";
  return (
    <div className={`rounded-md border px-3 py-2 ${color}`}>
      <div className="truncate text-[10px] uppercase tracking-wide">{label}</div>
      <div className="num font-semibold">{price != null ? `${Math.round(price * 100)}¢` : "—"}</div>
    </div>
  );
}

function statusLabel(status: Market["status"]): string {
  if (status === "upcoming") return "Upcoming";
  if (status === "closing") return "Closing";
  if (status === "resolved") return "Resolved";
  return "Live";
}

function shortId(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
