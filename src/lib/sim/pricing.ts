// Fair-price model for an Up/Down market.
// Probability that current > priceToBeat at closeAt, given current price now
// and time remaining. Uses a simple log-normal random-walk assumption.
//
// vol: per-minute volatility of log returns (rough heuristic per asset).
import type { Asset } from "./types";

const ASSET_VOL_PER_MIN: Record<Asset, number> = {
  BTC: 0.0025,
  ETH: 0.0032,
  SOL: 0.0048,
};

function erf(x: number): number {
  // Abramowitz & Stegun approximation
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function fairUpProbability(opts: {
  asset: Asset;
  currentPrice: number;
  priceToBeat: number;
  msToClose: number;
}): number {
  const { asset, currentPrice, priceToBeat, msToClose } = opts;
  if (msToClose <= 0 || currentPrice <= 0 || priceToBeat <= 0) {
    return currentPrice > priceToBeat ? 0.995 : 0.005;
  }
  const minutes = Math.max(msToClose / 60_000, 1 / 60);
  const sigma = ASSET_VOL_PER_MIN[asset] * Math.sqrt(minutes);
  const logRatio = Math.log(currentPrice / priceToBeat);
  // P(S_T > K) under GBM with zero drift = N(log(S/K) / sigma)
  const p = normCdf(logRatio / sigma);
  // clamp to tradable range
  return Math.min(0.99, Math.max(0.01, p));
}

export function toCents(p: number): number {
  return Math.round(p * 100);
}

export function fromCents(c: number): number {
  return c / 100;
}

export function clampCents(c: number): number {
  return Math.min(99, Math.max(1, Math.round(c)));
}
