import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Market, PolymarketOrderType, Outcome, Side } from "@/lib/sim/types";
import { estimateExecution } from "@/lib/sim/matching";
import { selectMidpoint, useSimStore } from "@/lib/store/sim-store";

export function OrderTicket({ market }: { market: Market }) {
  const book = useSimStore((state) => state.books[market.id]);
  const placeOrder = useSimStore((state) => state.placeOrder);
  const portfolio = useSimStore((state) => state.portfolio);

  const [outcome, setOutcome] = useState<Outcome>("UP");
  const [side, setSide] = useState<Side>("BUY");
  const [selectedType, setSelectedType] = useState<"MARKET" | PolymarketOrderType>("MARKET");
  const [gtdMinutes, setGtdMinutes] = useState(5);
  const [size, setSize] = useState(10);
  const [limitCents, setLimitCents] = useState(50);
  const [postOnly, setPostOnly] = useState(false);

  const outcomeBook = book?.[outcome];
  const mid = selectMidpoint(book, outcome);
  const available = portfolio.cash - portfolio.reserved;
  const position = portfolio.positions.find((item) => item.tokenId === market.clobTokenIds[outcome]);

  const estimate = useMemo(() => {
    if (!outcomeBook) return null;
    const estType = selectedType === "MARKET" ? "FAK" : selectedType;
    const estLimit = selectedType === "MARKET" ? undefined : limitCents / 100;
    return estimateExecution({
      side,
      size,
      book: outcomeBook,
      limitPrice: estLimit,
      feeRateBps: postOnly && (selectedType === "GTC" || selectedType === "GTD") ? 0 : market.feeRateBps,
    });
  }, [outcomeBook, side, size, selectedType, limitCents, postOnly, market.feeRateBps]);

  const submit = () => {
    const isMarket = selectedType === "MARKET";
    const storeType = isMarket ? "FAK" : selectedType;
    const storeLimit = isMarket ? undefined : limitCents;
    const res = placeOrder({
      marketId: market.id,
      outcome,
      side,
      type: storeType,
      sizeShares: size,
      limitCents: storeLimit,
      postOnly: !isMarket && postOnly,
      expiresAt: selectedType === "GTD" ? Date.now() + gtdMinutes * 60_000 : undefined,
    });
    if (!res.ok) toast.error(res.message ?? "Ordre rejeté");
    else toast.success(`${side} ${size} ${market.outcomeLabels[outcome]} envoyé`);
  };

  const canTrade = market.state === "LIVE" || market.state === "CLOSING";

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <OutcomeButton active={outcome === "UP"} tone="up" onClick={() => setOutcome("UP")} label={market.outcomeLabels.UP} />
        <OutcomeButton active={outcome === "DOWN"} tone="down" onClick={() => setOutcome("DOWN")} label={market.outcomeLabels.DOWN} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {(["BUY", "SELL"] as Side[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSide(value)}
            className={`h-9 rounded-md border font-semibold ${side === value ? "border-primary bg-primary text-primary-foreground" : "border-hairline text-muted-foreground"}`}
          >
            {value === "BUY" ? "Acheter" : "Vendre"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Type d'ordre</span>
          <select value={selectedType} onChange={(event) => setSelectedType(event.target.value as any)} className="h-9 w-full rounded-md border border-hairline bg-surface-2 px-2 text-xs">
            <option value="MARKET">Market (FAK)</option>
            <option value="GTC">Limit GTC</option>
            <option value="GTD">Limit GTD</option>
            <option value="FOK">FOK (Fill-Or-Kill)</option>
            <option value="FAK">FAK (Immediate-Or-Cancel / Fill-And-Kill)</option>
          </select>
        </label>
      </div>

      {selectedType === "GTD" && (
        <NumberInput label="Expiration GTD (min)" min={1} max={180} value={gtdMinutes} onChange={setGtdMinutes} />
      )}

      {selectedType !== "MARKET" && (
        <div className="space-y-2">
          <NumberInput
            label="Prix limite (¢)"
            min={0.1}
            max={99.9}
            step={market.tickSize * 100}
            value={limitCents}
            onChange={setLimitCents}
          />
          {(selectedType === "GTC" || selectedType === "GTD") && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={postOnly} onChange={(event) => setPostOnly(event.target.checked)} />
              Post-only maker
            </label>
          )}
        </div>
      )}

      <NumberInput label="Shares" min={market.orderMinSize} max={100_000} value={size} onChange={setSize} />

      <div className="grid grid-cols-5 gap-1">
        {[1, 5, 10, 50, 100].map((value) => (
          <button key={value} type="button" onClick={() => setSize((current) => current + value)} className="rounded border border-hairline bg-surface-2 py-1 text-xs">
            +{value}
          </button>
        ))}
      </div>

      <div className="space-y-1 border-t border-hairline pt-2 text-xs">
        <Row label="Disponible" value={`$${available.toFixed(2)}`} />
        <Row label="Mid" value={mid != null ? `${Math.round(mid * 100)}¢` : "—"} />
        {position && <Row label="Position" value={`${position.size.toFixed(2)} @ ${Math.round(position.avgPrice * 100)}¢`} />}
        {estimate && (
          <>
            <Row label="Remplissable" value={`${estimate.fillable.toFixed(2)} / ${size}`} />
            <Row label={side === "BUY" ? "Coût estimé" : "Produit estimé"} value={`$${estimate.cost.toFixed(2)}`} />
            <Row label="Frais estimés" value={`$${estimate.fee.toFixed(5)}`} />
            <Row label="Slippage" value={`${(estimate.slippage * 100).toFixed(2)}¢`} />
            <Row label="Break-even" value={estimate.fillable > 0 ? `${Math.round(((estimate.cost + estimate.fee) / estimate.fillable) * 100)}¢` : "—"} />
          </>
        )}
      </div>

      <button
        type="button"
        disabled={!canTrade || !outcomeBook}
        onClick={submit}
        className="h-10 w-full rounded-md bg-primary font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        Envoyer l’ordre paper
      </button>
    </div>
  );
}

function OutcomeButton({ active, tone, label, onClick }: { active: boolean; tone: "up" | "down"; label: string; onClick: () => void }) {
  const activeClass = tone === "up" ? "border-up bg-up text-background" : "border-down bg-down text-background";
  const idleClass = tone === "up" ? "border-hairline text-up" : "border-hairline text-down";
  return (
    <button type="button" onClick={onClick} className={`h-10 truncate rounded-md border px-2 text-sm font-semibold ${active ? activeClass : idleClass}`}>
      {label}
    </button>
  );
}

function NumberInput({
  label,
  min,
  max,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const handleChange = (val: number) => {
    const rounded = Math.round(val / step) * step;
    const precision = step.toString().split(".")[1]?.length || 0;
    const finalVal = Number(rounded.toFixed(precision));
    onChange(Math.max(min, Math.min(max, finalVal)));
  };

  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => handleChange(Number(event.target.value))}
        className="num h-9 w-full rounded-md border border-hairline bg-surface-2 px-3 text-center"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="num text-right">{value}</span>
    </div>
  );
}
