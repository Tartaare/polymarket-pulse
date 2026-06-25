import { normalizeGammaMarket } from "@/lib/polymarket/normalize";
import { applyPriceChange, bookFromClob } from "./orderbook";
import { calcFee, estimateExecution, matchAgainstBook } from "./matching";
import type { Order } from "./types";

export function runSprintOneSelfChecks(): void {
  checkGammaParsing();
  checkBookReducer();
  checkExecutionEngine();
  checkFees();
}

function checkGammaParsing(): void {
  const market = normalizeGammaMarket({
    slug: "bitcoin-up-or-down-june-19-5m",
    question: "Bitcoin Up or Down - 5 minutes",
    conditionId: "0xabc",
    startDate: new Date(Date.now() - 60_000).toISOString(),
    endDate: new Date(Date.now() + 240_000).toISOString(),
    outcomes: JSON.stringify(["Up", "Down"]),
    outcomePrices: JSON.stringify(["0.52", "0.48"]),
    clobTokenIds: JSON.stringify(["up-token", "down-token"]),
    active: true,
    closed: false,
    archived: false,
  });
  assert(market?.asset === "BTC", "Gamma parser infers BTC");
  assert(market.windowMin === 5, "Gamma parser infers 5m window");
  assert(market.clobTokenIds.UP === "up-token", "Gamma parser maps UP token");

  const hourly = normalizeGammaMarket({
    slug: "bitcoin-up-or-down-june-19-2026-8am-et",
    question: "Bitcoin Up or Down - June 19, 8AM ET",
    description: "This market will resolve to \"Up\" if the close price is greater than or equal to the open price for the BTC/USDT 1 hour candle.",
    conditionId: "0xhour",
    eventStartTime: "2026-06-19T12:00:00Z",
    endDate: "2026-06-19T13:00:00Z",
    outcomes: JSON.stringify(["Up", "Down"]),
    outcomePrices: JSON.stringify(["0.28", "0.72"]),
    clobTokenIds: JSON.stringify(["up-hour", "down-hour"]),
    active: true,
    closed: false,
    archived: false,
  });
  assert(hourly?.windowMin === 60, "Gamma parser infers 1h window from description or eventStartTime");

  const unrelated = normalizeGammaMarket({
    slug: "hyperliquid-up-or-down-june-19-2026-8am-et",
    question: "Hyperliquid Up or Down - June 19, 8AM ET",
    description: "This market will resolve according to a 1 hour candle and its resolution source.",
    conditionId: "0xother",
    eventStartTime: "2026-06-19T12:00:00Z",
    endDate: "2026-06-19T13:00:00Z",
    outcomes: JSON.stringify(["Up", "Down"]),
    outcomePrices: JSON.stringify(["0.28", "0.72"]),
    clobTokenIds: JSON.stringify(["up-other", "down-other"]),
    active: true,
    closed: false,
    archived: false,
  });
  assert(unrelated === null, "Gamma parser rejects non-BTC/ETH/SOL markets");

  const threshold = normalizeGammaMarket({
    slug: "bitcoin-above-62600-on-june-19-2026-9am-et",
    question: "Bitcoin above 62,600 on June 19, 9AM ET?",
    description: "This market resolves Yes if Bitcoin is above a threshold at the close of the 1 hour candle.",
    conditionId: "0xthreshold",
    eventStartTime: "2026-06-19T13:00:00Z",
    endDate: "2026-06-19T14:00:00Z",
    outcomes: JSON.stringify(["Yes", "No"]),
    outcomePrices: JSON.stringify(["0.28", "0.72"]),
    clobTokenIds: JSON.stringify(["yes-threshold", "no-threshold"]),
    active: true,
    closed: false,
    archived: false,
  });
  assert(threshold === null, "Gamma parser rejects non Up or Down market types");
}

function checkBookReducer(): void {
  const book = bookFromClob({
    market: "0xabc",
    asset_id: "up-token",
    timestamp: "100",
    bids: [{ price: "0.49", size: "20" }, { price: "0.48", size: "10" }],
    asks: [{ price: "0.51", size: "10" }, { price: "0.52", size: "20" }],
  });
  assert(book.bestBid === 0.49, "book best bid");
  assert(book.bestAsk === 0.51, "book best ask");
  const removed = applyPriceChange(book, { asset_id: "up-token", price: "0.49", size: "0", side: "BUY" }, 200);
  assert(removed.bestBid === 0.48, "price_change size=0 removes level");
}

function checkExecutionEngine(): void {
  const book = bookFromClob({
    market: "0xabc",
    asset_id: "up-token",
    timestamp: "100",
    bids: [{ price: "0.48", size: "10" }],
    asks: [{ price: "0.50", size: "5" }, { price: "0.51", size: "10" }],
  });
  const order: Order = {
    id: "o1",
    marketId: "0xabc",
    tokenId: "up-token",
    outcome: "UP",
    side: "BUY",
    type: "FAK",
    size: 12,
    filled: 0,
    avgFillPrice: 0,
    postOnly: false,
    status: "OPEN",
    createdAt: 100,
    updatedAt: 100,
    feesPaid: 0,
    grossProceeds: 0,
  };
  const estimate = estimateExecution({ side: "BUY", size: 12, book, feeRateBps: 700 });
  assert(estimate.fillable === 12, "FAK estimate walks multiple ask levels");
  const match = matchAgainstBook({ order, book, feeRateBps: 700, ts: 101 });
  assert(match.fills.length === 2, "partial fills split by level");
  assert(match.remaining === 0, "full visible liquidity fill");
}

function checkFees(): void {
  assert(calcFee(100, 0.5, 700) === 1.75, "crypto fee formula");
  assert(calcFee(1, 0.99, 700) === 0.00069, "fee rounds to 5 decimals");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Self-check failed: ${message}`);
}
