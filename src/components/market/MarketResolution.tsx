interface MarketResolutionProps {
  marketQuestion: string;
  windowLabel: string;
  resolvedOutcome?: "UP" | "DOWN";
  isAwaitingResolution: boolean;
}

export function MarketResolution({
  marketQuestion,
  windowLabel,
  resolvedOutcome,
  isAwaitingResolution,
}: MarketResolutionProps) {
  if (isAwaitingResolution) {
    return (
      <div className="market-resolution" role="status" aria-live="polite">
        <div className="market-resolution__icon">
          <svg className="market-resolution__spinner" viewBox="0 0 24 24" fill="none" width="32" height="32">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="50 20" />
          </svg>
        </div>
        <h3 className="market-resolution__title">Hold on, determining winner…</h3>
        <p className="market-resolution__market">{marketQuestion}</p>
        <p className="market-resolution__subtitle">{windowLabel}</p>
        <p className="market-resolution__hint">
          Le marché est terminé. La résolution finale apparaîtra automatiquement.
        </p>
      </div>
    );
  }

  if (resolvedOutcome) {
    const isUp = resolvedOutcome === "UP";
    return (
      <div className="market-resolution market-resolution--resolved" role="status">
        <div className={`market-resolution__icon ${isUp ? "market-resolution__icon--up" : "market-resolution__icon--down"}`}>
          <svg viewBox="0 0 24 24" fill="none" width="32" height="32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="market-resolution__title">
          Outcome:{" "}
          <span className={isUp ? "text-up" : "text-down"}>{resolvedOutcome}</span>
        </h3>
        <p className="market-resolution__market">{marketQuestion}</p>
        <p className="market-resolution__subtitle">{windowLabel}</p>
      </div>
    );
  }

  return null;
}
