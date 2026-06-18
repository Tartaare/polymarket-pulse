import type { Fill, Order, Portfolio, Position } from "./types";

export function applyFillsToPortfolio(portfolio: Portfolio, fills: Fill[]): Portfolio {
  let cash = portfolio.cash;
  const positions = portfolio.positions.map((position) => ({ ...position }));

  for (const fill of fills) {
    const idx = positions.findIndex((position) => position.tokenId === fill.tokenId);
    if (fill.side === "BUY") {
      cash -= fill.size * fill.price + fill.fee;
      if (idx === -1) {
        positions.push({
          marketId: fill.marketId,
          tokenId: fill.tokenId,
          outcome: fill.outcome,
          size: fill.size,
          avgPrice: fill.price,
          realizedPnl: -fill.fee,
          feesPaid: fill.fee,
          redeemable: false,
          redeemed: false,
        });
      } else {
        const position = positions[idx];
        const nextSize = position.size + fill.size;
        position.avgPrice = nextSize > 0 ? (position.avgPrice * position.size + fill.price * fill.size) / nextSize : 0;
        position.size = nextSize;
        position.realizedPnl -= fill.fee;
        position.feesPaid += fill.fee;
      }
    } else {
      cash += fill.size * fill.price - fill.fee;
      if (idx !== -1) {
        const position = positions[idx];
        const sold = Math.min(fill.size, position.size);
        position.realizedPnl += (fill.price - position.avgPrice) * sold - fill.fee;
        position.feesPaid += fill.fee;
        position.size -= sold;
      }
    }
  }

  return {
    ...portfolio,
    cash,
    positions: positions.filter((position) => position.size > 1e-9 || position.redeemable || position.redeemed),
    fills: [...portfolio.fills, ...fills],
  };
}

export function positionPnl(position: Position, currentPrice: number): {
  currentValue: number;
  grossPnl: number;
  cashPnl: number;
  percentPnl: number;
  breakEven: number;
} {
  const currentValue = position.size * currentPrice;
  const cost = position.size * position.avgPrice;
  const grossPnl = currentValue - cost;
  const cashPnl = grossPnl + position.realizedPnl;
  const percentPnl = cost > 0 ? cashPnl / cost : 0;
  const breakEven = position.size > 0 ? position.avgPrice + position.feesPaid / position.size : position.avgPrice;
  return { currentValue, grossPnl, cashPnl, percentPnl, breakEven };
}

export function reservedForOrder(order: Order): number {
  if (order.status !== "OPEN" && order.status !== "PARTIALLY_FILLED") return 0;
  if (order.side !== "BUY") return 0;
  if (order.limitPrice == null) return 0;
  return Math.max(0, order.size - order.filled) * order.limitPrice;
}

export function totalReserved(orders: Order[]): number {
  return orders.reduce((acc, order) => acc + reservedForOrder(order), 0);
}
