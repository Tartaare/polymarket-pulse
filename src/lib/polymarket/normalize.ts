import type { Asset, FeeSchedule, Market, Outcome, PolymarketMarketStatus, WindowMin } from "@/lib/sim/types";

const ASSETS: Asset[] = ["BTC", "ETH", "SOL"];
const WINDOWS: WindowMin[] = [5, 15, 60];
const DEFAULT_FEE_BPS_BY_RATE = 700;

export interface GammaMarket {
  id?: string;
  question?: string | null;
  conditionId?: string | null;
  slug?: string | null;
  startDate?: string | null;
  startDateIso?: string | null;
  endDate?: string | null;
  endDateIso?: string | null;
  closed?: boolean | null;
  active?: boolean | null;
  archived?: boolean | null;
  outcomes?: string | string[] | null;
  outcomePrices?: string | string[] | null;
  clobTokenIds?: string | string[] | null;
  orderMinSize?: number | string | null;
  orderPriceMinTickSize?: number | string | null;
  takerBaseFee?: number | string | null;
  makerBaseFee?: number | string | null;
  feesEnabled?: boolean | null;
  feeSchedule?: Partial<FeeSchedule> | null;
  volumeNum?: number | null;
  liquidityNum?: number | null;
  volume?: string | null;
  liquidity?: string | null;
}

export function normalizeGammaMarket(raw: GammaMarket, now = Date.now()): Market | null {
  const slug = raw.slug?.trim();
  const question = raw.question?.trim() ?? slug ?? "";
  const conditionId = raw.conditionId?.trim();
  if (!slug || !conditionId) return null;

  const asset = inferAsset(`${slug} ${question}`);
  const windowMin = inferWindow(`${slug} ${question}`, raw.startDate ?? raw.startDateIso, raw.endDate ?? raw.endDateIso);
  if (!asset || !windowMin) return null;

  const outcomesRaw = parseStringArray(raw.outcomes);
  const tokenIds = parseStringArray(raw.clobTokenIds);
  const prices = parseNumberArray(raw.outcomePrices);
  if (outcomesRaw.length < 2 || tokenIds.length < 2) return null;

  const outcomeIndexes = mapOutcomeIndexes(outcomesRaw);
  if (!outcomeIndexes) return null;

  const startDate = parseDate(raw.startDateIso ?? raw.startDate);
  const endDate = parseDate(raw.endDateIso ?? raw.endDate);
  if (!endDate) return null;

  const active = raw.active !== false;
  const closed = raw.closed === true;
  const archived = raw.archived === true;
  const status = marketStatus({ startDate, endDate, active, closed, archived, now });
  const feeSchedule = normalizeFeeSchedule(raw.feeSchedule);
  const takerBps = numberOrNull(raw.takerBaseFee);
  const feeRateBps = raw.feesEnabled === false ? 0 : takerBps ?? feeScheduleToBps(feeSchedule) ?? DEFAULT_FEE_BPS_BY_RATE;

  return {
    id: conditionId,
    slug,
    question,
    conditionId,
    asset,
    windowMin,
    startDate: startDate ?? Math.max(0, endDate - windowMin * 60_000),
    endDate,
    closed,
    active,
    archived,
    status,
    state: statusToState(status),
    outcomes: ["UP", "DOWN"],
    outcomeLabels: {
      UP: outcomesRaw[outcomeIndexes.UP] ?? "Up",
      DOWN: outcomesRaw[outcomeIndexes.DOWN] ?? "Down",
    },
    outcomePrices: {
      UP: prices[outcomeIndexes.UP] ?? null,
      DOWN: prices[outcomeIndexes.DOWN] ?? null,
    },
    clobTokenIds: {
      UP: tokenIds[outcomeIndexes.UP],
      DOWN: tokenIds[outcomeIndexes.DOWN],
    },
    tokens: [
      { outcome: "UP", label: outcomesRaw[outcomeIndexes.UP] ?? "Up", tokenId: tokenIds[outcomeIndexes.UP], price: prices[outcomeIndexes.UP] ?? null },
      { outcome: "DOWN", label: outcomesRaw[outcomeIndexes.DOWN] ?? "Down", tokenId: tokenIds[outcomeIndexes.DOWN], price: prices[outcomeIndexes.DOWN] ?? null },
    ],
    orderMinSize: numberOrNull(raw.orderMinSize) ?? 1,
    tickSize: numberOrNull(raw.orderPriceMinTickSize) ?? 0.01,
    feeRateBps,
    feeSchedule,
    volume: raw.volumeNum ?? numberOrNull(raw.volume) ?? 0,
    liquidity: raw.liquidityNum ?? numberOrNull(raw.liquidity) ?? 0,
    source: "polymarket",
    updatedAt: now,
  };
}

