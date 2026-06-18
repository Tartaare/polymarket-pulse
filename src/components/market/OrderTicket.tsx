import { useMemo, useState } from "react";
import type { Market, Outcome, OrderType, Side } from "@/lib/sim/types";
import { useSimStore, selectMidpoint } from "@/lib/store/sim-store";
import { totalCostBuy, calcFee } from "@/lib/sim/matching";
import { toast } from "sonner";

export function OrderTicket({ market }: { market: Market }) {
  const book = useSimStore((s) => s.books[market.id]);
  const placeOrder = useSimStore((s) => s.placeOrder);
  const portfolio = useSimStore((s) => s.portfolio);

  const [outcome, setOutcome] = useState<Outcome>("UP");
  const [side, setSide] = useState<Side>("BUY");
  const [type, setType] = useState<OrderType>("MARKET");
  const [size, setSize] = useState(10);
  const [limitCents, setLimitCents] = useState(50);
  const [postOnly, setPostOnly] = useState(false);

  const ob = book?.[outcome];
  const mid = selectMidpoint(book, outcome);
  const midCents = mid != null ? Math.round(mid * 100) : 50;

  const estimate = useMemo(() => {
    if (!ob) return null;
    if (side === "SELL") {
      // approximate at best bid
      const best = ob.bids[0]?.price ?? 0;
      const fee = calcFee(size, best);
      return { cost: size * best, fee, fillable: size };
    }
    if (type === "MARKET") {
      const { cost, canFill } = totalCostBuy({ size, filled: 0 } as any, ob);
      const avg = canFill > 0 ? cost / canFill : 0;
      return { cost, fee: calcFee(canFill, avg || 0.5), fillable: canFill };
    }
    if (type === "FOK") {
      const { cost, canFill } = totalCostBuy({ size, filled: 0 } as any, ob, limitCents / 100);
      const avg = canFill > 0 ? cost / canFill : 0;
      return { cost, fee: calcFee(canFill, avg || 0.5), fillable: canFill };
    }
    // LIMIT
    return {
      cost: size * (limitCents / 100),
      fee: postOnly ? 0 : calcFee(size, limitCents / 100),
      fillable: size,
    };
  }, [ob, side, type, size, limitCents, postOnly]);

  const submit = () => {
    const res = placeOrder({
      marketId: market.id,
      outcome,
      side,
      type,
      sizeShares: size,
      limitCents: type === "MARKET" ? undefined : limitCents,
      postOnly,
    });
    if (!res.ok) toast.error(res.message ?? "Order rejected");
    else toast.success(`${side} ${size} ${outcome} order placed`);
  };

  const available = portfolio.cash - portfolio.reserved;
  const position = portfolio.positions.find((p) => p.marketId === market.id && p.outcome === outcome);

  return (
    <div className="rounded-lg border border-hairline bg-surface p-3 text-sm space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { setOutcome("UP"); setLimitCents(midCents || 50); }}
          className={`py-2 rounded-md border text-sm font-semibold ${
            outcome === "UP"
              ? "bg-up text-background border-up"
              : "border-hairline text-up hover:bg-up/10"
          }`}
        >
          Up
        </button>
        <button
          onClick={() => { setOutcome("DOWN"); setLimitCents(midCents || 50); }}
          className={`py-2 rounded-md border text-sm font-semibold ${
            outcome === "DOWN"
              ? "bg-down text-background border-down"
              : "border-hairline text-down hover:bg-down/10"
          }`}
        >
          Down
        </button>
      </div>

      <div className="flex gap-1 text-xs">
        {(["BUY", "SELL"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 py-1 rounded ${side === s ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {s === "BUY" ? "Acheter" : "Vendre"}
          </button>
        ))}
        <select
          value={type}
          onChange={(e) => setType(e.target.value as OrderType)}
          className="ml-auto bg-surface-2 border border-hairline rounded px-2 py-1 text-xs"
        >
          <option value="MARKET">Marché</option>
          <option value="LIMIT">Limite</option>
          <option value="FOK">FOK</option>
        </select>
      </div>

      {type !== "MARKET" && (
        <div>
          <label className="text-xs text-muted-foreground">Prix limite (¢)</label>
          <div className="flex items-center gap-1 mt-1">
            <button
              type="button"
              onClick={() => setLimitCents((c) => Math.max(1, c - 1))}
              className="h-8 w-8 rounded bg-surface-2 border border-hairline"
            >−</button>
            <input
              type="number"
              min={1}
              max={99}
              value={limitCents}
              onChange={(e) => setLimitCents(Math.max(1, Math.min(99, Number(e.target.value))))}
              className="flex-1 h-8 bg-surface-2 border border-hairline rounded text-center num"
            />
            <button
              type="button"
              onClick={() => setLimitCents((c) => Math.min(99, c + 1))}
              className="h-8 w-8 rounded bg-surface-2 border border-hairline"
            >+</button>
          </div>
          {type === "LIMIT" && (
            <label className="text-xs flex items-center gap-2 mt-2 text-muted-foreground">
              <input type="checkbox" checked={postOnly} onChange={(e) => setPostOnly(e.target.checked)} />
              Post-only (maker, 0 fee)
            </label>
          )}
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground">Positions (shares)</label>
        <div className="flex items-center gap-1 mt-1">
          <input
            type="number"
            min={1}
            value={size}
            onChange={(e) => setSize(Math.max(1, Number(e.target.value)))}
            className="flex-1 h-9 bg-surface-2 border border-hairline rounded text-center num"
          />
        </div>
        <div className="flex gap-1 mt-1">
          {[1, 5, 10, 50, 100].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSize((s) => s + n)}
              className="flex-1 text-xs py-1 rounded bg-surface-2 border border-hairline hover:bg-accent"
            >+{n}</button>
          ))}
        </div>
      </div>

      <div className="text-xs space-y-1 border-t border-hairline pt-2">
        <Row label="Disponible" value={`$${available.toFixed(2)}`} />
        {position && position.size > 0 && (
          <Row label="Position actuelle" value={`${position.size.toFixed(0)} @ ${Math.round(position.avgPrice * 100)}¢`} />
        )}
        {estimate && (
          <>
            <Row label="Coût estimé" value={`$${estimate.cost.toFixed(2)}`} />
            <Row label="Frais (taker 7%)" value={`$${estimate.fee.toFixed(4)}`} />
            <Row label="Remplissable" value={`${estimate.fillable.toFixed(0)} / ${size}`} />
            <Row
              label="Pour gagner"
              value={`$${(estimate.fillable * 1 - estimate.cost - estimate.fee).toFixed(2)}`}
              accent="up"
            />
          </>
        )}
      </div>

      <button
        onClick={submit}
        className="w-full py-2.5 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90"
      >
        Négocier
      </button>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: "up" | "down" }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`num ${accent === "up" ? "text-up" : accent === "down" ? "text-down" : ""}`}>{value}</span>
    </div>
  );
}
