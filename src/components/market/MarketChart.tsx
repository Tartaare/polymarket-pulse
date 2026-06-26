import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  CandlestickSeries,
  ColorType,
  LineStyle,
} from "lightweight-charts";
import type { Market, Position } from "@/lib/sim/types";

import {
  type ChartMode,
  CHART_COLORS,
  extractTargetPrice,
  useChartTheme,
  useMarketChartData,
} from "./useMarketChartData";

export type { ChartMode } from "./useMarketChartData";

interface MarketChartProps {
  market: Market;
  upProb: number | null;
  positions: Position[];
  className?: string;
}

export function MarketChart({ market, upProb, positions, className }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | ISeriesApi<"Candlestick"> | null>(null);
  const targetLineRef = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]> | null>(null);
  const positionLinesRef = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]>[]>([]);

  const [mode, setMode] = useState<ChartMode>("probability");
  const chartColors = useChartTheme();
  const targetPrice = useMemo(() => extractTargetPrice(market.question), [market.question]);

  const { dataSource, currentPrice, targetY, probDataRef, priceDataRef, candleDataRef } =
    useMarketChartData({ market, mode, upProb, seriesRef, chartRef, targetPrice });

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
      timeScale: { borderColor: chartColors.grid },
      rightPriceScale: { borderColor: chartColors.grid },
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
      rightPriceScale: { borderColor: CHART_COLORS.grid },
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
      chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.05, bottom: 0.05 } });
      seriesRef.current = series;
      if (probDataRef.current.length > 0) series.setData(probDataRef.current);
    } else if (mode === "price-line") {
      const series = chart.addSeries(LineSeries, {
        color: CHART_COLORS.priceLine,
        lineWidth: 2,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
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
      chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
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
  }, [mode, targetPrice, positions, probDataRef, priceDataRef, candleDataRef]);

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
