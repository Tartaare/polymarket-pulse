// Browser price feed — uses Binance REST polling (works where WS is blocked).
import type { Asset } from "../sim/types";

const SYMBOL_MAP: Record<Asset, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

type Listener = (snapshot: Record<Asset, number>) => void;

class PriceFeed {
  private prices: Record<Asset, number> = { BTC: 0, ETH: 0, SOL: 0 };
  private listeners = new Set<Listener>();
  private timer: number | null = null;
  private started = false;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.poll();
    this.timer = window.setInterval(() => this.poll(), 2000);
  }

  private async poll() {
    try {
      const res = await fetch("/api/prices", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { symbol: string; price: string }[] = await res.json();
      for (const row of data) {
        const asset = (Object.keys(SYMBOL_MAP) as Asset[]).find((a) => SYMBOL_MAP[a] === row.symbol);
        if (asset) this.prices[asset] = parseFloat(row.price);
      }
      this.emit();
    } catch {
      // swallow; next poll will try again
    }
  }

  private emit() {
    for (const l of this.listeners) l({ ...this.prices });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn({ ...this.prices });
    return () => { this.listeners.delete(fn); };
  }

  getPrices(): Record<Asset, number> {
    return { ...this.prices };
  }

  isReady(asset: Asset): boolean {
    return this.prices[asset] > 0;
  }
}

export const priceFeed = new PriceFeed();
