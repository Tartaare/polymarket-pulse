import { useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import type { Market, Outcome, Side } from "@/lib/sim/types";
import { estimateExecution } from "@/lib/sim/matching";
import { selectDisplayPrice, selectMidpoint, useSimStore } from "@/lib/store/sim-store";

type TicketMode = "limit" | "market" | "1tap";

const ASSET_ICONS: Record<string, string> = { BTC: "₿", ETH: "Ξ", SOL: "◎" };
const MIN_LIMIT_CENTS = 1;
const MAX_LIMIT_CENTS = 99;
const REQUESTED_LIMIT_STEP_CENTS = 0.1;

const LIMIT_EXPIRATIONS = [
  { label: "Jamais", value: null },
  { label: "1 min", value: 1 },
  { label: "5 min", value: 5 },
  { label: "1 heure", value: 60 },
  { label: "12 heures", value: 720 },
  { label: "24 heures", value: 1440 },
  { label: "Fin de journée", value: -1 },
] as const;

const MARKET_AMOUNTS = [1, 5, 10, 50, 100, 200, 500, 1000];
const TAP_AMOUNTS = [5, 10, 25, 50, 100, 200, 500, 1000];
const OUTCOMES: Outcome[] = ["UP", "DOWN"];
const SIDES: Side[] = ["BUY", "SELL"];
const TICKET_MODES: TicketMode[] = ["limit", "market", "1tap"];

export function OrderTicket({ market }: { market: Market }) {
  const book = useSimStore((s) => s.books[market.id]);
  const placeOrder = useSimStore((s) => s.placeOrder);
  const portfolio = useSimStore((s) => s.portfolio);

  const [outcome, setOutcome] = useState<Outcome>("UP");
  const [side, setSide] = useState<Side>("BUY");
  const [ticketMode, setTicketMode] = useState<TicketMode>("limit");
  const [limitCents, setLimitCents] = useState(() => snapLimitCents(50, market.tickSize));
  const [shares, setShares] = useState(10);
  const [dollarAmount, setDollarAmount] = useState<number | null>(null);
  const [expirationIdx, setExpirationIdx] = useState(0);
  const [marketDollars, setMarketDollars] = useState(10);

  const outcomeBook = book?.[outcome];
  const mid = selectMidpoint(book, outcome);
  const upPrice = selectDisplayPrice(book, "UP") ?? market.outcomePrices.UP;
  const downPrice = selectDisplayPrice(book, "DOWN") ?? market.outcomePrices.DOWN;
  const available = portfolio.cash - portfolio.reserved;
  const position = portfolio.positions.find((p) => p.tokenId === market.clobTokenIds[outcome]);
  const canTrade = market.state === "LIVE" || market.state === "CLOSING";
  const assetIcon = ASSET_ICONS[market.asset] ?? market.asset[0];
  const marketTitle = getMarketTitle(market);
  const limitStepCents = getLimitStepCents(market.tickSize);
  const ctaLabel = side === "BUY" ? `Acheter ${outcome}` : `Vendre ${outcome}`;

  const updateLimitCents = useCallback(
    (nextCents: number) => {
      const snapped = snapLimitCents(nextCents, market.tickSize);
      setLimitCents(snapped);
      setDollarAmount((current) => (current == null ? current : Number((shares * (snapped / 100)).toFixed(2))));
    },
    [market.tickSize, shares],
  );

  const updateSharesFromDollars = useCallback(
    (dollars: number) => {
      const price = limitCents / 100;
      if (price > 0) {
        setShares(Math.max(1, Math.floor(dollars / price)));
      }
      setDollarAmount(dollars);
    },
    [limitCents],
  );

  const updateDollarsFromShares = useCallback(
    (newShares: number) => {
      const price = limitCents / 100;
      setShares(newShares);
      setDollarAmount(Number((newShares * price).toFixed(2)));
    },
    [limitCents],
  );

  const limitEstimate = useMemo(() => {
    if (!outcomeBook || ticketMode !== "limit") return null;
    return estimateExecution({
      side,
      size: shares,
      book: outcomeBook,
      limitPrice: limitCents / 100,
      feeRateBps: market.feeRateBps,
    });
  }, [outcomeBook, side, shares, limitCents, market.feeRateBps, ticketMode]);
  const matchedShares = limitEstimate?.fillable ?? 0;

  const marketEstimate = useMemo(() => {
    if (!outcomeBook || ticketMode !== "market") return null;
    const price = mid ?? 0.5;
    const approxShares = price > 0 ? Math.floor(marketDollars / price) : 0;
    if (approxShares <= 0) return null;
    return estimateExecution({
      side,
      size: approxShares,
      book: outcomeBook,
      feeRateBps: market.feeRateBps,
    });
  }, [outcomeBook, side, marketDollars, mid, market.feeRateBps, ticketMode]);

  const potentialGain = (costOrShares: number, price: number): number => {
    const shareCount = costOrShares;
    return Math.max(0, shareCount * (1 - price));
  };

  const getExpiresAt = (): number | undefined => {
    const exp = LIMIT_EXPIRATIONS[expirationIdx];
    if (!exp || exp.value === null) return undefined;
    if (exp.value === -1) {
      // End of day in user's timezone
      const now = new Date();
      const eod = new Date(now);
      eod.setHours(23, 59, 59, 999);
      return eod.getTime();
    }
    return Date.now() + exp.value * 60_000;
  };

  const submitLimit = () => {
    const res = placeOrder({
      marketId: market.id,
      outcome,
      side,
      type: expirationIdx === 0 ? "GTC" : "GTD",
      sizeShares: shares,
      limitCents,
      expiresAt: getExpiresAt(),
    });
    if (!res.ok) toast.error(res.message ?? "Ordre rejeté");
    else toast.success(`${ctaLabel} — ${shares} parts @ ${formatCents(limitCents)}`);
  };

  const submitMarket = () => {
    const price = mid ?? 0.5;
    const approxShares = price > 0 ? Math.max(1, Math.floor(marketDollars / price)) : 0;
    const res = placeOrder({
      marketId: market.id,
      outcome,
      side,
      type: "FAK",
      sizeShares: approxShares,
    });
    if (!res.ok) toast.error(res.message ?? "Ordre rejeté");
    else toast.success(`${ctaLabel} — ~$${marketDollars}`);
  };

  const submit1Tap = (amount: number) => {
    const price = mid ?? 0.5;
    const approxShares = price > 0 ? Math.max(1, Math.floor(amount / price)) : 0;
    const res = placeOrder({
      marketId: market.id,
      outcome,
      side: "BUY",
      type: "FAK",
      sizeShares: approxShares,
    });
    if (!res.ok) toast.error(res.message ?? "Ordre rejeté");
    else toast.success(`1-Tap ${outcome} — $${amount}`);
  };

  return (
    <div className="order-ticket">
      <div className="order-ticket__header">
        <span className="order-ticket__icon">{assetIcon}</span>
        <div className="order-ticket__market-copy">
          <span className="order-ticket__title">{marketTitle}</span>
          <span className={`order-ticket__status ${outcome === "UP" ? "text-up" : "text-down"}`}>{outcome}</span>
        </div>
      </div>

      <div className="order-ticket__side-tabs">
        {SIDES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={`order-ticket__side-tab ${side === s ? "order-ticket__side-tab--active" : ""}`}
          >
            {s === "BUY" ? "Acheter" : "Vendre"}
          </button>
        ))}
      </div>

      <div className="order-ticket__type-row">
        {TICKET_MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setTicketMode(m)}
            className={`order-ticket__type-btn ${ticketMode === m ? "order-ticket__type-btn--active" : ""}`}
          >
            {m === "limit" ? "Limite" : m === "market" ? "Marché" : "1-Tap"}
          </button>
        ))}
      </div>

      <div className="order-ticket__outcomes">
        {OUTCOMES.map((nextOutcome) => {
          const selected = outcome === nextOutcome;
          const displayPrice = nextOutcome === "UP" ? upPrice : downPrice;
          return (
            <button
              key={nextOutcome}
              type="button"
              aria-pressed={selected}
              onClick={() => setOutcome(nextOutcome)}
              className={`order-ticket__outcome ${
                selected ? `order-ticket__outcome--${nextOutcome.toLowerCase()}-active` : ""
              }`}
            >
              <span className="order-ticket__outcome-label">{market.outcomeLabels[nextOutcome]}</span>
              <span className="order-ticket__outcome-price num">{displayPrice != null ? formatCents(displayPrice * 100) : "--¢"}</span>
            </button>
          );
        })}
      </div>

      {ticketMode === "limit" && (
        <div className="order-ticket__body">
          <div className="order-ticket__field order-ticket__field--line">
            <label className="order-ticket__label">Prix limite</label>
            <div className="order-ticket__stepper">
              <button
                type="button"
                aria-label="Diminuer le prix limite"
                onClick={() => updateLimitCents(limitCents - limitStepCents)}
                className="order-ticket__step-btn"
              >
                -
              </button>
              <input
                type="number"
                min={MIN_LIMIT_CENTS}
                max={MAX_LIMIT_CENTS}
                step={limitStepCents}
                value={formatInputNumber(limitCents)}
                onChange={(e) => updateLimitCents(Number(e.target.value))}
                className="order-ticket__price-input num"
                aria-label="Prix limite en centimes"
              />
              <span className="order-ticket__cent-sign">¢</span>
              <button
                type="button"
                aria-label="Augmenter le prix limite"
                onClick={() => updateLimitCents(limitCents + limitStepCents)}
                className="order-ticket__step-btn"
              >
                +
              </button>
            </div>
          </div>

          <div className="order-ticket__field order-ticket__field--positions">
            <div className="order-ticket__field-line">
              <label className="order-ticket__label">Positions</label>
              <input
                type="number"
                min={1}
                value={shares}
                onChange={(e) => updateDollarsFromShares(Math.max(1, Number(e.target.value)))}
                className="order-ticket__input order-ticket__input--inline num"
              />
            </div>
            <div className="order-ticket__quick-btns">
              {[-100, -10, 10, 100].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => updateDollarsFromShares(Math.max(1, shares + v))}
                  className="order-ticket__quick-btn"
                >
                  {v > 0 ? `+${v}` : v}
                </button>
              ))}
            </div>
            {shares > 0 && (
              <div className="order-ticket__match-line">
                <span
                  className={`order-ticket__match-badge num ${outcome === "UP" ? "text-up" : "text-down"}`}
                  title={`${formatShares(matchedShares)} parts de cet ordre seront exécutées directement`}
                  aria-label={`${formatShares(matchedShares)} parts de cet ordre seront exécutées directement`}
                >
                  {formatShares(matchedShares)} correspondant
                </span>
              </div>
            )}
          </div>

          <div className="order-ticket__field order-ticket__field--line">
            <label className="order-ticket__label">Montant ($)</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={dollarAmount ?? ""}
              placeholder={`~$${(shares * limitCents / 100).toFixed(2)}`}
              onChange={(e) => updateSharesFromDollars(Math.max(0, Number(e.target.value)))}
              className="order-ticket__input order-ticket__input--inline num"
            />
          </div>

          <div className="order-ticket__field order-ticket__field--line">
            <label className="order-ticket__label">Expiration</label>
            <select
              value={expirationIdx}
              onChange={(e) => setExpirationIdx(Number(e.target.value))}
              className="order-ticket__select"
            >
              {LIMIT_EXPIRATIONS.map((exp, idx) => (
                <option key={idx} value={idx}>{exp.label}</option>
              ))}
            </select>
          </div>

          <div className="order-ticket__summary">
            <SummaryRow label="Disponible" value={`$${available.toFixed(2)}`} />
            <SummaryRow label="Mid" value={mid != null ? formatCents(mid * 100) : "—"} />
            {position && <SummaryRow label="Position" value={`${position.size.toFixed(2)} @ ${formatCents(position.avgPrice * 100)}`} />}
            <SummaryRow label="Total" value={`$${(shares * limitCents / 100).toFixed(2)}`} accent />
            <SummaryRow
              label="Gain potentiel"
              value={`$${potentialGain(shares, limitCents / 100).toFixed(2)}`}
              accent
            />
          </div>

          <button
            type="button"
            disabled={!canTrade || !outcomeBook}
            onClick={submitLimit}
            className="order-ticket__cta"
          >
            {ctaLabel}
          </button>
        </div>
      )}

      {/* === MARKET MODE === */}
      {ticketMode === "market" && (
        <div className="order-ticket__body">
          <div className="order-ticket__field order-ticket__field--line">
            <label className="order-ticket__label">Montant ($)</label>
            <input
              type="number"
              min={1}
              value={marketDollars}
              onChange={(e) => setMarketDollars(Math.max(1, Number(e.target.value)))}
              className="order-ticket__input order-ticket__input--inline num"
            />
          </div>
          <div className="order-ticket__quick-btns order-ticket__quick-btns--wide">
            {MARKET_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setMarketDollars(marketDollars + v)}
                className="order-ticket__quick-btn"
              >
                +${v}
              </button>
            ))}
          </div>

          <div className="order-ticket__summary">
            <SummaryRow label="Disponible" value={`$${available.toFixed(2)}`} />
            {marketEstimate && (
              <>
                <SummaryRow label="Shares estimées" value={marketEstimate.fillable.toFixed(1)} />
                <SummaryRow label="Coût estimé" value={`$${marketEstimate.cost.toFixed(2)}`} />
                <SummaryRow label="Frais" value={`$${marketEstimate.fee.toFixed(4)}`} />
              </>
            )}
          </div>

          <button
            type="button"
            disabled={!canTrade || !outcomeBook}
            onClick={submitMarket}
            className="order-ticket__cta"
          >
            {ctaLabel}
          </button>
        </div>
      )}

      {/* === 1-TAP MODE === */}
      {ticketMode === "1tap" && (
        <div className="order-ticket__body">
          <p className="order-ticket__1tap-title">One-tap buy {outcome}</p>
          <div className="order-ticket__1tap-grid">
            {TAP_AMOUNTS.map((amount) => {
              const price = mid ?? 0.5;
              const approxShares = price > 0 ? Math.floor(amount / price) : 0;
              const gain = potentialGain(approxShares, price);
              return (
                <button
                  key={amount}
                  type="button"
                  disabled={!canTrade || !outcomeBook}
                  onClick={() => submit1Tap(amount)}
                  className="order-ticket__1tap-btn"
                >
                  <span className="order-ticket__1tap-amount num">${amount}</span>
                  <span className="order-ticket__1tap-gain num text-up">gagne ${gain.toFixed(0)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getMarketTitle(market: Market): string {
  const windowLabel = market.windowMin === 60 ? "1 h" : `${market.windowMin} min`;
  return `${market.asset} vers le haut ou vers le bas ${windowLabel}`;
}

function getLimitStepCents(tickSize: number): number {
  return Math.max(REQUESTED_LIMIT_STEP_CENTS, tickSize * 100);
}

function snapLimitCents(value: number, tickSize: number): number {
  if (!Number.isFinite(value)) return MIN_LIMIT_CENTS;
  const tickCents = Math.max(REQUESTED_LIMIT_STEP_CENTS, tickSize * 100);
  const clamped = Math.min(MAX_LIMIT_CENTS, Math.max(MIN_LIMIT_CENTS, value));
  return Number((Math.round(clamped / tickCents) * tickCents).toFixed(3));
}

function formatCents(value: number): string {
  if (!Number.isFinite(value)) return "--¢";
  const rounded = Number(value.toFixed(2));
  const formatted = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0$/, "");
  return `${formatted}¢`;
}

function formatInputNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/0$/, "");
}

function formatShares(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`order-ticket__row ${accent ? "order-ticket__row--accent" : ""}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
