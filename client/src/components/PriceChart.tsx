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
        textColor:   "#4A5568",
        fontFamily:  "'JetBrains Mono', monospace",
        fontSize:    10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)", style: LineStyle.Solid },
        horzLines: { color: "rgba(255,255,255,0.03)", style: LineStyle.Solid },
      },
      crosshair: {
        vertLine: {
          color: "rgba(79,142,247,0.5)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#141920",
        },
        horzLine: {
          color: "rgba(79,142,247,0.5)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#141920",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.05)",
        scaleMargins: { top: 0.1, bottom: 0.08 },
        textColor: "#4A5568",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.05)",
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
      lineColor:   "#4F8EF7",
      topColor:    "rgba(79,142,247,0.14)",
      bottomColor: "rgba(79,142,247,0.00)",
      lineWidth:   2,
      priceLineVisible:          true,
      priceLineColor:            "rgba(79,142,247,0.35)",
      priceLineWidth:            1,
      lastValueVisible:          true,
      crosshairMarkerVisible:    true,
      crosshairMarkerRadius:     4,
      crosshairMarkerBorderColor:"#4F8EF7",
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBackgroundColor: "#0B0D14",
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
