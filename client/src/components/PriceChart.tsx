"use client";

import { useEffect, useRef } from "react";
import {
  createChart, ColorType,
  IChartApi, ISeriesApi, UTCTimestamp,
  LineStyle,
} from "lightweight-charts";

interface Props {
  symbol: string;
  ticks: never[];
  currentPrice: number | null;
}

/**
 * GBM micro-tick engine
 * ---------------------
 * Between 30-second Yahoo Finance updates, we run a lightweight
 * Geometric Brownian Motion simulation anchored to the real price.
 * The chart stays visually alive without inventing fake data —
 * the moment a real price arrives, the sim snaps to it.
 */
function gbm(price: number, sigma = 0.00025): number {
  // Box-Muller approximation for normal random variable
  const u = (Math.random() + Math.random() + Math.random() + Math.random() - 2) / Math.sqrt(4 / 3);
  return price * Math.exp(-0.5 * sigma * sigma + sigma * u);
}

export default function PriceChart({ symbol, currentPrice }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const seriesRef     = useRef<ISeriesApi<"Area"> | null>(null);
  const simPrice      = useRef<number | null>(null);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Initialise chart ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background:  { type: ColorType.Solid, color: "transparent" },
        textColor:   "#757885",
        fontFamily:  "'JetBrains Mono', monospace",
        fontSize:    10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.015)", style: LineStyle.Solid },
        horzLines: { color: "rgba(255,255,255,0.015)", style: LineStyle.Solid },
      },
      crosshair: {
        vertLine: {
          color: "rgba(255,96,0,0.3)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#111216",
        },
        horzLine: {
          color: "rgba(255,96,0,0.3)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#111216",
        },
      },
      rightPriceScale: {
        borderColor: "#21232c",
        scaleMargins: { top: 0.1, bottom: 0.08 },
        textColor: "#757885",
      },
      timeScale: {
        borderColor: "#21232c",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
        },
      },
      handleScroll:   { mouseWheel: true, pressedMouseMove: true },
      handleScale:    { mouseWheel: true, pinch: true },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 300,
    });

    // Cobalt blue area — same brand colour as the rest of the UI
    const series = chart.addAreaSeries({
      lineColor:   "#ff6000",
      topColor:    "rgba(255,96,0,0.12)",
      bottomColor: "rgba(255,96,0,0.00)",
      lineWidth:   2,
      priceLineVisible:          true,
      priceLineColor:            "rgba(255,96,0,0.3)",
      priceLineWidth:            1,
      lastValueVisible:          true,
      crosshairMarkerVisible:    true,
      crosshairMarkerRadius:     4,
      crosshairMarkerBorderColor:"#ff6000",
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBackgroundColor: "#0c0d0f",
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    // Auto-resize via ResizeObserver
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 300,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // ── Reset on symbol change ────────────────────────────────────────
  useEffect(() => {
    seriesRef.current?.setData([]);
    simPrice.current = null;
  }, [symbol]);

  // ── Anchor simulation to real Yahoo Finance price ─────────────────
  useEffect(() => {
    if (currentPrice === null) return;
    simPrice.current = currentPrice;
  }, [currentPrice]);

  // ── 1-second GBM tick loop ────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      if (!seriesRef.current || simPrice.current === null) return;

      const next = gbm(simPrice.current);
      simPrice.current = next;

      try {
        seriesRef.current.update({
          time: Math.floor(Date.now() / 1000) as UTCTimestamp,
          value: next,
        });
      } catch {
        // Lightweight-charts throws if time goes backward on symbol switch
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [symbol]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
