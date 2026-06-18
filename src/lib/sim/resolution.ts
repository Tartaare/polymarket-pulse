import type { Asset, Market, WindowMin } from "./types";

// Compute the open timestamp of the current N-minute window for asset.
export function currentWindowOpen(now: number, windowMin: WindowMin): number {
  const ms = windowMin * 60_000;
  return Math.floor(now / ms) * ms;
}

export function marketId(asset: Asset, windowMin: WindowMin, openAt: number): string {
  return `${asset.toLowerCase()}-${windowMin}m-${openAt}`;
}

export function buildMarket(opts: {
  asset: Asset;
  windowMin: WindowMin;
  openAt: number;
  priceAtOpen: number;
}): Market {
  const { asset, windowMin, openAt, priceAtOpen } = opts;
  return {
    id: marketId(asset, windowMin, openAt),
    asset,
    windowMin,
    openAt,
    closeAt: openAt + windowMin * 60_000,
    priceToBeat: priceAtOpen,
    currentPrice: priceAtOpen,
    state: "OPEN",
    volume: 0,
  };
}

export function shouldResolve(m: Market, now: number): boolean {
  return m.state === "OPEN" && now >= m.closeAt;
}

export function resolveOutcome(m: Market): "UP" | "DOWN" {
  return m.currentPrice > m.priceToBeat ? "UP" : "DOWN";
}
