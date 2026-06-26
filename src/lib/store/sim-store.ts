import { useSyncExternalStore } from "react";
import { applyPriceChange, bookFromClob, createEmptyMarketBook, type ClobBookPayload } from "../sim/orderbook";
import { matchAgainstBook } from "../sim/matching";
import { applyFillsToPortfolio, totalReserved } from "../sim/portfolio";
import { updateMarketStatus } from "../polymarket/normalize";
import type { Market, MarketBook, Order, Outcome } from "../sim/types";

import { fetchAppState, saveAppState, saveBookSnapshots, performIndexedDbMigration } from "./sim-store-persistence";
import {
  STARTING_CASH,
  DISCOVERY_INTERVAL_MS,
  BOOK_SNAPSHOT_INTERVAL_MS,
  EQUITY_INTERVAL_MS,
  type SimState,
  type SimStoreApi,
  type SimStoreHook,
  emptyPortfolio,
  shouldPersistStateChange,
  findMarketByToken,
  outcomeByToken,
  getShadowOutcomeBook,
  validateOrder,
  shouldExecuteImmediately,
  statusAfterFill,
  matchRestingOrders,
  equityPoint,
  isOpenStatus,
  nextOrderId,
  clampPrice,
  csvCell,
} from "./sim-store-helpers";

// Re-export public selectors and types for consumers
export { selectDisplayPrice, selectMidpoint } from "./sim-store-helpers";
export type { SimState, PlaceResult } from "./sim-store-helpers";

// ── Store framework ────────────────────────────────────────

