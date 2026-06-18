import type { Order, Fill, MarketBook, OutcomeBook, BookLevel } from "./types";

export const TAKER_FEE_RATE = 0.07;

export function calcFee(size: number, price: number): number {
  // fee = size * rate * p * (1 - p), rounded to 5 decimals
  return Math.round(size * TAKER_FEE_RATE * price * (1 - price) * 1e5) / 1e5;
}

interface MatchResult {
  fills: Fill[];
  remaining: number; // shares unfilled
  newBook: OutcomeBook;
  totalCost: number; // cash spent (BUY) or received (SELL), excluding fees
  totalFee: number;
}

let fillCounter = 0;
function nextFillId(): string {
  fillCounter += 1;
  return `fill_${Date.now().toString(36)}_${fillCounter}`;
}

// Walk the opposite side of the book.
// BUY consumes asks (ascending price). SELL consumes bids (descending price).
export function matchAgainstBook(opts: {
  order: Order;
  book: OutcomeBook;
  limitPrice?: number; // overrides order.limitPrice for marketable
  ts: number;
}): MatchResult {
  const { order, book, ts } = opts;
  const isBuy = order.side === "BUY";
  const levels = isBuy ? [...book.asks] : [...book.bids];
  const limit = opts.limitPrice ?? order.limitPrice;

  let remaining = order.size - order.filled;
  const fills: Fill[] = [];
  let totalCost = 0;
  let totalFee = 0;
  const consumed: BookLevel[] = [];

  for (const level of levels) {
    if (remaining <= 1e-9) break;
    if (limit != null) {
      if (isBuy && level.price > limit + 1e-9) break;
      if (!isBuy && level.price < limit - 1e-9) break;
    }
    const take = Math.min(level.size, remaining);
    if (take <= 0) continue;
    const fee = calcFee(take, level.price);
    fills.push({
      id: nextFillId(),
      orderId: order.id,
      marketId: order.marketId,
      outcome: order.outcome,
      side: order.side,
      price: level.price,
      size: take,
      fee,
      ts,
    });
    totalCost += take * level.price;
    totalFee += fee;
    remaining -= take;
    consumed.push({ price: level.price, size: take });
  }

  // produce a new book with consumed liquidity removed
  const newLevels = levels
    .map((l) => {
      const c = consumed.find((x) => x.price === l.price);
      if (!c) return l;
      return { price: l.price, size: l.size - c.size };
    })
    .filter((l) => l.size > 1e-9);

  const newBook: OutcomeBook = {
    bids: isBuy ? book.bids : newLevels,
    asks: isBuy ? newLevels : book.asks,
    lastTrade: fills.length > 0
      ? { price: fills[fills.length - 1].price, ts, side: order.side }
      : book.lastTrade,
  };

  return { fills, remaining, newBook, totalCost, totalFee };
}

export function totalCostBuy(order: Order, book: OutcomeBook, limitPrice?: number): { cost: number; canFill: number } {
  const limit = limitPrice ?? order.limitPrice;
  let need = order.size - order.filled;
  let cost = 0;
  let canFill = 0;
  for (const l of book.asks) {
    if (need <= 0) break;
    if (limit != null && l.price > limit + 1e-9) break;
    const take = Math.min(l.size, need);
    cost += take * l.price;
    canFill += take;
    need -= take;
  }
  return { cost, canFill };
}
