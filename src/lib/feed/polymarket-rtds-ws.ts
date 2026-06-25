import { useSimStore } from "@/lib/store/sim-store";
import type { Asset } from "@/lib/sim/types";

/**
 * Polymarket RTDS WebSocket for live crypto prices via Chainlink oracle.
 * This is the authoritative price source for market resolution.
 *
 * Connects to wss://ws-live-data.polymarket.com and subscribes to
 * topic "crypto_prices_chainlink" with symbol format "BTC/USD".
 */

const WS_URL = "wss://ws-live-data.polymarket.com";
const RECONNECT_MS = 3_000;
const SYMBOL_MAP: Record<Asset, string> = { BTC: "BTC/USD", ETH: "ETH/USD", SOL: "SOL/USD" };

export interface CryptoPrice {
  symbol: string;
  asset: Asset;
  price: number;
  ts: number;
  source: "chainlink";
}

type PriceListener = (price: CryptoPrice) => void;

class PolymarketRtdsSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private listeners = new Set<PriceListener>();
  private subscribedSymbols = new Set<string>();
  private lastPrices = new Map<string, CryptoPrice>();
  private _status: "idle" | "connecting" | "live" | "degraded" = "idle";

  get status(): string {
    return this._status;
  }

  getLastPrice(asset: Asset): CryptoPrice | undefined {
    return this.lastPrices.get(SYMBOL_MAP[asset]);
  }

  onPrice(listener: PriceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(assets?: Asset[]): void {
    const symbols = (assets ?? (Object.keys(SYMBOL_MAP) as Asset[])).map((a) => SYMBOL_MAP[a]);
    for (const s of symbols) this.subscribedSymbols.add(s);
    this.connectIfNeeded();
  }

  stop(): void {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this._status = "idle";
  }

  private connectIfNeeded(): void {
    if (typeof WebSocket === "undefined") return;
    if (this.subscribedSymbols.size === 0) return;
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;

    this._status = "connecting";
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this._status = "live";
      this.sendSubscriptions();
    };

    this.ws.onmessage = (event) => this.handleMessage(event.data);

    this.ws.onerror = () => {
      this._status = "degraded";
    };

    this.ws.onclose = () => {
      this._status = "degraded";
      this.ws = null;
      if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = window.setTimeout(() => this.connectIfNeeded(), RECONNECT_MS);
    };
  }

  private sendSubscriptions(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    for (const symbol of this.subscribedSymbols) {
      this.ws.send(
        JSON.stringify({
          action: "subscribe",
          subscriptions: [
            {
              topic: "crypto_prices_chainlink",
              type: "*",
              filters: JSON.stringify({ symbol }),
            },
          ],
        }),
      );
    }
  }

  private handleMessage(raw: string): void {
    try {
      const data = JSON.parse(raw);
      // The RTDS payload typically has { symbol, price, timestamp } or nested
      if (data.symbol && data.price != null) {
        this.processPriceUpdate(data);
      } else if (Array.isArray(data)) {
        for (const item of data) {
          if (item.symbol && item.price != null) this.processPriceUpdate(item);
        }
      } else if (data.data && typeof data.data === "object") {
        // Wrapped in a { data: {...} } envelope
        if (data.data.symbol && data.data.price != null) this.processPriceUpdate(data.data);
      }
    } catch {
      // Ignore unparseable messages (e.g. heartbeats)
    }
  }

  private processPriceUpdate(msg: { symbol: string; price: number | string; timestamp?: number | string }): void {
    const symbol = msg.symbol.toUpperCase();
    const asset = (Object.entries(SYMBOL_MAP) as [Asset, string][]).find(([, s]) => s === symbol)?.[0];
    if (!asset) return;

    const price: CryptoPrice = {
      symbol,
      asset,
      price: Number(msg.price),
      ts: msg.timestamp ? Number(msg.timestamp) : Date.now(),
      source: "chainlink",
    };

    this.lastPrices.set(symbol, price);
    for (const listener of this.listeners) listener(price);
  }
}

export const polymarketRtdsSocket = new PolymarketRtdsSocket();