export function updateMarketStatus(market: Market, now = Date.now()): Market {
  const status = marketStatus({ ...market, now });
  return { ...market, status, state: statusToState(status), updatedAt: now };
}

function inferAsset(text: string): Asset | null {
  const upper = text.toUpperCase();
  return ASSETS.find((asset) => upper.includes(asset) || upper.includes(assetName(asset))) ?? null;
}

function assetName(asset: Asset): string {
  if (asset === "BTC") return "BITCOIN";
  if (asset === "ETH") return "ETHEREUM";
  return "SOLANA";
}

function inferWindow(text: string, start?: string | null, end?: string | null): WindowMin | null {
  const lower = text.toLowerCase();
  if (/\b(5m|5-min|5 min|5-minute|5 minute)\b/.test(lower)) return 5;
  if (/\b(15m|15-min|15 min|15-minute|15 minute)\b/.test(lower)) return 15;
  if (/\b(1h|1-hour|1 hour|60m|60 min|60-minute)\b/.test(lower)) return 60;
  const startMs = parseDate(start);
  const endMs = parseDate(end);
  if (startMs && endMs) {
    const minutes = Math.round((endMs - startMs) / 60_000);
    return WINDOWS.find((windowMin) => Math.abs(windowMin - minutes) <= 1) ?? null;
  }
  return null;
}

function marketStatus(opts: {
  startDate?: number | null;
  endDate: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  now: number;
}): PolymarketMarketStatus {
  if (opts.closed || opts.archived || !opts.active || opts.now >= opts.endDate) return "resolved";
  if (opts.startDate && opts.now < opts.startDate) return "upcoming";
  if (opts.endDate - opts.now <= 60_000) return "closing";
  return "live";
}

function statusToState(status: PolymarketMarketStatus): Market["state"] {
  if (status === "upcoming") return "UPCOMING";
  if (status === "closing") return "CLOSING";
  if (status === "resolved") return "RESOLVED";
  return "LIVE";
}

function mapOutcomeIndexes(outcomes: string[]): Record<Outcome, number> | null {
  const normalized = outcomes.map((outcome) => outcome.toLowerCase());
  const up = normalized.findIndex((outcome) => /\b(up|yes|above|higher)\b/.test(outcome));
  const down = normalized.findIndex((outcome) => /\b(down|no|below|lower)\b/.test(outcome));
  if (up >= 0 && down >= 0 && up !== down) return { UP: up, DOWN: down };
  if (outcomes.length === 2) return { UP: 0, DOWN: 1 };
  return null;
}

function parseStringArray(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value.split(",").map((part) => part.trim()).filter(Boolean);
  }
}

function parseNumberArray(value: string | string[] | null | undefined): number[] {
  return parseStringArray(value).map(Number).map((num) => (Number.isFinite(num) ? num : NaN));
}

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFeeSchedule(value: Partial<FeeSchedule> | null | undefined): FeeSchedule | undefined {
  if (!value) return undefined;
  return {
    exponent: Number(value.exponent ?? 2),
    rate: Number(value.rate ?? 0),
    takerOnly: value.takerOnly !== false,
    rebateRate: Number(value.rebateRate ?? 0),
  };
}

function feeScheduleToBps(schedule: FeeSchedule | undefined): number | null {
  if (!schedule || !Number.isFinite(schedule.rate)) return null;
  return schedule.rate <= 1 ? Math.round(schedule.rate * 10_000) : Math.round(schedule.rate);
}
