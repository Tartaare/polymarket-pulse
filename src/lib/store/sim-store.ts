import { useSyncExternalStore } from "react";
import type {
  Asset,
  Market,
  MarketBook,
  Order,
  Outcome,
  Portfolio,
  Side,
  OrderType,
  PricePoint,
} from "../sim/types";
import {
  buildMarket,
  currentWindowOpen,
  marketId,
  resolveOutcome,
  shouldResolve,
} from "../sim/resolution";
import { buildMarketBook, displayPrice, midpoint } from "../sim/orderbook";
import { fairUpProbability } from "../sim/pricing";
import { matchAgainstBook, calcFee, totalCostBuy } from "../sim/matching";
import { applyFillsToPortfolio, totalReserved } from "../sim/portfolio";
import { priceFeed } from "../feed/binance-ws";

const ASSETS: Asset[] = ["BTC", "ETH", "SOL"];
const WINDOWS = [5, 15] as const;
const STARTING_CASH = 10_000;
const PRICE_HISTORY_MAX = 240;

interface PlaceResult {
  ok: boolean;
  message?: string;
  orderId?: string;
}

interface SimState {
  initialized: boolean;
  markets: Record<string, Market>;
  books: Record<string, MarketBook>;
  history: Record<string, PricePoint[]>; // crypto price history per market
  portfolio: Portfolio;
  cryptoPrices: Record<Asset, number>;
  lastTick: number;

  // actions
  init: () => void;
  tick: () => void;
  placeOrder: (input: {
    marketId: string;
    outcome: Outcome;
    side: Side;
    type: OrderType;
    limitCents?: number;
    sizeShares: number;
    postOnly?: boolean;
  }) => PlaceResult;
  cancelOrder: (orderId: string) => void;
  cancelAll: () => void;
  redeem: (marketId: string, outcome: Outcome) => void;
  resetPortfolio: () => void;
}

type PersistedSimState = Pick<SimState, "portfolio" | "markets" | "history">;
type SimStoreApi = {
  getState: () => SimState;
  setState: (partial: Partial<SimState> | ((state: SimState) => Partial<SimState>)) => void;
  subscribe: (listener: () => void) => () => void;
};
type SimStoreHook = {
  <T>(selector: (state: SimState) => T): T;
  getState: () => SimState;
};

const PERSIST_KEY = "polysim-v1";

function emptyPortfolio(): Portfolio {
  return { cash: STARTING_CASH, reserved: 0, positions: [], orders: [], fills: [] };
}

function readPersistedState(): Partial<PersistedSimState> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<PersistedSimState>;
  } catch {
    return {};
  }
}

function writePersistedState(state: SimState): void {
  if (typeof localStorage === "undefined") return;
  const persisted: PersistedSimState = {
    portfolio: state.portfolio,
    markets: state.markets,
    history: state.history,
  };
  localStorage.setItem(PERSIST_KEY, JSON.stringify(persisted));
}

