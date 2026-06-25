import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  CandlestickSeries,
  ColorType,
  LineStyle,
  type UTCTimestamp,
} from "lightweight-charts";
import { polymarketRtdsSocket, type CryptoPrice } from "@/lib/feed/polymarket-rtds-ws";
import type { Asset, Market, Outcome, Position } from "@/lib/sim/types";

export type ChartMode = "probability" | "price-line" | "price-candle";

interface MarketChartProps {
  market: Market;
  upProb: number | null;
  positions: Position[];
  className?: string;
}

interface PricePoint {
  time: UTCTimestamp;
  value: number;
}

interface CandlePoint {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

const CHART_COLORS = {
  bg: "#141619",
  grid: "rgba(43, 49, 57, 0.4)",
  text: "#707a8a",
  crosshair: "#929aa5",
  up: "#0ecb81",
  down: "#f6465d",
  probLine: "#FCD535",
  priceLine: "#eaecef",
  targetLine: "#929aa5",
};

/** Extract target price from market question via regex (e.g. "$107,234.56") */
function extractTargetPrice(question: string): number | null {
  const match = question.match(/\$[\d,]+\.?\d*/);
  if (!match) return null;
  const cleaned = match[0].replace(/[$,]/g, "");
  const val = parseFloat(cleaned);
  return Number.isFinite(val) ? val : null;
}

export function MarketChart({ market, upProb, positions, className }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | ISeriesApi<"Candlestick"> | null>(null);
  const targetLineRef = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]> | null>(null);
  const positionLinesRef = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]>[]>([]);
  const probDataRef = useRef<PricePoint[]>([]);
  const priceDataRef = useRef<PricePoint[]>([]);
  const candleDataRef = useRef<CandlePoint[]>([]);
  const currentCandleRef = useRef<CandlePoint | null>(null);

  const [mode, setMode] = useState<ChartMode>("probability");
  const [dataSource, setDataSource] = useState<"chainlink" | "binance" | "none">("none");
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [targetY, setTargetY] = useState<number | null>(null);

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return window.document.documentElement.classList.contains("light") ? "light" : "dark";
  });

  // Track document theme changes reactively
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isLight = window.document.documentElement.classList.contains("light");
      setTheme(isLight ? "light" : "dark");
    });
    observer.observe(window.document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const chartColors = useMemo(() => {
    const isLight = theme === "light";
    return {
      bg: isLight ? "#ffffff" : "#141619",
      grid: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(43, 49, 57, 0.4)",
      text: isLight ? "#707a8a" : "#707a8a",
      crosshair: isLight ? "#929aa5" : "#929aa5",
      up: isLight ? "#0c9f65" : "#0ecb81",
      down: isLight ? "#d9384d" : "#f6465d",
      probLine: "#f1c40f",
      priceLine: isLight ? "#181a20" : "#eaecef",
      targetLine: "#929aa5",
    };
  }, [theme]);

  // Apply colors dynamically to the chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: chartColors.bg },
        textColor: chartColors.text,
      },
      grid: {
        vertLines: { color: chartColors.grid },
        horzLines: { color: chartColors.grid },
      },
      crosshair: {
        vertLine: { color: chartColors.crosshair },
        horzLine: { color: chartColors.crosshair },
      },
      timeScale: {
        borderColor: chartColors.grid,
      },
      rightPriceScale: {
        borderColor: chartColors.grid,
      },
    });

    const series = seriesRef.current;
    if (series) {
      if (mode === "probability") {
        series.applyOptions({ color: chartColors.probLine });
      } else if (mode === "price-line") {
        series.applyOptions({ color: chartColors.priceLine });
      } else {
        (series as ISeriesApi<"Candlestick">).applyOptions({
          upColor: chartColors.up,
          downColor: chartColors.down,
          borderUpColor: chartColors.up,
          borderDownColor: chartColors.down,
          wickUpColor: chartColors.up,
          wickDownColor: chartColors.down,
        });
      }
    }
  }, [chartColors, mode]);

  const targetPrice = useMemo(() => extractTargetPrice(market.question), [market.question]);

  // Chart creation
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.bg },
        textColor: CHART_COLORS.text,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        vertLine: { color: CHART_COLORS.crosshair, labelBackgroundColor: "#1e2329" },
        horzLine: { color: CHART_COLORS.crosshair, labelBackgroundColor: "#1e2329" },
      },
      timeScale: {
        borderColor: CHART_COLORS.grid,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.grid,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Series setup based on mode
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Remove old series
    if (seriesRef.current) {
      try {
        chart.removeSeries(seriesRef.current);
      } catch {
        /* series may already be removed */
      }
      seriesRef.current = null;
      targetLineRef.current = null;
      positionLinesRef.current = [];
    }

    if (mode === "probability") {
      const series = chart.addSeries(LineSeries, {
        color: CHART_COLORS.probLine,
        lineWidth: 2,
        priceFormat: { type: "custom", formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
      });
      chart.priceScale("right").applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.05 },
      });
      seriesRef.current = series;
      if (probDataRef.current.length > 0) series.setData(probDataRef.current);
    } else if (mode === "price-line") {
      const series = chart.addSeries(LineSeries, {
        color: CHART_COLORS.priceLine,
        lineWidth: 2,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      chart.priceScale("right").applyOptions({
        scaleMargins: { top: 0.1, bottom: 0.1 },
      });
      seriesRef.current = series;
      if (priceDataRef.current.length > 0) series.setData(priceDataRef.current);
    } else {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: CHART_COLORS.up,
        downColor: CHART_COLORS.down,
        borderUpColor: CHART_COLORS.up,
        borderDownColor: CHART_COLORS.down,
        wickUpColor: CHART_COLORS.up,
        wickDownColor: CHART_COLORS.down,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      chart.priceScale("right").applyOptions({
        scaleMargins: { top: 0.1, bottom: 0.1 },
      });
      seriesRef.current = series;
      if (candleDataRef.current.length > 0) series.setData(candleDataRef.current);
    }

    // Add target price line for price modes
    if ((mode === "price-line" || mode === "price-candle") && targetPrice && seriesRef.current) {
      try {
        targetLineRef.current = seriesRef.current.createPriceLine({
          price: targetPrice,
          color: CHART_COLORS.targetLine,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "target",
        });
      } catch {
        /* series may not support price lines in some edge cases */
      }
    }

    // Add position lines
    if ((mode === "price-line" || mode === "price-candle") && seriesRef.current) {
      for (const pos of positions) {
        if (pos.size <= 0) continue;
        const isUp = pos.outcome === "UP";
        try {
          const line = seriesRef.current.createPriceLine({
            price: pos.avgPrice,
            color: isUp ? CHART_COLORS.up : CHART_COLORS.down,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: `${pos.outcome} ${pos.size.toFixed(1)} @ ${(pos.avgPrice * 100).toFixed(0)}¢`,
          });
          positionLinesRef.current.push(line);
        } catch {
          /* ignore */
        }
      }
    }
  }, [mode, targetPrice, positions]);

  // Subscribe to RTDS price updates
  useEffect(() => {
    const unsub = polymarketRtdsSocket.onPrice((price: CryptoPrice) => {
      if (price.asset !== market.asset) return;
      setDataSource("chainlink");
      setCurrentPrice(price.price);

      const ts = Math.floor(price.ts / 1000) as UTCTimestamp;

      // Accumulate price data
      const pricePoint: PricePoint = { time: ts, value: price.price };
      priceDataRef.current = appendPoint(priceDataRef.current, pricePoint);

      // Build candles (1-minute)
      const candleTime = (Math.floor(price.ts / 60_000) * 60) as UTCTimestamp;
      const lastCandle = currentCandleRef.current;
      if (lastCandle && lastCandle.time === candleTime) {
        lastCandle.high = Math.max(lastCandle.high, price.price);
        lastCandle.low = Math.min(lastCandle.low, price.price);
        lastCandle.close = price.price;
      } else {
        const newCandle: CandlePoint = {
          time: candleTime,
          open: price.price,
          high: price.price,
          low: price.price,
          close: price.price,
        };
        candleDataRef.current = [...candleDataRef.current, newCandle];
        currentCandleRef.current = newCandle;
      }

      // Update active series
      if (seriesRef.current && mode === "price-line") {
        (seriesRef.current as ISeriesApi<"Line">).update(pricePoint);
      } else if (seriesRef.current && mode === "price-candle" && currentCandleRef.current) {
        (seriesRef.current as ISeriesApi<"Candlestick">).update(currentCandleRef.current);
      }
    });

    // Check for existing data
    const last = polymarketRtdsSocket.getLastPrice(market.asset as Asset);
    if (last) {
      setDataSource("chainlink");
      setCurrentPrice(last.price);
    }

    return unsub;
  }, [market.asset, mode]);

  // Track Y position of target price for floating label
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !targetPrice || (mode !== "price-line" && mode !== "price-candle")) {
      setTargetY(null);
      return;
    }

    const updateY = () => {
      const series = seriesRef.current;
      if (!series) {
        setTargetY(null);
        return;
      }
      try {
        const y = series.priceToCoordinate(targetPrice);
        setTargetY(y);
      } catch {
        setTargetY(null);
      }
    };

    chart.timeScale().subscribeVisibleTimeRangeChange(updateY);
    
    // Periodically sync coordinate during layout changes or initial loading
    updateY();
    const interval = setInterval(updateY, 150);

    return () => {
      try {
        chart.timeScale().unsubscribeVisibleTimeRangeChange(updateY);
      } catch {
        /* ignore */
      }
      clearInterval(interval);
    };
  }, [mode, targetPrice, currentPrice]);

  // Probability mode data from CLOB prices
  useEffect(() => {
    if (mode !== "probability" || upProb == null) return;
    const ts = Math.floor(Date.now() / 1000) as UTCTimestamp;
    const point: PricePoint = { time: ts, value: upProb };
    probDataRef.current = appendPoint(probDataRef.current, point);
    if (seriesRef.current) {
      (seriesRef.current as ISeriesApi<"Line">).update(point);
    }
  }, [upProb, mode]);

  // Distance from target
  const distanceFromTarget = currentPrice != null && targetPrice != null ? currentPrice - targetPrice : null;

  return (
    <div className={`market-chart ${className ?? ""}`}>
      {/* Price info bar */}
      <div className="market-chart__info">
        {currentPrice != null && (mode === "price-line" || mode === "price-candle") && (
          <div className="market-chart__price-bar">
            <span className="market-chart__current-label">Prix actuel</span>
            <span className="market-chart__current-value num">
              ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {distanceFromTarget != null && (
              <span className={`market-chart__distance num ${distanceFromTarget >= 0 ? "text-up" : "text-down"}`}>
                {distanceFromTarget >= 0 ? "▲" : "▼"}{" "}
                {distanceFromTarget >= 0 ? "+" : ""}${distanceFromTarget.toFixed(2)}
              </span>
            )}
            <span className="market-chart__source" title="Source de résolution : Chainlink">
              {dataSource === "chainlink" ? "Chainlink" : dataSource === "binance" ? "Binance ⚠" : "—"}
            </span>
          </div>
        )}
        {mode === "probability" && upProb != null && (
          <div className="market-chart__price-bar">
            <span className="market-chart__current-label">Probabilité UP</span>
            <span className="market-chart__current-value num">{(upProb * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* Chart container wrapper */}
      <div className="relative flex-grow min-h-[220px] w-full mt-3">
        <div ref={containerRef} className="w-full h-full" />
        
        {/* Floating target label on price curve */}
        {targetY !== null && targetPrice !== null && (
          <div 
            className="absolute right-14 px-2 py-0.5 rounded bg-surface border border-hairline text-[10px] font-semibold flex items-center gap-1 shadow-md pointer-events-none z-10"
            style={{ top: `${targetY}px`, transform: 'translateY(-50%)' }}
            aria-hidden="true"
          >
            <span className="text-muted-foreground">target</span>
            {currentPrice != null && (
              <span className={currentPrice >= targetPrice ? "text-down" : "text-up"}>
                {currentPrice >= targetPrice ? "▼" : "▲"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div className="market-chart__modes">
        <button
          type="button"
          className={`market-chart__mode-btn ${mode === "probability" ? "market-chart__mode-btn--active" : ""}`}
          onClick={() => setMode("probability")}
        >
          Probabilité
        </button>
        <button
          type="button"
          className={`market-chart__mode-btn ${mode === "price-line" ? "market-chart__mode-btn--active" : ""}`}
          onClick={() => setMode("price-line")}
        >
          Prix (Ligne)
        </button>
        <button
          type="button"
          className={`market-chart__mode-btn ${mode === "price-candle" ? "market-chart__mode-btn--active" : ""}`}
          onClick={() => setMode("price-candle")}
        >
          Chandeliers
        </button>
      </div>
    </div>
  );
}

/** Append a point ensuring time monotonicity */
function appendPoint(data: PricePoint[], point: PricePoint): PricePoint[] {
  if (data.length > 0 && data[data.length - 1].time >= point.time) {
    // Update in place
    const copy = [...data];
    copy[copy.length - 1] = point;
    return copy;
  }
  return [...data, point];
}
