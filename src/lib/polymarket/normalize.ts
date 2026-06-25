import type { Asset, FeeSchedule, Market, Outcome, PolymarketMarketStatus, WindowMin } from "@/lib/sim/types";

const ASSETS: Asset[] = ["BTC", "ETH", "SOL"];
const WINDOWS: WindowMin[] = [5, 15, 60];
const DEFAULT_FEE_BPS_BY_RATE = 700;

export interface GammaMarket {
  id?: string;
  question?: string | null;
  description?: string | null;
  conditionId?: string | null;
  slug?: string | null;
  startDate?: string | null;
  startDateIso?: string | null;
  eventStartTime?: string | null;
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
  tags?: { id?: string; slug?: string; label?: string }[] | null;
}

export function normalizeGammaMarket(raw: GammaMarket, now = Date.now()): Market | null {
  const slug = raw.slug?.trim();
  const question = raw.question?.trim() ?? slug ?? "";
  const conditionId = raw.conditionId?.trim();
  if (!slug || !conditionId) return null;

  const text = [slug, question, raw.description?.trim() ?? ""].filter(Boolean).join(" ");
  if (!isUpOrDownMarket(text, raw.tags)) return null;

  const asset = inferAsset(text);
  const startDate = parseDate(raw.eventStartTime) ?? parseDate(raw.startDate) ?? parseDate(raw.startDateIso);
  const endDate = parseDate(raw.endDate) ?? parseDate(raw.endDateIso);
  const windowMin = inferWindow(text, startDate, endDate, raw.tags);
  if (!asset || !windowMin) return null;

  const outcomesRaw = parseStringArray(raw.outcomes);
  const tokenIds = parseStringArray(raw.clobTokenIds);
  const prices = parseNumberArray(raw.outcomePrices);
  if (outcomesRaw.length < 2 || tokenIds.length < 2) return null;

  const outcomeIndexes = mapOutcomeIndexes(outcomesRaw);
  if (!outcomeIndexes) return null;

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
  if (/\bBTC\b|BITCOIN/.test(upper)) return "BTC";
  if (/\bETH\b|ETHEREUM/.test(upper)) return "ETH";
  if (/\bSOL\b|SOLANA/.test(upper)) return "SOL";
  return null;
}

function isUpOrDownMarket(text: string, tags?: { slug?: string; label?: string }[] | null): boolean {
  if (tags?.some((tag) => /(^|-)up-or-down($|-)/i.test(tag.slug ?? "") || /\bup or down\b/i.test(tag.label ?? ""))) {
    return true;
  }
  return /\bup or down\b/i.test(text);
}

function inferWindow(text: string, startMs?: number | null, endMs?: number | null, tags?: { slug?: string }[] | null): WindowMin | null {
  if (tags) {
    const hasTag = (slugPattern: RegExp) => tags.some((t) => t.slug && slugPattern.test(t.slug));
    if (hasTag(/^5m$/i)) return 5;
    if (hasTag(/^15m$/i)) return 15;
    if (hasTag(/^1h$/i)) return 60;
  }

  const lower = text.toLowerCase();
  if (/\b(5m|5-min|5 min|5-minute|5 minute)\b/.test(lower)) return 5;
  if (/\b(15m|15-min|15 min|15-minute|15 minute)\b/.test(lower)) return 15;
  if (/\b(1h|1-hour|1 hour|60m|60 min|60-minute)\b/.test(lower)) return 60;
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
  if (opts.closed) return "resolved";
  if (opts.archived || !opts.active) return "resolved";
  if (opts.now >= opts.endDate) return "ended";
  if (opts.startDate && opts.now < opts.startDate) return "upcoming";
  if (opts.endDate - opts.now <= 60_000) return "closing";
  return "live";
}

function statusToState(status: PolymarketMarketStatus): Market["state"] {
  if (status === "upcoming") return "UPCOMING";
  if (status === "closing") return "CLOSING";
  if (status === "ended") return "ENDED";
  if (status === "awaiting_resolution") return "AWAITING_RESOLUTION";
  if (status === "resolved") return "RESOLVED";
  return "LIVE";
}

function mapOutcomeIndexes(outcomes: string[]): Record<Outcome, number> | null {
  const normalized = outcomes.map((outcome) => outcome.toLowerCase());
  const up = normalized.findIndex((outcome) => /\bup\b/.test(outcome));
  const down = normalized.findIndex((outcome) => /\bdown\b/.test(outcome));
  if (up >= 0 && down >= 0 && up !== down) return { UP: up, DOWN: down };
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
