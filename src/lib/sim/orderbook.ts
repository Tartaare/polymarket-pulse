import type { MarketBook, OutcomeBook, BookLevel, Outcome } from "./types";
import { clampCents } from "./pricing";

// Build a synthetic order book around a fair probability (0..1).
// Returns book with bids desc, asks asc, in cent prices (1..99).
export function buildBook(fairUpProb: number, depth = 6, baseLiquidity = 800): MarketBook["UP"] & { dummy?: never } {
  // unused in this signature; we expose buildOutcomeBook below
  return buildOutcomeBook(fairUpProb, depth, baseLiquidity);
}

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function buildOutcomeBook(prob: number, depth = 6, baseLiquidity = 800, seed = 1): OutcomeBook {
  const r = rand(seed);
  const mid = clampCents(prob * 100);
  // spread 1-3 cents depending on edge proximity
  const spread = mid <= 5 || mid >= 95 ? 3 : mid <= 15 || mid >= 85 ? 2 : 1;
  const bestBid = clampCents(mid - Math.ceil(spread / 2));
  const bestAsk = clampCents(mid + Math.floor(spread / 2) + (spread === 1 ? 1 : 0));
  const bids: BookLevel[] = [];
  const asks: BookLevel[] = [];
  for (let i = 0; i < depth; i++) {
    const bp = clampCents(bestBid - i);
    const ap = clampCents(bestAsk + i);
    const decay = Math.exp(-i * 0.35);
    bids.push({ price: bp / 100, size: Math.round(baseLiquidity * decay * (0.7 + r() * 0.6)) });
    asks.push({ price: ap / 100, size: Math.round(baseLiquidity * decay * (0.7 + r() * 0.6)) });
    if (bp <= 1 || ap >= 99) break;
  }
  // dedupe + sort
  return {
    bids: collapse(bids, "desc"),
    asks: collapse(asks, "asc"),
  };
}

function collapse(levels: BookLevel[], dir: "asc" | "desc"): BookLevel[] {
  const map = new Map<number, number>();
  for (const l of levels) map.set(l.price, (map.get(l.price) ?? 0) + l.size);
  const arr = Array.from(map.entries()).map(([price, size]) => ({ price, size }));
  arr.sort((a, b) => (dir === "asc" ? a.price - b.price : b.price - a.price));
  return arr;
}

export function buildMarketBook(marketId: string, upProb: number, ts: number, seed = 1): MarketBook {
  return {
    marketId,
    UP: buildOutcomeBook(upProb, 6, 800, seed),
    DOWN: buildOutcomeBook(1 - upProb, 6, 800, seed + 7),
    updatedAt: ts,
  };
}

export function midpoint(b: OutcomeBook): number | null {
  const bid = b.bids[0]?.price;
  const ask = b.asks[0]?.price;
  if (bid == null || ask == null) return null;
  return (bid + ask) / 2;
}

export function spread(b: OutcomeBook): number | null {
  const bid = b.bids[0]?.price;
  const ask = b.asks[0]?.price;
  if (bid == null || ask == null) return null;
  return ask - bid;
}

export function displayPrice(b: OutcomeBook): number | null {
  const s = spread(b);
  const mid = midpoint(b);
  if (s == null || mid == null) return null;
  if (s > 0.10 && b.lastTrade) return b.lastTrade.price;
  return mid;
}

export function oppositeOutcome(o: Outcome): Outcome {
  return o === "UP" ? "DOWN" : "UP";
}
