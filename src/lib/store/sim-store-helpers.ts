/**
 * Pure helper functions, types and constants for the sim-store.
 * No side effects, no React, no store — only logic and types.
 */

import { estimateExecution, matchAgainstBook } from "../sim/matching";
import { applyFillsToPortfolio, totalReserved } from "../sim/portfolio";
import { displayPrice } from "../sim/orderbook";
import type {
  EquityPoint,
  Fill,
  Market,
  MarketBook,
  Order,
  OrderStatus,
  Outcome,
  OutcomeBook,
  Portfolio,
  Side,
} from "../sim/types";

// ── Constants ──────────────────────────────────────────────

export const STARTING_CASH = 10_000;
export const DISCOVERY_INTERVAL_MS = 30_000;
export const BOOK_SNAPSHOT_INTERVAL_MS = 10_000;
export const EQUITY_INTERVAL_MS = 5_000;

// ── Types ──────────────────────────────────────────────────

export interface PlaceResult {
  ok: boolean;
  message?: string;
  orderId?: string;
}

export interface SimState {
  initialized: boolean;
  loadingMarkets: boolean;
  marketError: string | null;
  clobStatus: "idle" | "connecting" | "live" | "degraded";
  markets: Record<string, Market>;
  books: Record<string, MarketBook>;
  portfolio: Portfolio;
  lastTick: number;
  lastDiscoveryAt: number;
  lastBookSnapshotAt: number;
  lastEquityAt: number;

  init: () => void;
  refreshMarkets: () => Promise<void>;
  checkResolvedMarkets: () => Promise<void>;
  hydrateBooks: (marketIds?: string[]) => Promise<void>;
  applyClobBook: (payload: import("../sim/orderbook").ClobBookPayload) => void;
  applyClobPriceChanges: (changes: Array<{ asset_id: string; price: string; size: string; side: Side; hash?: string }>, ts: number) => void;
  applyLastTrade: (input: { tokenId: string; price: number; size: number; side: Side; ts: number; feeRateBps?: number }) => void;
  applyBestBidAsk: (tokenId: string, bestBid: number | null, bestAsk: number | null, ts: number) => void;
  applyTickSizeChange: (tokenId: string, newTickSize: number, ts: number) => void;
  markMarketResolved: (conditionId: string, winningTokenId?: string, winningOutcome?: string) => void;
  setClobStatus: (status: SimState["clobStatus"]) => void;
  tick: () => void;
  placeOrder: (input: {
    marketId: string;
    outcome: Outcome;
    side: Side;
    type: import("../sim/types").PolymarketOrderType;
    limitCents?: number;
    sizeShares: number;
    postOnly?: boolean;
    expiresAt?: number;
  }) => PlaceResult;
  cancelOrder: (orderId: string) => void;
  cancelAll: () => void;
  redeem: (marketId: string, outcome: Outcome) => void;
  resetPortfolio: () => void;
  exportFillsCsv: () => string;
}

export type SimStoreApi = {
  getState: () => SimState;
  setState: (partial: Partial<SimState> | ((state: SimState) => Partial<SimState>)) => void;
  subscribe: (listener: () => void) => () => void;
};

export type SimStoreHook = {
  <T>(selector: (state: SimState) => T): T;
  getState: () => SimState;
};

// ── Portfolio factory ──────────────────────────────────────

export function emptyPortfolio(): Portfolio {
  return {
    cash: STARTING_CASH,
    reserved: 0,
    positions: [],
    orders: [],
    fills: [],
    equity: [],
    sessions: [{ id: `sess_${Date.now().toString(36)}`, startedAt: Date.now(), label: "Session locale" }],
  };
}

// ── Persistence gate ───────────────────────────────────────

export function shouldPersistStateChange(partial: Partial<SimState>): boolean {
  return "markets" in partial || "portfolio" in partial;
}

// ── Market lookup helpers ──────────────────────────────────

export function findMarketByToken(markets: Record<string, Market>, tokenId: string): Market | undefined {
  return Object.values(markets).find((market) => market.clobTokenIds.UP === tokenId || market.clobTokenIds.DOWN === tokenId);
}

export function outcomeByToken(market: Market, tokenId: string): Outcome | null {
  if (market.clobTokenIds.UP === tokenId) return "UP";
  if (market.clobTokenIds.DOWN === tokenId) return "DOWN";
  return null;
}

export function getShadowOutcomeBook(book: MarketBook, outcome: Outcome): OutcomeBook {
  if (outcome === "UP") {
    return book.shadowUP ?? book.UP;
  } else {
    return book.shadowDOWN ?? book.DOWN;
  }
}

// ── Order validation ───────────────────────────────────────

