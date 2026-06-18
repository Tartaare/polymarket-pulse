export type Asset = "BTC" | "ETH" | "SOL";
export type WindowMin = 5 | 15;
export type Outcome = "UP" | "DOWN";
export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "FOK";
export type OrderStatus = "OPEN" | "FILLED" | "PARTIAL" | "CANCELED" | "EXPIRED";
export type MarketState = "OPEN" | "RESOLVING" | "RESOLVED" | "REDEEMED";

export interface Market {
  id: string;
  asset: Asset;
  windowMin: WindowMin;
  openAt: number;       // ms epoch
  closeAt: number;      // ms epoch
  priceToBeat: number;  // crypto price at openAt
  currentPrice: number; // last crypto price observed
  state: MarketState;
  resolvedOutcome?: Outcome;
  volume: number;       // cumulative $ traded
}

export interface BookLevel {
  price: number; // 0.01 .. 0.99
  size: number;  // shares ($ at $1 redemption)
}

export interface OutcomeBook {
  bids: BookLevel[]; // sorted desc
  asks: BookLevel[]; // sorted asc
  lastTrade?: { price: number; ts: number; side: Side };
}

export interface MarketBook {
  marketId: string;
  UP: OutcomeBook;
  DOWN: OutcomeBook;
  updatedAt: number;
}

export interface Order {
  id: string;
  marketId: string;
  outcome: Outcome;
  side: Side;
  type: OrderType;
  limitPrice?: number; // for LIMIT/FOK
  size: number;        // shares requested
  filled: number;      // shares filled
  avgFillPrice: number;
  postOnly: boolean;
  status: OrderStatus;
  createdAt: number;
  feesPaid: number;
}

export interface Fill {
  id: string;
  orderId: string;
  marketId: string;
  outcome: Outcome;
  side: Side;
  price: number;
  size: number;
  fee: number;
  ts: number;
}

export interface Position {
  marketId: string;
  outcome: Outcome;
  size: number;
  avgPrice: number;
  realizedPnl: number;
  redeemable: boolean;
  redeemed: boolean;
}

export interface Portfolio {
  cash: number;
  reserved: number; // cash reserved for resting orders
  positions: Position[];
  orders: Order[];
  fills: Fill[];
}

export interface PricePoint {
  ts: number;
  price: number; // crypto price
}
