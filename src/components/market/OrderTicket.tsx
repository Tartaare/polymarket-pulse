import { useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import type { Market, Outcome, Side } from "@/lib/sim/types";
import { estimateExecution } from "@/lib/sim/matching";
import { selectDisplayPrice, selectMidpoint, useSimStore } from "@/lib/store/sim-store";

type TicketMode = "limit" | "market" | "1tap";

const ASSET_ICONS: Record<string, string> = { BTC: "₿", ETH: "Ξ", SOL: "◎" };

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

export function OrderTicket({ market }: { market: Market }) {
  const book = useSimStore((s) => s.books[market.id]);
  const placeOrder = useSimStore((s) => s.placeOrder);
  const portfolio = useSimStore((s) => s.portfolio);

  const [outcome, setOutcome] = useState<Outcome>("UP");
  const [side, setSide] = useState<Side>("BUY");
  const [ticketMode, setTicketMode] = useState<TicketMode>("limit");
  const [limitCents, setLimitCents] = useState(50);
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

  // CTA label
  const ctaLabel = side === "BUY" ? `Acheter ${outcome}` : `Vendre ${outcome}`;

  // Bidirectional shares <-> dollars for limit orders
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

  // Limit estimate
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

  // Market estimate
  const marketEstimate = useMemo(() => {
    if (!outcomeBook || ticketMode !== "market") return null;
    // Convert dollars to approximate shares using mid price
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

  // Potential gain calculation
  const potentialGain = (costOrShares: number, price: number): number => {
    // Each share pays out $1 if correct, cost is shares * price
    const shareCount = costOrShares;
    return Math.max(0, shareCount * (1 - price));
  };

  // Expiration timestamp
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

  // Submit limit order
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
    else toast.success(`${ctaLabel} — ${shares} shares @ ${limitCents}¢`);
  };

  // Submit market order
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

  // Submit 1-tap
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
      {/* Header */}
      <div className="order-ticket__header">
        <span className="order-ticket__icon">{assetIcon}</span>
        <span className="order-ticket__title">{market.asset} Up/Down</span>
        <span className={`order-ticket__status ${outcome === "UP" ? "text-up" : "text-down"}`}>
          {outcome}
        </span>
      </div>

      {/* Buy/Sell tabs */}
      <div className="order-ticket__side-tabs">
        {(["BUY", "SELL"] as Side[]).map((s) => (
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

      {/* Order type selector */}
      <div className="order-ticket__type-row">
        {(["limit", "market", "1tap"] as TicketMode[]).map((m) => (
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

      {/* Outcome selector */}
      <div className="order-ticket__outcomes">
        <button
          type="button"
          onClick={() => setOutcome("UP")}
          className={`order-ticket__outcome ${outcome === "UP" ? "order-ticket__outcome--up-active" : "order-ticket__outcome--up"}`}
        >
          <span className="order-ticket__outcome-label">{market.outcomeLabels.UP}</span>
          <span className="order-ticket__outcome-price num">{upPrice != null ? `${Math.round(upPrice * 100)}¢` : "—"}</span>
        </button>
        <button
          type="button"
          onClick={() => setOutcome("DOWN")}
          className={`order-ticket__outcome ${outcome === "DOWN" ? "order-ticket__outcome--down-active" : "order-ticket__outcome--down"}`}
        >
          <span className="order-ticket__outcome-label">{market.outcomeLabels.DOWN}</span>
          <span className="order-ticket__outcome-price num">{downPrice != null ? `${Math.round(downPrice * 100)}¢` : "—"}</span>
        </button>
      </div>

      {/* === LIMIT MODE === */}
      {ticketMode === "limit" && (
        <div className="order-ticket__body">
          {/* Limit price */}
          <div className="order-ticket__field">
            <label className="order-ticket__label">Prix limite</label>
            <div className="order-ticket__stepper">
              <button type="button" onClick={() => setLimitCents(Math.max(1, limitCents - 1))} className="order-ticket__step-btn">−</button>
              <span className="order-ticket__step-value num">{limitCents}¢</span>
              <button type="button" onClick={() => setLimitCents(Math.min(99, limitCents + 1))} className="order-ticket__step-btn">+</button>
            </div>
          </div>

          {/* Shares */}
          <div className="order-ticket__field">
            <label className="order-ticket__label">Positions</label>
            <input
              type="number"
              min={1}
              value={shares}
              onChange={(e) => updateDollarsFromShares(Math.max(1, Number(e.target.value)))}
              className="order-ticket__input num"
            />
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
          </div>

          {/* Dollar amount */}
          <div className="order-ticket__field">
            <label className="order-ticket__label">Montant ($)</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={dollarAmount ?? ""}
              placeholder={`~$${(shares * limitCents / 100).toFixed(2)}`}
              onChange={(e) => updateSharesFromDollars(Math.max(0, Number(e.target.value)))}
              className="order-ticket__input num"
            />
          </div>

          {/* Expiration */}
          <div className="order-ticket__field">
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

          {/* Summary */}
          <div className="order-ticket__summary">
            <SummaryRow label="Disponible" value={`$${available.toFixed(2)}`} />
            <SummaryRow label="Mid" value={mid != null ? `${Math.round(mid * 100)}¢` : "—"} />
            {position && <SummaryRow label="Position" value={`${position.size.toFixed(2)} @ ${Math.round(position.avgPrice * 100)}¢`} />}
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
          <div className="order-ticket__field">
            <label className="order-ticket__label">Montant ($)</label>
            <input
              type="number"
              min={1}
              value={marketDollars}
              onChange={(e) => setMarketDollars(Math.max(1, Number(e.target.value)))}
              className="order-ticket__input order-ticket__input--lg num"
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

          {/* Summary */}
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
          <p className="order-ticket__1tap-title">One-tap buy</p>
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

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`order-ticket__row ${accent ? "order-ticket__row--accent" : ""}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
