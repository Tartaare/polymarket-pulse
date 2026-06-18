export type Asset = "BTC" | "ETH" | "SOL";
export type WindowMin = 5 | 15 | 60;
export type Outcome = "UP" | "DOWN";
export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "FOK" | "FAK";
export type TimeInForce = "GTC" | "GTD";
export type OrderStatus = "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "EXPIRED" | "REJECTED";
export type MarketState = "UPCOMING" | "LIVE" | "CLOSING" | "RESOLVED";
export type PolymarketMarketStatus = "upcoming" | "live" | "closing" | "resolved";

export interface PolymarketToken {
  outcome: Outcome;
  label: string;
  tokenId: string;
  price: number | null;
}

export interface FeeSchedule {
  exponent: number;
  rate: number;
  takerOnly: boolean;
  rebateRate: number;
}

export interface Market {
  id: string;
  slug: string;
  question: string;
  conditionId: string;
  asset: Asset;
  windowMin: WindowMin;
  startDate: number;
  endDate: number;
  closed: boolean;
  active: boolean;
  archived: boolean;
  status: PolymarketMarketStatus;
  state: MarketState;
  outcomes: Outcome[];
  outcomeLabels: Record<Outcome, string>;
  outcomePrices: Record<Outcome, number | null>;
  clobTokenIds: Record<Outcome, string>;
  tokens: PolymarketToken[];
  orderMinSize: number;
  tickSize: number;
  feeRateBps: number;
  feeSchedule?: FeeSchedule;
  volume: number;
  liquidity: number;
  resolvedOutcome?: Outcome;
  source: "polymarket";
  updatedAt: number;
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface OutcomeBook {
  tokenId: string;
  bids: BookLevel[];
  asks: BookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  mid: number | null;
  liquidity: number;
  lastTrade?: { price: number; size: number; ts: number; side: Side };
  updatedAt: number;
  hash?: string;
  tickSize?: number;
  minOrderSize?: number;
  resolved?: boolean;
}

export interface MarketBook {
  marketId: string;
  conditionId: string;
  UP: OutcomeBook;
  DOWN: OutcomeBook;
  updatedAt: number;
  source: "clob";
}

export interface Order {
  id: string;
  marketId: string;
  tokenId: string;
  outcome: Outcome;
  side: Side;
  type: OrderType;
  timeInForce: TimeInForce;
  limitPrice?: number;
  expiresAt?: number;
  size: number;
  filled: number;
  avgFillPrice: number;
  postOnly: boolean;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  feesPaid: number;
  grossProceeds: number;
  rejectionReason?: string;
}

export interface Fill {
  id: string;
  orderId: string;
  marketId: string;
  tokenId: string;
  outcome: Outcome;
  side: Side;
  price: number;
  size: number;
  fee: number;
  feeRateBps: number;
  ts: number;
}

export interface Position {
  marketId: string;
  tokenId: string;
  outcome: Outcome;
  size: number;
  avgPrice: number;
  realizedPnl: number;
  feesPaid: number;
  redeemable: boolean;
  redeemed: boolean;
}

export interface EquityPoint {
  ts: number;
  equity: number;
  cash: number;
  grossPnl: number;
  netPnl: number;
}

export interface TrainingSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  label: string;
}

export interface Portfolio {
  cash: number;
  reserved: number;
  positions: Position[];
  orders: Order[];
  fills: Fill[];
  equity: EquityPoint[];
  sessions: TrainingSession[];
}

export interface PricePoint {
  ts: number;
  price: number;
}