function createSimStore(initializer: (set: SimStoreApi["setState"], get: SimStoreApi["getState"]) => SimState): SimStoreHook {
  const listeners = new Set<() => void>();
  let state: SimState;
  let hydrated = false;
  let persistTimer: number | undefined;

  const persist = (): void => {
    if (typeof window === "undefined") return;
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      void saveAppState({
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
      if (state.initialized && shouldPersistStateChange(nextPartial)) persist();
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      if (!hydrated) {
        hydrated = true;
        void (async () => {
          let persisted = await fetchAppState() as Record<string, unknown> | null;
          if (!persisted || Object.keys(persisted).length === 0) {
            persisted = await performIndexedDbMigration() as Record<string, unknown> | null;
          }
          if (!persisted || Object.keys(persisted).length === 0) return;
          state = {
            ...state,
            ...persisted,
            portfolio: { ...emptyPortfolio(), ...(persisted.portfolio as Record<string, unknown>) },
            initialized: true,
          };
          listeners.forEach((item) => item());
        })();
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

// ── Store instance ─────────────────────────────────────────

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
      const nextMarkets: Record<string, Market> = {};
      const nextBooks: Record<string, MarketBook> = {};
      
      for (const market of data.markets) {
        nextMarkets[market.id] = { ...state.markets[market.id], ...market };
        nextBooks[market.id] = state.books[market.id] ?? createEmptyMarketBook(
          market.id,
          market.conditionId,
          market.clobTokenIds.UP,
          market.clobTokenIds.DOWN,
        );
      }
      
      // Preserve old markets with active positions, open orders, or pending resolution
      const activeMarketIds = new Set(data.markets.map((m) => m.id));
      for (const [id, oldMarket] of Object.entries(state.markets)) {
        if (activeMarketIds.has(id)) continue;
        
        const hasPosition = state.portfolio.positions.some((p) => p.marketId === id && (p.size > 0 || p.redeemable));
        const hasOrder = state.portfolio.orders.some((o) => o.marketId === id && isOpenStatus(o.status));
        const isEndedPending = oldMarket.state === "ENDED" || oldMarket.state === "AWAITING_RESOLUTION";
        
        if (hasPosition || hasOrder || isEndedPending) {
          nextMarkets[id] = oldMarket;
          if (state.books[id]) {
            nextBooks[id] = state.books[id];
          }
        }
      }
      
      set({ markets: nextMarkets, books: nextBooks, loadingMarkets: false, lastDiscoveryAt: Date.now() });
      void get().hydrateBooks(data.markets.map((market) => market.id));
    } catch (error) {
      set({ loadingMarkets: false, marketError: (error as Error).message });
    }
  },

  checkResolvedMarkets: async () => {
    const state = get();
    const endedMarkets = Object.values(state.markets).filter((m) => m.state === "ENDED");
    if (endedMarkets.length === 0) return;
    
    const conditionIds = endedMarkets.map((m) => m.conditionId);
    try {
      const res = await fetch(`/api/polymarket/resolved?conditionIds=${encodeURIComponent(conditionIds.join(","))}`);
      if (!res.ok) return;
      const data = await res.json();
      const resolvedMap = data.resolved || {};
      
      for (const conditionId of Object.keys(resolvedMap)) {
        const info = resolvedMap[conditionId];
        if (info.resolved && info.winningOutcome) {
          get().markMarketResolved(conditionId, undefined, info.winningOutcome);
        }
      }
    } catch (error) {
      console.error("Error checking resolved markets:", error);
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
        shadowUP: outcome === "UP" ? undefined : prev.shadowUP,
        shadowDOWN: outcome === "DOWN" ? undefined : prev.shadowDOWN,
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
          shadowUP: outcome === "UP" ? undefined : book.shadowUP,
          shadowDOWN: outcome === "DOWN" ? undefined : book.shadowDOWN,
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
          shadowUP: outcome === "UP" ? undefined : book.shadowUP,
          shadowDOWN: outcome === "DOWN" ? undefined : book.shadowDOWN,
          updatedAt: input.ts,
        } as MarketBook,
      },
    });
  },

  applyBestBidAsk: (tokenId, bestBid, bestAsk, ts) => {
    const state = get();
    const market = findMarketByToken(state.markets, tokenId);
    if (!market) return;
    const outcome = outcomeByToken(market, tokenId);
    if (!outcome) return;
    const book = state.books[market.id];
    if (!book) return;
    set({
      books: {
        ...state.books,
        [market.id]: {
          ...book,
          [outcome]: {
            ...book[outcome],
            bestBid,
            bestAsk,
            spread: bestBid != null && bestAsk != null ? Math.round((bestAsk - bestBid) * 1e6) / 1e6 : null,
            mid: bestBid != null && bestAsk != null ? Math.round(((bestBid + bestAsk) / 2) * 1e6) / 1e6 : null,
            updatedAt: ts,
          },
          shadowUP: outcome === "UP" ? undefined : book.shadowUP,
          shadowDOWN: outcome === "DOWN" ? undefined : book.shadowDOWN,
          updatedAt: ts,
        } as MarketBook,
      },
    });
  },

  applyTickSizeChange: (tokenId, newTickSize, ts) => {
    const state = get();
    const market = findMarketByToken(state.markets, tokenId);
    if (!market) return;
    const outcome = outcomeByToken(market, tokenId);
    if (!outcome) return;
    
    const markets = {
      ...state.markets,
      [market.id]: {
        ...market,
        tickSize: newTickSize,
        updatedAt: ts,
      },
    };
    
    const book = state.books[market.id];
    if (!book) {
      set({ markets });
      return;
    }
    
    set({
      markets,
      books: {
        ...state.books,
        [market.id]: {
          ...book,
          [outcome]: {
            ...book[outcome],
            tickSize: newTickSize,
            updatedAt: ts,
          },
          shadowUP: outcome === "UP" ? undefined : book.shadowUP,
          shadowDOWN: outcome === "DOWN" ? undefined : book.shadowDOWN,
          updatedAt: ts,
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
    const resolvedOutcome: Outcome =
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
    portfolio.reserved = totalReserved(portfolio.orders, markets);
    set({ markets, portfolio });
  },

  setClobStatus: (clobStatus) => set({ clobStatus }),

  tick: () => {
    const now = Date.now();
    const state = get();
    let markets = { ...state.markets };
    let portfolio = { ...state.portfolio };
    let changed = false;

    if (now - state.lastDiscoveryAt > DISCOVERY_INTERVAL_MS) {
      void get().refreshMarkets();
      void get().checkResolvedMarkets();
    }

    for (const market of Object.values(markets)) {
      const next = updateMarketStatus(market, now);
      if (next.state !== market.state) {
        markets[market.id] = next;
        changed = true;
      }
    }

    portfolio.orders = portfolio.orders.map((order) => {
      if (!isOpenStatus(order.status)) return order;
      const market = markets[order.marketId];
      if (market && market.state === "ENDED") {
        changed = true;
        return { ...order, status: "CANCELLED" as const, updatedAt: now, rejectionReason: "Market ended" };
      }
      if (order.type === "GTD" && order.expiresAt && now >= order.expiresAt) {
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

    portfolio.reserved = totalReserved(portfolio.orders, markets);
    if (now - state.lastEquityAt > EQUITY_INTERVAL_MS) {
      portfolio.equity = [...portfolio.equity.slice(-300), equityPoint(portfolio, markets, match.books, now)];
      changed = true;
    }

    if (now - state.lastBookSnapshotAt > BOOK_SNAPSHOT_INTERVAL_MS) {
      void saveBookSnapshots(state.books);
    }

    set({
      markets: changed ? markets : state.markets,
      books: match.changed ? match.books : state.books,
      portfolio: changed ? portfolio : state.portfolio,
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
    const outcomeBook = getShadowOutcomeBook(book, input.outcome);
    const now = Date.now();
    
    let limitPrice = input.limitCents !== undefined ? clampPrice(input.limitCents / 100) : undefined;
    if (limitPrice === undefined && (input.type === "FAK" || input.type === "FOK")) {
      limitPrice = input.side === "BUY" ? 0.99 : 0.01;
    }

    if (limitPrice !== undefined) {
      const tickSize = market.tickSize;
      const remainder = Math.round((limitPrice * 1e6) % (tickSize * 1e6)) / 1e6;
      if (remainder > 1e-9) {
        return { ok: false, message: `Price must be a multiple of tick size ${tickSize}` };
      }
    }

    const order: Order = {
      id: nextOrderId(),
      marketId: market.id,
      tokenId,
      outcome: input.outcome,
      side: input.side,
      type: input.type,
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
      books[market.id] = {
        ...book,
        shadowUP: input.outcome === "UP" ? res.newBook : (book.shadowUP ?? book.UP),
        shadowDOWN: input.outcome === "DOWN" ? res.newBook : (book.shadowDOWN ?? book.DOWN),
        updatedAt: now,
      } as MarketBook;
      portfolio = applyFillsToPortfolio(portfolio, res.fills);
    } else if (order.type === "FOK" || order.type === "FAK") {
      order.status = "REJECTED";
      order.rejectionReason = "No immediate liquidity at limit";
    }
    portfolio.orders = portfolio.orders.map((existing) => (existing.id === order.id ? order : existing));
    portfolio.reserved = totalReserved(portfolio.orders, state.markets);
    set({ books, portfolio });
    return { ok: order.status !== "REJECTED", orderId: order.id, message: order.rejectionReason };
  },

  cancelOrder: (orderId) => {
    const state = get();
    const orders = state.portfolio.orders.map((order) =>
      order.id === orderId && isOpenStatus(order.status) ? { ...order, status: "CANCELLED" as const, updatedAt: Date.now() } : order,
    );
    set({ portfolio: { ...state.portfolio, orders, reserved: totalReserved(orders, state.markets) } });
  },

  cancelAll: () => {
    const state = get();
    const orders = state.portfolio.orders.map((order) =>
      isOpenStatus(order.status) ? { ...order, status: "CANCELLED" as const, updatedAt: Date.now() } : order,
    );
    set({ portfolio: { ...state.portfolio, orders, reserved: totalReserved(orders, state.markets) } });
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
