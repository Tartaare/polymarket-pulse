import type { BookLevel, Fill, Order, OutcomeBook } from "./types";
import { enrichBook } from "./orderbook";

export function calcFee(size: number, price: number, feeRateBps: number): number {
  const rate = feeRateBps / 10_000;
  return Math.round(size * rate * price * (1 - price) * 100_000) / 100_000;
}

export interface ExecutionEstimate {
  avgPrice: number;
  cost: number;
  fee: number;
  fillable: number;
  slippage: number;
}

export interface MatchResult {
  fills: Fill[];
  remaining: number;
  newBook: OutcomeBook;
  totalCost: number;
  totalFee: number;
  avgPrice: number;
}

let fillCounter = 0;

export function estimateExecution(opts: {
  side: Order["side"];
  size: number;
  book: OutcomeBook;
  limitPrice?: number;
  feeRateBps: number;
}): ExecutionEstimate {
  const levels = opts.side === "BUY" ? opts.book.asks : opts.book.bids;
  const walked = walkLevels(levels, opts.side, opts.size, opts.limitPrice);
  const avgPrice = walked.fillable > 0 ? walked.cost / walked.fillable : 0;
  const reference = opts.side === "BUY" ? opts.book.bestAsk : opts.book.bestBid;
  const slippage = reference && walked.fillable > 0 ? Math.abs(avgPrice - reference) : 0;
  return {
    avgPrice,
    cost: walked.cost,
    fee: calcFee(walked.fillable, avgPrice || 0.5, opts.feeRateBps),
    fillable: walked.fillable,
    slippage,
  };
}

export function matchAgainstBook(opts: {
  order: Order;
  book: OutcomeBook;
  feeRateBps: number;
  ts: number;
}): MatchResult {
  const { order, book, feeRateBps, ts } = opts;
  const isBuy = order.side === "BUY";
  const levels = isBuy ? book.asks : book.bids;
  const remainingBefore = order.size - order.filled;
  const walked = walkLevels(levels, order.side, remainingBefore, order.limitPrice);
  const fills: Fill[] = walked.taken.map((level) => {
    const fee = calcFee(level.size, level.price, feeRateBps);
    return {
      id: nextFillId(),
      orderId: order.id,
      marketId: order.marketId,
      tokenId: order.tokenId,
      outcome: order.outcome,
      side: order.side,
      price: level.price,
      size: level.size,
      fee,
      feeRateBps,
      ts,
    };
  });

  const consumed = new Map(walked.taken.map((level) => [level.price, level.size]));
  const nextLevels = levels
    .map((level) => ({ ...level, size: level.size - (consumed.get(level.price) ?? 0) }))
    .filter((level) => level.size > 1e-9);

  const newBook = enrichBook({
    ...book,
    bids: isBuy ? book.bids : nextLevels,
    asks: isBuy ? nextLevels : book.asks,
    lastTrade: fills.length
      ? { price: fills[fills.length - 1].price, size: fills[fills.length - 1].size, ts, side: order.side }
      : book.lastTrade,
    updatedAt: ts,
  });

  const totalFee = fills.reduce((acc, fill) => acc + fill.fee, 0);
  const totalCost = fills.reduce((acc, fill) => acc + fill.size * fill.price, 0);
  const filled = fills.reduce((acc, fill) => acc + fill.size, 0);
  return {
    fills,
    remaining: remainingBefore - filled,
    newBook,
    totalCost,
    totalFee,
    avgPrice: filled > 0 ? totalCost / filled : 0,
  };
}

function walkLevels(levels: BookLevel[], side: Order["side"], size: number, limitPrice?: number): {
  taken: BookLevel[];
  fillable: number;
  cost: number;
} {
  let remaining = size;
  let cost = 0;
  const taken: BookLevel[] = [];
  for (const level of levels) {
    if (remaining <= 1e-9) break;
    if (limitPrice != null) {
      if (side === "BUY" && level.price > limitPrice + 1e-9) break;
      if (side === "SELL" && level.price < limitPrice - 1e-9) break;
    }
    const take = Math.min(level.size, remaining);
    if (take <= 0) continue;
    taken.push({ price: level.price, size: take });
    cost += take * level.price;
    remaining -= take;
  }
  return { taken, fillable: size - remaining, cost };
}

function nextFillId(): string {
  fillCounter += 1;
  return `fill_${Date.now().toString(36)}_${fillCounter}`;
}
