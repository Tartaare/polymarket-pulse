/**
 * Data hook for MarketChart.
 * Encapsulates RTDS price subscription, candle aggregation, probability tracking,
 * theme detection and target Y-coordinate tracking.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { polymarketRtdsSocket, type CryptoPrice } from "@/lib/feed/polymarket-rtds-ws";
import type { Asset, Market, Outcome } from "@/lib/sim/types";

// ── Types ──────────────────────────────────────────────────

export type ChartMode = "probability" | "price-line" | "price-candle";

export interface PricePoint {
  time: UTCTimestamp;
  value: number;
}

export interface CandlePoint {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ── Constants ──────────────────────────────────────────────

export const CHART_COLORS = {
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

// ── Pure helpers ───────────────────────────────────────────

/** Extract target price from market question via regex (e.g. "$107,234.56") */
export function extractTargetPrice(question: string): number | null {
  const match = question.match(/\$[\d,]+\.?\d*/);
  if (!match) return null;
  const cleaned = match[0].replace(/[$,]/g, "");
  const val = parseFloat(cleaned);
  return Number.isFinite(val) ? val : null;
}

/** Append a point ensuring time monotonicity */
export function appendPoint(data: PricePoint[], point: PricePoint): PricePoint[] {
  if (data.length > 0 && data[data.length - 1].time >= point.time) {
    const copy = [...data];
    copy[copy.length - 1] = point;
    return copy;
  }
  return [...data, point];
}

// ── Theme hook ─────────────────────────────────────────────

export function useChartTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return window.document.documentElement.classList.contains("light") ? "light" : "dark";
  });

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

  return chartColors;
}

// ── Data hook ──────────────────────────────────────────────

interface UseMarketChartDataOpts {
  market: Market;
  mode: ChartMode;
  upProb: number | null;
  seriesRef: React.RefObject<ISeriesApi<"Line"> | ISeriesApi<"Candlestick"> | null>;
  chartRef: React.RefObject<IChartApi | null>;
  targetPrice: number | null;
}

interface UseMarketChartDataResult {
  dataSource: "chainlink" | "binance" | "none";
  currentPrice: number | null;
  targetY: number | null;
  probDataRef: React.RefObject<PricePoint[]>;
  priceDataRef: React.RefObject<PricePoint[]>;
  candleDataRef: React.RefObject<CandlePoint[]>;
}

export function useMarketChartData(opts: UseMarketChartDataOpts): UseMarketChartDataResult {
  const { market, mode, upProb, seriesRef, chartRef, targetPrice } = opts;

  const probDataRef = useRef<PricePoint[]>([]);
  const priceDataRef = useRef<PricePoint[]>([]);
  const candleDataRef = useRef<CandlePoint[]>([]);
  const currentCandleRef = useRef<CandlePoint | null>(null);

  const [dataSource, setDataSource] = useState<"chainlink" | "binance" | "none">("none");
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [targetY, setTargetY] = useState<number | null>(null);

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
  }, [market.asset, mode, seriesRef]);

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
  }, [mode, targetPrice, currentPrice, chartRef, seriesRef]);

  // Probability mode data from CLOB prices
  useEffect(() => {
    if (mode !== "probability" || upProb == null) return;
    const ts = Math.floor(Date.now() / 1000) as UTCTimestamp;
    const point: PricePoint = { time: ts, value: upProb };
    probDataRef.current = appendPoint(probDataRef.current, point);
    if (seriesRef.current) {
      (seriesRef.current as ISeriesApi<"Line">).update(point);
    }
  }, [upProb, mode, seriesRef]);

  return { dataSource, currentPrice, targetY, probDataRef, priceDataRef, candleDataRef };
}