export function validateOrder(order: Order, book: OutcomeBook, portfolio: Portfolio, feeRateBps: number): PlaceResult {
  if (order.postOnly && (order.type === "GTC" || order.type === "GTD")) {
    if (order.side === "BUY" && book.bestAsk != null && order.limitPrice != null && order.limitPrice >= book.bestAsk) {
      return { ok: false, message: "Post-only would cross best ask" };
    }
    if (order.side === "SELL" && book.bestBid != null && order.limitPrice != null && order.limitPrice <= book.bestBid) {
      return { ok: false, message: "Post-only would cross best bid" };
    }
  }
  if (order.side === "SELL") {
    const position = portfolio.positions.find((item) => item.tokenId === order.tokenId);
    if (!position || position.size < order.size - 1e-9) return { ok: false, message: "Insufficient shares" };
  }
  if (order.side === "BUY") {
    const estimate = estimateExecution({
      side: order.side,
      size: order.size,
      book,
      limitPrice: order.limitPrice,
      feeRateBps,
    });
    const worstCase = (order.type === "GTC" || order.type === "GTD") && !shouldExecuteImmediately(order, book)
      ? order.size * (order.limitPrice ?? 0)
      : estimate.cost + estimate.fee;
    if (worstCase > portfolio.cash - portfolio.reserved + 1e-9) return { ok: false, message: "Insufficient cash" };
    if (order.type === "FOK" && estimate.fillable < order.size - 1e-9) return { ok: false, message: "FOK cannot fill fully" };
  }
  return { ok: true };
}

export function shouldExecuteImmediately(order: Order, book: OutcomeBook): boolean {
  if (order.type === "FOK" || order.type === "FAK") return true;
  if (order.postOnly) return false;
  if (order.limitPrice == null) return false;
  if (order.side === "BUY") return book.bestAsk != null && order.limitPrice >= book.bestAsk;
  return book.bestBid != null && order.limitPrice <= book.bestBid;
}

export function statusAfterFill(order: Order, remaining: number): OrderStatus {
  if (remaining <= 1e-9) return "FILLED";
  if (order.type === "FAK") {
    if (order.filled > 0) {
      order.cancelledRemainder = remaining;
      return "FILLED";
    }
    return "REJECTED";
  }
  return order.filled > 0 ? "PARTIALLY_FILLED" : "OPEN";
}

// ── Resting order matching ─────────────────────────────────

export function matchRestingOrders(opts: {
  markets: Record<string, Market>;
  books: Record<string, MarketBook>;
  portfolio: Portfolio;
  now: number;
}): { books: Record<string, MarketBook>; portfolio: Portfolio; changed: boolean } {
  let books = { ...opts.books };
  let portfolio = { ...opts.portfolio, orders: opts.portfolio.orders.map((order) => ({ ...order })) };
  const fills: Fill[] = [];
  let changed = false;
  for (const order of portfolio.orders) {
    if (!isOpenStatus(order.status) || (order.type !== "GTC" && order.type !== "GTD")) continue;
    const market = opts.markets[order.marketId];
    const book = books[order.marketId];
    if (!market || !book) continue;
    const shadowBook = getShadowOutcomeBook(book, order.outcome);
    if (!shouldExecuteImmediately(order, shadowBook)) continue;
    const res = matchAgainstBook({ order, book: shadowBook, feeRateBps: market.feeRateBps, ts: opts.now });
    if (res.fills.length === 0) continue;
    order.filled = order.size - res.remaining;
    order.avgFillPrice = order.filled > 0 ? res.totalCost / order.filled : order.avgFillPrice;
    order.feesPaid += res.totalFee;
    order.grossProceeds += res.totalCost;
    order.status = statusAfterFill(order, res.remaining);
    order.updatedAt = opts.now;
    books[order.marketId] = {
      ...book,
      shadowUP: order.outcome === "UP" ? res.newBook : (book.shadowUP ?? book.UP),
      shadowDOWN: order.outcome === "DOWN" ? res.newBook : (book.shadowDOWN ?? book.DOWN),
      updatedAt: opts.now,
    } as MarketBook;
    fills.push(...res.fills);
    changed = true;
  }
  if (fills.length > 0) portfolio = applyFillsToPortfolio(portfolio, fills);
  return { books, portfolio, changed };
}

// ── Equity snapshot ────────────────────────────────────────

export function equityPoint(portfolio: Portfolio, markets: Record<string, Market>, books: Record<string, MarketBook>, ts: number): EquityPoint {
  let markValue = 0;
  for (const position of portfolio.positions) {
    if (position.size <= 0) continue;
    const market = markets[position.marketId];
    const price = books[position.marketId]?.[position.outcome].mid ?? market?.outcomePrices[position.outcome] ?? position.avgPrice;
    markValue += position.size * price;
  }
  const equity = portfolio.cash + markValue;
  const netPnl = equity - STARTING_CASH;
  const fees = portfolio.fills.reduce((acc, fill) => acc + fill.fee, 0);
  return { ts, equity, cash: portfolio.cash, grossPnl: netPnl + fees, netPnl };
}

// ── Small utilities ────────────────────────────────────────

export function isOpenStatus(status: OrderStatus): boolean {
  return status === "OPEN" || status === "PARTIALLY_FILLED";
}

let orderCounter = 0;
export function nextOrderId(): string {
  orderCounter += 1;
  return `ord_${Date.now().toString(36)}_${orderCounter}`;
}

export function clampPrice(price: number): number {
  return Math.max(0.001, Math.min(0.999, price));
}

export function csvCell(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

// ── Display selectors ──────────────────────────────────────

export function selectDisplayPrice(book: MarketBook | undefined, outcome: Outcome): number | null {
  return book ? displayPrice(book[outcome]) : null;
}

export function selectMidpoint(book: MarketBook | undefined, outcome: Outcome): number | null {
  return book?.[outcome].mid ?? null;
}
