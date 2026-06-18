import { useSimStore } from "@/lib/store/sim-store";
import type { Side } from "@/lib/sim/types";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const RECONNECT_MS = 2_500;

type MarketMessage =
  | { event_type: "book"; asset_id: string; market: string; bids: { price: string; size: string }[]; asks: { price: string; size: string }[]; timestamp: string; hash?: string }
  | { event_type: "price_change"; price_changes: Array<{ asset_id: string; price: string; size: string; side: Side; hash?: string }>; timestamp: string }
  | { event_type: "last_trade_price"; asset_id: string; price: string; size: string; side: Side; timestamp: string; fee_rate_bps?: string }
  | { event_type: "best_bid_ask"; asset_id: string; timestamp: string }
  | { event_type: "market_resolved"; market: string; winning_asset_id?: string; winning_outcome?: string }
  | { event_type: "new_market" };

class PolymarketClobSocket {
  private ws: WebSocket | null = null;
  private reconnect: number | null = null;
  private tokenKey = "";

  start(): void {
    this.reconnectIfNeeded();
  }

  stop(): void {
    if (this.reconnect) window.clearTimeout(this.reconnect);
    this.reconnect = null;
    this.ws?.close();
    this.ws = null;
    useSimStore.getState().setClobStatus("idle");
  }

  syncSubscriptions(): void {
    const tokens = this.currentTokens();
    const nextKey = tokens.join(",");
    if (nextKey === this.tokenKey) return;
    this.tokenKey = nextKey;
    if (this.ws?.readyState === WebSocket.OPEN) this.subscribe(tokens);
    else this.reconnectIfNeeded();
  }

  private reconnectIfNeeded(): void {
    if (typeof WebSocket === "undefined") return;
    const tokens = this.currentTokens();
    if (tokens.length === 0) return;
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
    useSimStore.getState().setClobStatus("connecting");
    this.ws = new WebSocket(WS_URL);
    this.ws.onopen = () => {
      useSimStore.getState().setClobStatus("live");
      this.subscribe(tokens);
    };
    this.ws.onmessage = (event) => this.onMessage(event.data);
    this.ws.onerror = () => useSimStore.getState().setClobStatus("degraded");
    this.ws.onclose = () => {
      useSimStore.getState().setClobStatus("degraded");
      this.ws = null;
      if (this.reconnect) window.clearTimeout(this.reconnect);
      this.reconnect = window.setTimeout(() => this.reconnectIfNeeded(), RECONNECT_MS);
    };
  }

  private subscribe(tokens: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || tokens.length === 0) return;
    this.ws.send(JSON.stringify({ assets_ids: tokens, type: "market", custom_feature_enabled: true }));
  }

  private onMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw) as MarketMessage | MarketMessage[];
      const messages = Array.isArray(parsed) ? parsed : [parsed];
      for (const message of messages) this.applyMessage(message);
    } catch {
      useSimStore.getState().setClobStatus("degraded");
    }
  }

  private applyMessage(message: MarketMessage): void {
    const store = useSimStore.getState();
    if (message.event_type === "book") {
      store.applyClobBook(message);
      return;
    }
    if (message.event_type === "price_change") {
      store.applyClobPriceChanges(message.price_changes, Number(message.timestamp ?? Date.now()));
      return;
    }
    if (message.event_type === "last_trade_price") {
      store.applyLastTrade({
        tokenId: message.asset_id,
        price: Number(message.price),
        size: Number(message.size),
        side: message.side,
        ts: Number(message.timestamp ?? Date.now()),
        feeRateBps: message.fee_rate_bps ? Number(message.fee_rate_bps) : undefined,
      });
      return;
    }
    if (message.event_type === "market_resolved") {
      store.markMarketResolved(message.market, message.winning_asset_id, message.winning_outcome);
      return;
    }
    if (message.event_type === "new_market") void store.refreshMarkets();
  }

  private currentTokens(): string[] {
    return Object.values(useSimStore.getState().markets)
      .filter((market) => market.state !== "RESOLVED")
      .flatMap((market) => [market.clobTokenIds.UP, market.clobTokenIds.DOWN])
      .filter(Boolean);
  }
}

export const polymarketClobSocket = new PolymarketClobSocket();
