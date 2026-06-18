import type { BookLevel, MarketBook, OutcomeBook, Side } from "./types";

export interface ClobBookPayload {
  market: string;
  asset_id: string;
  timestamp?: string;
  hash?: string;
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
  min_order_size?: string;
  tick_size?: string;
  last_trade_price?: string;
}

export interface PriceChange {
  asset_id: string;
  price: string;
  size: string;
  side: Side;
  best_bid?: string;
  best_ask?: string;
  hash?: string;
}

const EMPTY_TS = 0;

export function emptyOutcomeBook(tokenId: string): OutcomeBook {
  return {
    tokenId,
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    spread: null,
    mid: null,
    liquidity: 0,
    updatedAt: EMPTY_TS,
  };
}

export function createEmptyMarketBook(marketId: string, conditionId: string, upTokenId: string, downTokenId: string): MarketBook {
  return {
    marketId,
    conditionId,
    UP: emptyOutcomeBook(upTokenId),
    DOWN: emptyOutcomeBook(downTokenId),
    updatedAt: Date.now(),
    source: "clob",
  };
}

export function normalizeLevels(levels: BookLevel[], dir: "asc" | "desc"): BookLevel[] {
  const map = new Map<number, number>();
  for (const level of levels) {
    if (!Number.isFinite(level.price) || !Number.isFinite(level.size) || level.size <= 0) continue;
    map.set(level.price, (map.get(level.price) ?? 0) + level.size);
  }
  return Array.from(map.entries())
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => (dir === "asc" ? a.price - b.price : b.price - a.price));
}

export function enrichBook(book: Omit<OutcomeBook, "bestBid" | "bestAsk" | "spread" | "mid" | "liquidity">): OutcomeBook {
  const bids = normalizeLevels(book.bids, "desc");
  const asks = normalizeLevels(book.asks, "asc");
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread = bestBid != null && bestAsk != null ? Math.max(0, bestAsk - bestBid) : null;
  const mid = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
  const liquidity = [...bids, ...asks].reduce((acc, level) => acc + level.price * level.size, 0);
  return { ...book, bids, asks, bestBid, bestAsk, spread, mid, liquidity };
}

export function bookFromClob(payload: ClobBookPayload): OutcomeBook {
  return enrichBook({
    tokenId: payload.asset_id,
    bids: payload.bids.map(parseLevel),
    asks: payload.asks.map(parseLevel),
    lastTrade: payload.last_trade_price
      ? { price: Number(payload.last_trade_price), size: 0, ts: Number(payload.timestamp ?? Date.now()), side: "BUY" }
      : undefined,
    updatedAt: Number(payload.timestamp ?? Date.now()),
    hash: payload.hash,
    tickSize: optionalNumber(payload.tick_size),
    minOrderSize: optionalNumber(payload.min_order_size),
  });
}

export function applyPriceChange(book: OutcomeBook, change: PriceChange, ts: number): OutcomeBook {
  const price = Number(change.price);
  const size = Number(change.size);
  if (!Number.isFinite(price) || !Number.isFinite(size)) return book;
  const target = change.side === "BUY" ? "bids" : "asks";
  const nextLevels = upsertLevel(book[target], price, size);
  return enrichBook({
    ...book,
    [target]: nextLevels,
    updatedAt: ts,
    hash: change.hash ?? book.hash,
  });
}

export function midpoint(book: OutcomeBook): number | null {
  return book.mid;
}

export function spread(book: OutcomeBook): number | null {
  return book.spread;
}

export function displayPrice(book: OutcomeBook): number | null {
  return book.mid ?? book.lastTrade?.price ?? book.bestAsk ?? book.bestBid ?? null;
}

function parseLevel(level: { price: string; size: string }): BookLevel {
  return { price: Number(level.price), size: Number(level.size) };
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function upsertLevel(levels: BookLevel[], price: number, size: number): BookLevel[] {
  const without = levels.filter((level) => Math.abs(level.price - price) > 1e-9);
  if (size > 0) without.push({ price, size });
  return without;
}
