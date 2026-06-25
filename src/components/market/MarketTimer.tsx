import { useEffect, useState } from "react";

interface MarketTimerProps {
  endDate: number;
  isLive: boolean;
  className?: string;
}

export function MarketTimer({ endDate, isLive, className }: MarketTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [isLive]);

  const remaining = Math.max(0, endDate - now);
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const isUrgent = remaining > 0 && remaining < 30_000;
  const isExpired = remaining <= 0;

  if (!isLive) {
    return (
      <div className={`market-timer market-timer--inactive ${className ?? ""}`}>
        <div className="market-timer__digits">
          <span className="market-timer__value num">--</span>
          <span className="market-timer__label">MIN</span>
        </div>
        <span className="market-timer__separator">:</span>
        <div className="market-timer__digits">
          <span className="market-timer__value num">--</span>
          <span className="market-timer__label">SECS</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "market-timer",
        isUrgent ? "market-timer--urgent" : "",
        isExpired ? "market-timer--expired" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="timer"
      aria-live="polite"
      aria-label={`${mins} minutes ${secs} secondes restantes`}
    >
      <div className="market-timer__digits">
        <span className="market-timer__value num">{String(mins).padStart(2, "0")}</span>
        <span className="market-timer__label">MIN</span>
      </div>
      <span className="market-timer__separator num">:</span>
      <div className="market-timer__digits">
        <span className="market-timer__value num">{String(secs).padStart(2, "0")}</span>
        <span className="market-timer__label">SECS</span>
      </div>
    </div>
  );
}