function createSimStore(
  initializer: (set: SimStoreApi["setState"], get: SimStoreApi["getState"]) => SimState,
): SimStoreHook {
  const listeners = new Set<() => void>();
  let state: SimState;
  let hydrated = false;

  const hydrate = (): void => {
    if (hydrated) return;
    hydrated = true;
    const persisted = readPersistedState();
    if (Object.keys(persisted).length === 0) return;
    state = { ...state, ...persisted };
    listeners.forEach((listener) => listener());
  };

  const api: SimStoreApi = {
    getState: () => state,
    setState: (partial) => {
      const nextPartial = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...nextPartial };
      writePersistedState(state);
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      hydrate();
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

let orderCounter = 0;
function nextOrderId(): string {
  orderCounter += 1;
  return `ord_${Date.now().toString(36)}_${orderCounter}`;
}

export const useSimStore = createSimStore((set, get) => ({
  initialized: false,
  markets: {},
  books: {},
  history: {},
  portfolio: emptyPortfolio(),
  cryptoPrices: { BTC: 0, ETH: 0, SOL: 0 },
  lastTick: 0,

  init: () => {
    if (get().initialized) return;
    set({ initialized: true });
  },

  tick: () => {
    const now = Date.now();
    const prices = priceFeed.getPrices();
    const state = get();
    const markets = { ...state.markets };
    const books = { ...state.books };
    const history = { ...state.history };
    let portfolio = state.portfolio;

    // 1) Ensure current windows exist for each asset/window combo
    for (const asset of ASSETS) {
      const price = prices[asset];
      if (price <= 0) continue;
      for (const win of WINDOWS) {
        const openAt = currentWindowOpen(now, win);
        const id = marketId(asset, win, openAt);
        if (!markets[id]) {
          markets[id] = buildMarket({ asset, windowMin: win, openAt, priceAtOpen: price });
        }
      }
    }

    // 2) Update current prices on open markets + record history
    for (const m of Object.values(markets)) {
      if (m.state !== "OPEN") continue;
      const p = prices[m.asset];
      if (p > 0) {
        markets[m.id] = { ...m, currentPrice: p };
        const h = history[m.id] ?? [];
        if (h.length === 0 || now - h[h.length - 1].ts > 1000) {
          const next = [...h, { ts: now, price: p }];
          if (next.length > PRICE_HISTORY_MAX) next.splice(0, next.length - PRICE_HISTORY_MAX);
          history[m.id] = next;
        }
      }
    }

    // 3) Rebuild books for open markets using fair probability
    for (const m of Object.values(markets)) {
      if (m.state !== "OPEN") continue;
      const msToClose = m.closeAt - now;
      const upProb = fairUpProbability({
        asset: m.asset,
        currentPrice: m.currentPrice,
        priceToBeat: m.priceToBeat,
        msToClose,
      });
      // keep lastTrade if existed
      const seed = Math.floor(now / 4000) + (m.id.length % 17);
      const newBook = buildMarketBook(m.id, upProb, now, seed);
      const prev = books[m.id];
      if (prev) {
        newBook.UP.lastTrade = prev.UP.lastTrade;
        newBook.DOWN.lastTrade = prev.DOWN.lastTrade;
      }
      books[m.id] = newBook;
    }

    // 4) Try to match any resting LIMIT orders that may now be crossable
    const newFills = [];
    const orders = portfolio.orders.map((o) => ({ ...o }));
    for (const order of orders) {
      if (order.status !== "OPEN" && order.status !== "PARTIAL") continue;
      if (order.type !== "LIMIT") continue;
      const book = books[order.marketId];
      if (!book) continue;
      const ob = book[order.outcome];
      const res = matchAgainstBook({ order, book: ob, ts: now });
      if (res.fills.length === 0) continue;
      // apply book change
      books[order.marketId] = {
        ...book,
        [order.outcome]: res.newBook,
        updatedAt: now,
      } as MarketBook;
      for (const f of res.fills) {
        order.filled += f.size;
        order.feesPaid += f.fee;
        newFills.push(f);
      }
      const filledSum = res.fills.reduce((a, f) => a + f.size, 0);
      const costSum = res.fills.reduce((a, f) => a + f.size * f.price, 0);
      order.avgFillPrice =
        order.filled > 0
          ? (order.avgFillPrice * (order.filled - filledSum) + costSum) / order.filled
          : 0;
      if (order.filled >= order.size - 1e-9) order.status = "FILLED";
      else order.status = "PARTIAL";
      markets[order.marketId] = {
        ...markets[order.marketId],
        volume: (markets[order.marketId]?.volume ?? 0) + costSum,
      };
    }
    if (newFills.length > 0) {
      portfolio = applyFillsToPortfolio({ ...portfolio, orders }, newFills);
    } else {
      portfolio = { ...portfolio, orders };
    }

    // 5) Resolve markets past closeAt
    for (const m of Object.values(markets)) {
      if (!shouldResolve(m, now)) continue;
      const winner = resolveOutcome(m);
      markets[m.id] = { ...m, state: "RESOLVED", resolvedOutcome: winner };
      // mark positions redeemable + cancel related orders
      const positions = portfolio.positions.map((p) => {
        if (p.marketId !== m.id) return p;
        return { ...p, redeemable: true };
      });
      const cancelledOrders = portfolio.orders.map((o) => {
        if (o.marketId !== m.id) return o;
        if (o.status === "OPEN" || o.status === "PARTIAL") {
          return { ...o, status: "CANCELED" as const };
        }
        return o;
      });
      portfolio = { ...portfolio, positions, orders: cancelledOrders };
    }

    // 6) Update reserved cash from open buy limit orders
    portfolio = { ...portfolio, reserved: totalReserved(portfolio.orders) };

    set({
      markets,
      books,
      history,
      portfolio,
      cryptoPrices: prices,
      lastTick: now,
    });
  },

  placeOrder: (input) => {
    const state = get();
    const market = state.markets[input.marketId];
    if (!market || market.state !== "OPEN") return { ok: false, message: "Market not open" };
    const book = state.books[input.marketId];
    if (!book) return { ok: false, message: "No order book" };
    const ob = book[input.outcome];
    if (input.sizeShares < 1) return { ok: false, message: "Min size: 1 share" };

    const now = Date.now();
    const limitPrice = input.limitCents != null ? input.limitCents / 100 : undefined;

    let portfolio = state.portfolio;
    const books = { ...state.books };

    // Build order
    const order: Order = {
      id: nextOrderId(),
      marketId: input.marketId,
      outcome: input.outcome,
      side: input.side,
      type: input.type,
      limitPrice,
      size: input.sizeShares,
      filled: 0,
      avgFillPrice: 0,
      postOnly: !!input.postOnly,
      status: "OPEN",
      createdAt: now,
      feesPaid: 0,
    };

    // For BUY: validate cash. Use marketable estimated cost.
    if (order.side === "BUY") {
      let estCost: number;
      if (order.type === "MARKET") {
        const { cost, canFill } = totalCostBuy(order, ob);
        if (canFill < order.size - 1e-9) return { ok: false, message: "Insufficient liquidity" };
        estCost = cost;
      } else if (order.type === "FOK") {
        const { cost, canFill } = totalCostBuy(order, ob, limitPrice);
        if (canFill < order.size - 1e-9) return { ok: false, message: "FOK cannot fill fully" };
        estCost = cost;
      } else {
        // LIMIT — worst case = size * limit
        estCost = order.size * (limitPrice ?? 0);
      }
      const available = portfolio.cash - portfolio.reserved;
      const estFee = order.type === "LIMIT" ? 0 : calcFee(order.size, limitPrice ?? 0.5);
      if (estCost + estFee > available + 1e-6) return { ok: false, message: "Insufficient cash" };
    } else {
      // SELL — need owned shares
      const pos = portfolio.positions.find(
        (p) => p.marketId === order.marketId && p.outcome === order.outcome,
      );
      if (!pos || pos.size < order.size - 1e-9)
        return { ok: false, message: "Insufficient shares" };
    }

    // Post-only LIMIT: refuse if crossable
    if (order.postOnly && order.type === "LIMIT") {
      const bestAsk = ob.asks[0]?.price;
      const bestBid = ob.bids[0]?.price;
      if (order.side === "BUY" && bestAsk != null && limitPrice! >= bestAsk) {
        return { ok: false, message: "Post-only would cross" };
      }
      if (order.side === "SELL" && bestBid != null && limitPrice! <= bestBid) {
        return { ok: false, message: "Post-only would cross" };
      }
    }

    // Execute MARKET / FOK / marketable LIMIT immediately
    let resultBook = ob;
    const fills = [];
    let filledThisCall = 0;
    let costThisCall = 0;
    if (
      order.type === "MARKET" ||
      order.type === "FOK" ||
      (order.type === "LIMIT" && !order.postOnly)
    ) {
      const res = matchAgainstBook({
        order,
        book: ob,
        limitPrice: order.type === "MARKET" ? undefined : limitPrice,
        ts: now,
      });
      if (order.type === "FOK" && res.remaining > 1e-9) {
        return { ok: false, message: "FOK cannot fill fully" };
      }
      for (const f of res.fills) {
        order.filled += f.size;
        order.feesPaid += f.fee;
        fills.push(f);
        filledThisCall += f.size;
        costThisCall += f.size * f.price;
      }
      if (filledThisCall > 0) {
        order.avgFillPrice = costThisCall / filledThisCall;
      }
      resultBook = res.newBook;
    }

    // Determine final status
    if (order.filled >= order.size - 1e-9) order.status = "FILLED";
    else if (order.type === "LIMIT") order.status = order.filled > 0 ? "PARTIAL" : "OPEN";
    else if (order.type === "MARKET") order.status = order.filled > 0 ? "FILLED" : "CANCELED";

    // Apply book change
    books[order.marketId] = {
      ...book,
      [order.outcome]: resultBook,
      updatedAt: now,
    } as MarketBook;

    // Apply fills to portfolio
    const newOrders = [...portfolio.orders, order];
    portfolio = applyFillsToPortfolio({ ...portfolio, orders: newOrders }, fills);

    // Update market volume
    const markets = { ...state.markets };
    markets[order.marketId] = {
      ...market,
      volume: market.volume + costThisCall,
    };

    // reserved
    portfolio = { ...portfolio, reserved: totalReserved(portfolio.orders) };

    set({ books, portfolio, markets });
    return { ok: true, orderId: order.id };
  },

  cancelOrder: (orderId) => {
    const state = get();
    const orders = state.portfolio.orders.map((o) =>
      o.id === orderId && (o.status === "OPEN" || o.status === "PARTIAL")
        ? { ...o, status: "CANCELED" as const }
        : o,
    );
    const portfolio = { ...state.portfolio, orders, reserved: totalReserved(orders) };
    set({ portfolio });
  },

  cancelAll: () => {
    const state = get();
    const orders = state.portfolio.orders.map((o) =>
      o.status === "OPEN" || o.status === "PARTIAL" ? { ...o, status: "CANCELED" as const } : o,
    );
    const portfolio = { ...state.portfolio, orders, reserved: totalReserved(orders) };
    set({ portfolio });
  },

  redeem: (mId, outcome) => {
    const state = get();
    const market = state.markets[mId];
    if (!market || market.state !== "RESOLVED" || !market.resolvedOutcome) return;
    const positions = state.portfolio.positions.map((p) => ({ ...p }));
    let cash = state.portfolio.cash;
    for (const p of positions) {
      if (p.marketId !== mId || p.outcome !== outcome) continue;
      if (!p.redeemable || p.redeemed) continue;
      const payout = market.resolvedOutcome === p.outcome ? p.size * 1 : 0;
      cash += payout;
      p.realizedPnl += payout - p.size * p.avgPrice;
      p.redeemed = true;
      p.redeemable = false;
      p.size = 0;
    }
    set({ portfolio: { ...state.portfolio, cash, positions } });
  },

  resetPortfolio: () => {
    set({ portfolio: emptyPortfolio() });
  },
}));

// Selectors / helpers
export function selectDisplayPrice(book: MarketBook | undefined, outcome: Outcome): number | null {
  if (!book) return null;
  return displayPrice(book[outcome]);
}

export function selectMidpoint(book: MarketBook | undefined, outcome: Outcome): number | null {
  if (!book) return null;
  return midpoint(book[outcome]);
}
