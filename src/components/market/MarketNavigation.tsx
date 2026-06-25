import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Market } from "@/lib/sim/types";
import { useTimezone, formatTime } from "@/hooks/use-timezone";

interface MarketNavigationProps {
  currentMarketId: string;
  markets: Record<string, Market>;
  currentAsset: string;
  currentWindow: number;
}

export function MarketNavigation({ currentMarketId, markets, currentAsset, currentWindow }: MarketNavigationProps) {
  const [tz] = useTimezone();
  const [showPast, setShowPast] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const { resolved, pills, liveMarket } = useMemo(() => {
    const sameKind = Object.values(markets)
      .filter((m) => m.asset === currentAsset && m.windowMin === currentWindow)
      .sort((a, b) => a.endDate - b.endDate);

    const resolved = sameKind
      .filter((m) => m.status === "resolved")
      .sort((a, b) => b.endDate - a.endDate);

    const liveMarket = sameKind.find((m) => m.status === "live" || m.status === "closing");

    // Build pills: show expired before live, live, then upcoming after
    const liveIdx = liveMarket ? sameKind.indexOf(liveMarket) : -1;
    let pillStart = Math.max(0, liveIdx - 1);
    let pillEnd = Math.min(sameKind.length, pillStart + 4);
    if (pillEnd - pillStart < 4 && pillStart > 0) {
      pillStart = Math.max(0, pillEnd - 4);
    }
    const pills = sameKind.slice(pillStart, pillEnd);

    return { resolved, pills, liveMarket };
  }, [markets, currentAsset, currentWindow]);

  const recentResolved = resolved.slice(0, 4);

  return (
    <nav className="market-nav" aria-label="Navigation entre marchés">
      <div className="market-nav__row">
        {/* Past dropdown */}
        <div className="market-nav__past-wrap">
          <button
            type="button"
            className="market-nav__past-btn"
            onClick={() => setShowPast(!showPast)}
            aria-expanded={showPast}
          >
            Passé
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className={`market-nav__chevron ${showPast ? "market-nav__chevron--open" : ""}`}>
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showPast && (
            <div className="market-nav__dropdown">
              {resolved.length === 0 ? (
                <div className="market-nav__dropdown-empty">Aucun marché résolu</div>
              ) : (
                resolved.slice(0, 20).map((m) => (
                  <Link
                    key={m.id}
                    to="/market/$marketId"
                    params={{ marketId: m.id }}
                    className="market-nav__dropdown-item"
                    onClick={() => setShowPast(false)}
                  >
                    <span className={`market-nav__dot ${m.resolvedOutcome === "UP" ? "market-nav__dot--up" : "market-nav__dot--down"}`} />
                    <span className={`market-nav__arrow ${m.resolvedOutcome === "UP" ? "text-up" : "text-down"}`}>
                      {m.resolvedOutcome === "UP" ? "↑" : "↓"}
                    </span>
                    <span className="market-nav__dropdown-time num">{formatTime(m.endDate, tz)}</span>
                    <span className="market-nav__dropdown-outcome">{m.resolvedOutcome}</span>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        {/* Recent resolved shortcuts */}
        <div className="market-nav__shortcuts">
          {recentResolved.map((m) => (
            <Link
              key={m.id}
              to="/market/$marketId"
              params={{ marketId: m.id }}
              className={`market-nav__shortcut ${m.id === currentMarketId ? "market-nav__shortcut--active" : ""}`}
            >
              <span className={`market-nav__arrow-sm ${m.resolvedOutcome === "UP" ? "text-up" : "text-down"}`}>
                {m.resolvedOutcome === "UP" ? "↑" : "↓"}
              </span>
              <span className="num">{formatTime(m.endDate, tz)}</span>
            </Link>
          ))}
        </div>

        {/* Time pills */}
        <div className="market-nav__pills">
          {pills.map((m) => {
            const isActive = m.id === currentMarketId;
            const isLive = m.status === "live" || m.status === "closing";
            const isResolved = m.status === "resolved";
            const isResolving = m.status === "ended" || m.state === "AWAITING_RESOLUTION";
            return (
              <Link
                key={m.id}
                to="/market/$marketId"
                params={{ marketId: m.id }}
                className={[
                  "market-nav__pill",
                  isActive ? "market-nav__pill--active" : "",
                  isLive ? "market-nav__pill--live" : "",
                  isResolved ? "market-nav__pill--resolved" : "",
                  isResolving ? "market-nav__pill--resolving" : "",
                ].filter(Boolean).join(" ")}
              >
                {isLive && isActive && <span className="market-nav__live-dot" />}
                <span className="num">{formatTime(m.startDate, tz)}</span>
                {isResolving && <span className="market-nav__resolving-icon" title="Résolution en cours">⏳</span>}
              </Link>
            );
          })}
        </div>

        {/* Live button */}
        {liveMarket && liveMarket.id !== currentMarketId && (
          <Link
            to="/market/$marketId"
            params={{ marketId: liveMarket.id }}
            className="market-nav__live-btn"
          >
            <span className="market-nav__live-dot" />
            Live
          </Link>
        )}

        {/* More dropdown */}
        <div className="market-nav__more-wrap">
          <button
            type="button"
            className="market-nav__more-btn"
            onClick={() => setShowMore(!showMore)}
            aria-expanded={showMore}
          >
            More
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className={`market-nav__chevron ${showMore ? "market-nav__chevron--open" : ""}`}>
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showMore && (
            <div className="market-nav__dropdown market-nav__dropdown--right">
              {Object.values(markets)
                .filter((m) => m.asset === currentAsset && m.windowMin === currentWindow && m.status === "upcoming")
                .sort((a, b) => a.startDate - b.startDate)
                .slice(0, 20)
                .map((m) => (
                  <Link
                    key={m.id}
                    to="/market/$marketId"
                    params={{ marketId: m.id }}
                    className="market-nav__dropdown-item"
                    onClick={() => setShowMore(false)}
                  >
                    <span className="market-nav__dropdown-time num">{formatTime(m.startDate, tz)} – {formatTime(m.endDate, tz)}</span>
                    <span className="market-nav__dropdown-status">À venir</span>
                  </Link>
                ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
