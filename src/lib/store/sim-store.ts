import { useSyncExternalStore } from "react";
import { applyPriceChange, bookFromClob, createEmptyMarketBook, displayPrice, type ClobBookPayload } from "../sim/orderbook";
import { estimateExecution, matchAgainstBook } from "../sim/matching";
import { applyFillsToPortfolio, totalReserved } from "../sim/portfolio";
import { readPersistedAppState, saveBookSnapshots, writePersistedAppState } from "./indexed-db";
import { updateMarketStatus } from "../polymarket/normalize";
import type {
  EquityPoint,
  Fill,
  Market,
  MarketBook,
  Order,
  OrderStatus,
  OrderType,
  Outcome,
  OutcomeBook,
  Portfolio,
  Side,
  TimeInForce,
} from "../sim/types";

const STARTING_CASH = 10_000;
const DISCOVERY_INTERVAL_MS = 30_000;
const BOOK_SNAPSHOT_INTERVAL_MS = 10_000;
const EQUITY_INTERVAL_MS = 5_000;

interface PlaceResult {
  ok: boolean;
  message?: string;
  orderId?: string;
}

interface SimState {
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
  hydrateBooks: (marketIds?: string[]) => Promise<void>;
  applyClobBook: (payload: ClobBookPayload) => void;
  applyClobPriceChanges: (changes: Array<{ asset_id: string; price: string; size: string; side: Side; hash?: string }>, ts: number) => void;
  applyLastTrade: (input: { tokenId: string; price: number; size: number; side: Side; ts: number; feeRateBps?: number }) => void;
  markMarketResolved: (conditionId: string, winningTokenId?: string, winningOutcome?: string) => void;
  setClobStatus: (status: SimState["clobStatus"]) => void;
  tick: () => void;
  placeOrder: (input: {
    marketId: string;
    outcome: Outcome;
    side: Side;
    type: OrderType;
    timeInForce?: TimeInForce;
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

type SimStoreApi = {
  getState: () => SimState;
  setState: (partial: Partial<SimState> | ((state: SimState) => Partial<SimState>)) => void;
  subscribe: (listener: () => void) => () => void;
};

type SimStoreHook = {
  <T>(selector: (state: SimState) => T): T;
  getState: () => SimState;
};

let orderCounter = 0;

function emptyPortfolio(): Portfolio {
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

function createSimStore(initializer: (set: SimStoreApi["setState"], get: SimStoreApi["getState"]) => SimState): SimStoreHook {
  const listeners = new Set<() => void>();
  let state: SimState;
  let hydrated = false;
  let persistTimer: number | undefined;

  const persist = (): void => {
    if (typeof window === "undefined") return;
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      void writePersistedAppState({
        markets: state.markets,
        books: state.books,
        portfolio: state.portfolio,
        lastTick: state.lastTick,
      });
    }, 100);
  };

  const api: SimStoreApi = {
    getState: () => state,
    setState: (partial) => {
      const nextPartial = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...nextPartial };
      if (state.initialized) persist();
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      if (!hydrated) {
        hydrated = true;
        void readPersistedAppState().then((persisted) => {
          if (!persisted || Object.keys(persisted).length === 0) return;
          state = {
            ...state,
            ...persisted,
            portfolio: { ...emptyPortfolio(), ...persisted.portfolio },
            initialized: true,
          };
          listeners.forEach((item) => item());
        });
      }
      return () => listeners.delete(listener);
    },
  };

  state = initializer(api.setState, api.getState);

  const useStore = <T>(selector: (storeState: SimState) => T): T =>
    useSyncExternalStore(
      api.subscribe,
      () => selector(api.getState()),
      () => selector(api.getState()),
    );
  useStore.getState = api.getState;
  return useStore;
}

export const useSimStore = createSimStore((set, get) => ({
  initialized: false,
  loadingMarkets: false,
  marketError: null,
  clobStatus: "idle",
  markets: {},
  books: {},
  portfolio: emptyPortfolio(),
  lastTick: 0,
  lastDiscoveryAt: 0,
  lastBookSnapshotAt: 0,
  lastEquityAt: 0,

  init: () => {
    if (get().initialized) return;
    set({ initialized: true });
    void get().refreshMarkets();
  },

  refreshMarkets: async () => {
    const state = get();
    if (state.loadingMarkets) return;
    set({ loadingMarkets: true, marketError: null });
    try {
      const response = await fetch("/api/polymarket/markets");
      if (!response.ok) throw new Error(`markets ${response.status}`);
      const data = (await response.json()) as { markets: Market[] };
      const nextMarkets = { ...state.markets };
      const nextBooks = { ...state.books };
      for (const market of data.markets) {
        nextMarkets[market.id] = { ...nextMarkets[market.id], ...market };
        if (!nextBooks[market.id]) {
          nextBooks[market.id] = createEmptyMarketBook(
            market.id,
            market.conditionId,
            market.clobTokenIds.UP,
            market.clobTokenIds.DOWN,
          );
        }
      }
      set({ markets: nextMarkets, books: nextBooks, loadingMarkets: false, lastDiscoveryAt: Date.now() });
      void get().hydrateBooks(data.markets.map((market) => market.id));
    } catch (error) {
      set({ loadingMarkets: false, marketError: (error as Error).message });
    }
  },

  hydrateBooks: async (marketIds) => {
    const state = get();
    const targetMarkets = (marketIds ?? Object.keys(state.markets))
      .map((id) => state.markets[id])
      .filter((market): market is Market => Boolean(market) && market.state !== "RESOLVED");
    const tokenIds = targetMarkets.flatMap((market) => [market.clobTokenIds.UP, market.clobTokenIds.DOWN]);
    if (tokenIds.length === 0) return;
    const response = await fetch(`/api/polymarket/books?tokenIds=${encodeURIComponent(tokenIds.join(","))}`);
    if (!response.ok) return;
    const data = (await response.json()) as { books: ClobBookPayload[] };
    for (const payload of data.books) get().applyClobBook(payload);

    const feeResponse = await fetch(`/api/polymarket/fees?tokenIds=${encodeURIComponent(tokenIds.join(","))}`);
    if (!feeResponse.ok) return;
    const feeData = (await feeResponse.json()) as { fees: Record<string, number | null> };
    const markets = { ...get().markets };
    for (const market of Object.values(markets)) {
      const fees = [feeData.fees[market.clobTokenIds.UP], feeData.fees[market.clobTokenIds.DOWN]].filter(
        (fee): fee is number => typeof fee === "number",
      );
      if (fees.length > 0) markets[market.id] = { ...market, feeRateBps: Math.max(...fees) };
    }
    set({ markets });
  },

  applyClobBook: (payload) => {
    const state = get();
    const market = findMarketByToken(state.markets, payload.asset_id);
    if (!market) return;
    const outcome = outcomeByToken(market, payload.asset_id);
    if (!outcome) return;
    const prev = state.books[market.id] ?? createEmptyMarketBook(market.id, market.conditionId, market.clobTokenIds.UP, market.clobTokenIds.DOWN);
    const books = {
      ...state.books,
      [market.id]: {
        ...prev,
        [outcome]: bookFromClob(payload),
        updatedAt: Number(payload.timestamp ?? Date.now()),
      } as MarketBook,
    };
    set({ books });
  },

  applyClobPriceChanges: (changes, ts) => {
    let books = { ...get().books };
    for (const change of changes) {
      const market = findMarketByToken(get().markets, change.asset_id);
      if (!market) continue;
      const outcome = outcomeByToken(market, change.asset_id);
      if (!outcome) continue;
      const book = books[market.id];
      if (!book) continue;
      books = {
        ...books,
        [market.id]: {
          ...book,
          [outcome]: applyPriceChange(book[outcome], change, ts),
          updatedAt: ts,
        } as MarketBook,
      };
    }
    set({ books });
  },

  applyLastTrade: (input) => {
    const state = get();
    const market = findMarketByToken(state.markets, input.tokenId);
    if (!market) return;
    const outcome = outcomeByToken(market, input.tokenId);
    if (!outcome) return;
    const book = state.books[market.id];
    if (!book) return;
    set({
      books: {
        ...state.books,
        [market.id]: {
          ...book,
          [outcome]: { ...book[outcome], lastTrade: input, updatedAt: input.ts },
          updatedAt: input.ts,
        } as MarketBook,
      },
    });
  },

  markMarketResolved: (conditionId, winningTokenId, winningOutcome) => {
    const state = get();
    const markets = { ...state.markets };
    const portfolio = { ...state.portfolio };
    const market = Object.values(markets).find((item) => item.conditionId === conditionId || item.id === conditionId);
    if (!market) return;
    const resolvedOutcome =
      winningTokenId && winningTokenId === market.clobTokenIds.UP ? "UP" :
      winningTokenId && winningTokenId === market.clobTokenIds.DOWN ? "DOWN" :
      winningOutcome?.toLowerCase().includes("up") || winningOutcome?.toLowerCase().includes("yes") ? "UP" : "DOWN";
    markets[market.id] = { ...market, state: "RESOLVED", status: "resolved", closed: true, resolvedOutcome };
    portfolio.positions = portfolio.positions.map((position) =>
      position.marketId === market.id ? { ...position, redeemable: true } : position,
    );
    portfolio.orders = portfolio.orders.map((order) =>
      order.marketId === market.id && isOpenStatus(order.status)
        ? { ...order, status: "CANCELLED" as const, updatedAt: Date.now() }
        : order,
    );
    portfolio.reserved = totalReserved(portfolio.orders);
    set({ markets, portfolio });
  },

  setClobStatus: (clobStatus) => set({ clobStatus }),

  tick: () => {
    const now = Date.now();
    const state = get();
    let markets = { ...state.markets };
    let portfolio = { ...state.portfolio };
    let changed = false;

    if (now - state.lastDiscoveryAt > DISCOVERY_INTERVAL_MS) void get().refreshMarkets();

    for (const market of Object.values(markets)) {
      const next = updateMarketStatus(market, now);
      if (next.state !== market.state) {
        markets[market.id] = next;
        changed = true;
      }
    }

    portfolio.orders = portfolio.orders.map((order) => {
      if (!isOpenStatus(order.status)) return order;
      if (order.timeInForce === "GTD" && order.expiresAt && now >= order.expiresAt) {
        changed = true;
        return { ...order, status: "EXPIRED" as const, updatedAt: now };
      }
      return order;
    });

    const match = matchRestingOrders({ markets, books: state.books, portfolio, now });
    if (match.changed) {
      portfolio = match.portfolio;
      changed = true;
    }

    portfolio.reserved = totalReserved(portfolio.orders);
    if (now - state.lastEquityAt > EQUITY_INTERVAL_MS) {
      portfolio.equity = [...portfolio.equity.slice(-300), equityPoint(portfolio, markets, match.books, now)];
      changed = true;
    }

    if (now - state.lastBookSnapshotAt > BOOK_SNAPSHOT_INTERVAL_MS) {
      void saveBookSnapshots(state.books);
    }

    set({
      markets: changed ? markets : state.markets,
      books: match.books,
      portfolio,
      lastTick: now,
      lastBookSnapshotAt: now - state.lastBookSnapshotAt > BOOK_SNAPSHOT_INTERVAL_MS ? now : state.lastBookSnapshotAt,
      lastEquityAt: now - state.lastEquityAt > EQUITY_INTERVAL_MS ? now : state.lastEquityAt,
    });
  },

  placeOrder: (input) => {
    const state = get();
    const market = state.markets[input.marketId];
    if (!market || (market.state !== "LIVE" && market.state !== "CLOSING")) return { ok: false, message: "Market not live" };
    const book = state.books[input.marketId];
    if (!book) return { ok: false, message: "No CLOB book" };
    if (input.sizeShares < market.orderMinSize) return { ok: false, message: `Min size: ${market.orderMinSize}` };

    const tokenId = market.clobTokenIds[input.outcome];
    const outcomeBook = book[input.outcome];
    const now = Date.now();
    const limitPrice = input.type === "MARKET" ? undefined : clampPrice((input.limitCents ?? 50) / 100);
    const order: Order = {
      id: nextOrderId(),
      marketId: market.id,
      tokenId,
      outcome: input.outcome,
      side: input.side,
      type: input.type,
      timeInForce: input.timeInForce ?? "GTC",
      limitPrice,
      expiresAt: input.expiresAt,
      size: input.sizeShares,
      filled: 0,
      avgFillPrice: 0,
      postOnly: Boolean(input.postOnly),
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
      feesPaid: 0,
      grossProceeds: 0,
    };

    const validation = validateOrder(order, outcomeBook, state.portfolio, market.feeRateBps);
    if (!validation.ok) return validation;

    let portfolio = { ...state.portfolio, orders: [...state.portfolio.orders, order] };
    let books = { ...state.books };
    if (shouldExecuteImmediately(order, outcomeBook)) {
      const res = matchAgainstBook({ order, book: outcomeBook, feeRateBps: market.feeRateBps, ts: now });
      if (order.type === "FOK" && res.remaining > 1e-9) return { ok: false, message: "FOK cannot fill fully" };
      order.filled = order.size - res.remaining;
      order.avgFillPrice = res.avgPrice;
      order.feesPaid = res.totalFee;
      order.grossProceeds = res.totalCost;
      order.status = statusAfterFill(order, res.remaining);
      order.updatedAt = now;
      books[market.id] = { ...book, [input.outcome]: res.newBook, updatedAt: now } as MarketBook;
      portfolio = applyFillsToPortfolio(portfolio, res.fills);
    } else if (order.type === "FOK" || order.type === "FAK") {
      order.status = "REJECTED";
      order.rejectionReason = "No immediate liquidity at limit";
    }
    portfolio.orders = portfolio.orders.map((existing) => (existing.id === order.id ? order : existing));
    portfolio.reserved = totalReserved(portfolio.orders);
    set({ books, portfolio });
    return { ok: order.status !== "REJECTED", orderId: order.id, message: order.rejectionReason };
  },

  cancelOrder: (orderId) => {
    const state = get();
    const orders = state.portfolio.orders.map((order) =>
      order.id === orderId && isOpenStatus(order.status) ? { ...order, status: "CANCELLED" as const, updatedAt: Date.now() } : order,
    );
    set({ portfolio: { ...state.portfolio, orders, reserved: totalReserved(orders) } });
  },

  cancelAll: () => {
    const state = get();
    const orders = state.portfolio.orders.map((order) =>
      isOpenStatus(order.status) ? { ...order, status: "CANCELLED" as const, updatedAt: Date.now() } : order,
    );
    set({ portfolio: { ...state.portfolio, orders, reserved: totalReserved(orders) } });
  },

  redeem: (marketId, outcome) => {
    const state = get();
    const market = state.markets[marketId];
    if (!market || market.state !== "RESOLVED") return;
    const positions = state.portfolio.positions.map((position) => ({ ...position }));
    let cash = state.portfolio.cash;
    for (const position of positions) {
      if (position.marketId !== marketId || position.outcome !== outcome || !position.redeemable || position.redeemed) continue;
      const payout = market.resolvedOutcome === outcome ? position.size : 0;
      cash += payout;
      position.realizedPnl += payout - position.size * position.avgPrice;
      position.size = 0;
      position.redeemed = true;
      position.redeemable = false;
    }
    set({ portfolio: { ...state.portfolio, cash, positions } });
  },

  resetPortfolio: () => set({ portfolio: emptyPortfolio() }),

  exportFillsCsv: () => {
    const rows = [["time", "marketId", "tokenId", "outcome", "side", "price", "size", "fee", "feeRateBps"]];
    for (const fill of get().portfolio.fills) {
      rows.push([
        new Date(fill.ts).toISOString(),
        fill.marketId,
        fill.tokenId,
        fill.outcome,
        fill.side,
        String(fill.price),
        String(fill.size),
        String(fill.fee),
        String(fill.feeRateBps),
      ]);
    }
    return rows.map((row) => row.map(csvCell).join(",")).join("\n");
  },
}));

export function selectDisplayPrice(book: MarketBook | undefined, outcome: Outcome): number | null {
  return book ? displayPrice(book[outcome]) : null;
}

export function selectMidpoint(book: MarketBook | undefined, outcome: Outcome): number | null {
  return book?.[outcome].mid ?? null;
}

function findMarketByToken(markets: Record<string, Market>, tokenId: string): Market | undefined {
  return Object.values(markets).find((market) => market.clobTokenIds.UP === tokenId || market.clobTokenIds.DOWN === tokenId);
}

function outcomeByToken(market: Market, tokenId: string): Outcome | null {
  if (market.clobTokenIds.UP === tokenId) return "UP";
  if (market.clobTokenIds.DOWN === tokenId) return "DOWN";
  return null;
}

function validateOrder(order: Order, book: OutcomeBook, portfolio: Portfolio, feeRateBps: number): PlaceResult {
  if (order.postOnly && order.type === "LIMIT") {
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
    const worstCase = order.type === "LIMIT" && !shouldExecuteImmediately(order, book)
      ? order.size * (order.limitPrice ?? 0)
      : estimate.cost + estimate.fee;
    if (worstCase > portfolio.cash - portfolio.reserved + 1e-9) return { ok: false, message: "Insufficient cash" };
    if (order.type === "FOK" && estimate.fillable < order.size - 1e-9) return { ok: false, message: "FOK cannot fill fully" };
  }
  return { ok: true };
}

function shouldExecuteImmediately(order: Order, book: OutcomeBook): boolean {
  if (order.type === "MARKET" || order.type === "FOK" || order.type === "FAK") return true;
  if (order.postOnly) return false;
  if (order.limitPrice == null) return false;
  if (order.side === "BUY") return book.bestAsk != null && order.limitPrice >= book.bestAsk;
  return book.bestBid != null && order.limitPrice <= book.bestBid;
}

function statusAfterFill(order: Order, remaining: number): OrderStatus {
  if (remaining <= 1e-9) return "FILLED";
  if (order.type === "MARKET" || order.type === "FAK") return order.filled > 0 ? "PARTIALLY_FILLED" : "REJECTED";
  return order.filled > 0 ? "PARTIALLY_FILLED" : "OPEN";
}

function matchRestingOrders(opts: {
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
    if (!isOpenStatus(order.status) || order.type !== "LIMIT") continue;
    const market = opts.markets[order.marketId];
    const book = books[order.marketId];
    if (!market || !book || !shouldExecuteImmediately(order, book[order.outcome])) continue;
    const res = matchAgainstBook({ order, book: book[order.outcome], feeRateBps: market.feeRateBps, ts: opts.now });
    if (res.fills.length === 0) continue;
    order.filled = order.size - res.remaining;
    order.avgFillPrice = order.filled > 0 ? res.totalCost / order.filled : order.avgFillPrice;
    order.feesPaid += res.totalFee;
    order.grossProceeds += res.totalCost;
    order.status = statusAfterFill(order, res.remaining);
    order.updatedAt = opts.now;
    books[order.marketId] = { ...book, [order.outcome]: res.newBook, updatedAt: opts.now } as MarketBook;
    fills.push(...res.fills);
    changed = true;
  }
  if (fills.length > 0) portfolio = applyFillsToPortfolio(portfolio, fills);
  return { books, portfolio, changed };
}

function equityPoint(portfolio: Portfolio, markets: Record<string, Market>, books: Record<string, MarketBook>, ts: number): EquityPoint {
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

function isOpenStatus(status: OrderStatus): boolean {
  return status === "OPEN" || status === "PARTIALLY_FILLED";
}

function nextOrderId(): string {
  orderCounter += 1;
  return `ord_${Date.now().toString(36)}_${orderCounter}`;
}

function clampPrice(price: number): number {
  return Math.max(0.001, Math.min(0.999, price));
}

function csvCell(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}
