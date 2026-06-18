import type { Portfolio, Position, Fill, Order, Outcome } from "./types";

export function applyFillsToPortfolio(p: Portfolio, fills: Fill[]): Portfolio {
  let cash = p.cash;
  const positions = p.positions.map((x) => ({ ...x }));
  for (const f of fills) {
    const idx = positions.findIndex((x) => x.marketId === f.marketId && x.outcome === f.outcome);
    if (f.side === "BUY") {
      cash -= f.size * f.price + f.fee;
      if (idx === -1) {
        positions.push({
          marketId: f.marketId,
          outcome: f.outcome,
          size: f.size,
          avgPrice: f.price,
          realizedPnl: -f.fee,
          redeemable: false,
          redeemed: false,
        });
      } else {
        const pos = positions[idx];
        const newSize = pos.size + f.size;
        pos.avgPrice = newSize > 0 ? (pos.avgPrice * pos.size + f.price * f.size) / newSize : 0;
        pos.size = newSize;
        pos.realizedPnl -= f.fee;
      }
    } else {
      // SELL
      cash += f.size * f.price - f.fee;
      if (idx !== -1) {
        const pos = positions[idx];
        const sellSize = Math.min(f.size, pos.size);
        const pnl = (f.price - pos.avgPrice) * sellSize - f.fee;
        pos.realizedPnl += pnl;
        pos.size -= sellSize;
      }
    }
  }
  // drop zero-size positions that aren't redeemable
  const cleaned = positions.filter((x) => x.size > 1e-9 || x.redeemable || x.redeemed);
  return { ...p, cash, positions: cleaned, fills: [...p.fills, ...fills] };
}

export function positionPnl(pos: Position, currentPrice: number): {
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
} {
  const value = pos.size * currentPrice;
  const cost = pos.size * pos.avgPrice;
  const cashPnl = value - cost;
  const percentPnl = cost > 0 ? cashPnl / cost : 0;
  return { currentValue: value, cashPnl, percentPnl };
}

export function reservedForOrder(o: Order): number {
  if (o.status !== "OPEN" && o.status !== "PARTIAL") return 0;
  if (o.side !== "BUY") return 0;
  if (o.limitPrice == null) return 0;
  const remaining = o.size - o.filled;
  return remaining * o.limitPrice;
}

export function totalReserved(orders: Order[]): number {
  return orders.reduce((acc, o) => acc + reservedForOrder(o), 0);
}
