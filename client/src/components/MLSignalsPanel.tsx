"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import type { ShapEntry, SignalData, FetchStatus } from "@/types/signals";

interface Props { ticker: string }

// ── SHAP waterfall D3 chart ────────────────────────────────────────────────────
function ShapWaterfall({ data }: { data: ShapEntry[] }) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Resize observer for responsive D3 chart width
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      setWidth(wrapRef.current?.clientWidth ?? 0);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!data.length || !svgRef.current || !wrapRef.current) return;

    const W      = width || wrapRef.current.clientWidth || 400;
    const barH   = 26;
    const gap    = 6;
    const labelW = 120;   // feature name column
    const valW   = 50;    // raw value column on right
    const padding = 16;   // right margin
    const H      = data.length * (barH + gap) + 40;

    // The bar drawing area: split in two halves from a center zero
    // Negative bars extend LEFT from zero, positive bars extend RIGHT
    const chartW = W - labelW - valW - padding;
    const halfW  = chartW / 2;  // each side gets half
    const zeroX  = labelW + halfW; // absolute x of the zero line

    const svg = d3.select(svgRef.current).attr("width", W).attr("height", H);
    svg.selectAll("*").remove(); // full redraw for simplicity

    const maxAbs = d3.max(data, d => Math.abs(d.shap)) ?? 1;

    // ── Feature labels (left column) ─────────────────────────────────
    const labG = svg.append("g").attr("transform", "translate(0, 20)");
    labG.selectAll("text.feat")
      .data(data)
      .join("text")
      .attr("class", "feat")
      .attr("x", labelW - 8)
      .attr("y", (d, i) => i * (barH + gap) + barH / 2 + 1)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#98AABF")
      .attr("font-size", 10)
      .attr("font-family", "'Inter', sans-serif")
      .attr("font-weight", "500")
      .text(d => d.feature);

    // ── Zero center line ─────────────────────────────────────────────
    const g = svg.append("g").attr("transform", `translate(${zeroX}, 20)`);
    g.append("line")
      .attr("x1", 0).attr("y1", -8)
      .attr("x2", 0).attr("y2", H - 30)
      .attr("stroke", "rgba(255,255,255,0.1)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,4");

    // ── Bars ─────────────────────────────────────────────────────────
    data.forEach((d, i) => {
      const bw  = (Math.abs(d.shap) / maxAbs) * (halfW * 0.9);
      const y   = i * (barH + gap);
      const pos = d.shap > 0;
      const col = pos ? "#00C896" : "#FF4D6D";
      const x   = pos ? 0 : -bw;

      // bar
      g.append("rect")
        .attr("x", x).attr("y", y)
        .attr("width", 0).attr("height", barH)
        .attr("rx", 3).attr("fill", col).attr("opacity", 0.82)
        .transition().duration(500).delay(i * 50)
        .attr("x", x).attr("width", bw);

      // value label inside bar (only if bar wide enough)
      if (bw > 35) {
        g.append("text")
          .attr("x", pos ? bw - 5 : -bw + 5)
          .attr("y", y + barH / 2 + 1)
          .attr("text-anchor", pos ? "end" : "start")
          .attr("dominant-baseline", "middle")
          .attr("fill", "rgba(255,255,255,0.95)")
          .attr("font-size", 9)
          .attr("font-family", "'JetBrains Mono', monospace")
          .attr("font-weight", "700")
          .attr("opacity", 0)
          .text((d.shap > 0 ? "+" : "") + d.shap.toFixed(3))
          .transition().duration(300).delay(i * 50 + 300)
          .attr("opacity", 1);
      }
    });

    // ── Raw values (right column) ─────────────────────────────────────
    const rawG = svg.append("g").attr("transform", "translate(0, 20)");
    rawG.selectAll("text.raw")
      .data(data)
      .join("text")
      .attr("class", "raw")
      .attr("x", W - padding - 4)
      .attr("y", (d, i) => i * (barH + gap) + barH / 2 + 1)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#4E5E73")
      .attr("font-size", 9)
      .attr("font-family", "'JetBrains Mono', monospace")
      .text(d => d.value.toFixed(2));

  }, [data, width]);

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg ref={svgRef} style={{ display: "block", overflow: "hidden" }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MLSignalsPanel({ ticker }: Props) {
  const [result,  setResult]  = useState<SignalData | null>(null);
  const [status,  setStatus]  = useState<FetchStatus>("idle");
  const prevTicker = useRef<string>("");

  const fetchSignal = useCallback(async (t: string) => {
    setStatus("loading");
    setResult(null);
    try {
      const res  = await fetch(`/api/signals/${t}`);
      const data = await res.json();
      setResult(data);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, []);

  // Auto-fetch when ticker changes
  useEffect(() => {
    if (ticker && ticker !== prevTicker.current) {
      prevTicker.current = ticker;
      fetchSignal(ticker);
    }
  }, [ticker, fetchSignal]);

  const signalColor = result?.signal === "BUY"  ? "var(--green)"
                    : result?.signal === "SELL" ? "var(--red)"
                    : "var(--amber)";
  const signalBg    = result?.signal === "BUY"  ? "var(--green-bg)"
                    : result?.signal === "SELL" ? "var(--red-bg)"
                    : "var(--amber-bg)";
  const signalBdr   = result?.signal === "BUY"  ? "var(--green-bdr)"
                    : result?.signal === "SELL" ? "var(--red-bdr)"
                    : "var(--amber-bdr)";

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "var(--bg)", overflow: "hidden",
    }}>
      {/* ── Control bar ──────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, flexShrink: 0,
        padding: "10px 20px", background: "var(--s1)",
        borderBottom: "1px solid var(--b0)",
      }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--t0)" }}>
          {ticker}
        </span>
        <span style={{
          fontSize: 8, fontWeight: 700, letterSpacing: ".1em",
          padding: "2px 6px", borderRadius: 2,
          background: "rgba(79,142,247,0.08)", border: "1px solid rgba(79,142,247,0.2)",
          color: "var(--blue,#4F8EF7)",
        }}>ML SIGNALS</span>

        {status === "loading" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 12, height: 12, borderRadius: "50%",
              border: "1.5px solid rgba(79,142,247,0.3)",
              borderTopColor: "var(--blue,#4F8EF7)",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ fontSize: 9, color: "var(--t3)" }}>Training XGBoost…</span>
          </div>
        )}

        {status === "done" && result && (
          <span style={{ fontSize: 9, color: "var(--t4)" }}>
            Backtest accuracy: {(result.model_accuracy * 100).toFixed(1)}%
          </span>
        )}

        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => fetchSignal(ticker)}
            disabled={status === "loading"}
            style={{
              padding: "5px 14px", borderRadius: 4, border: "1px solid var(--b2)",
              background: "transparent", cursor: status === "loading" ? "not-allowed" : "pointer",
              fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
              color: "var(--t2)", opacity: status === "loading" ? 0.5 : 1,
            }}
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

        {/* Loading */}
        {status === "loading" && (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            height: 240, gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              border: "2px solid rgba(79,142,247,0.2)",
              borderTopColor: "#4F8EF7",
              animation: "spin 0.9s linear infinite",
            }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--t3)" }}>
              Fetching 1-year OHLCV · Engineering features · Training XGBoost
            </span>
            <span style={{ fontSize: 9, color: "var(--t4)" }}>
              First call takes 5–10 seconds · Cached for 5 minutes
            </span>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div style={{
            padding: 16, borderRadius: 6,
            background: "var(--red-bg)", border: "1px solid var(--red-bdr)",
            color: "var(--red)", fontSize: 11, fontFamily: "var(--mono)",
          }}>
            Failed to fetch signal. Check server is running on :8000.
          </div>
        )}

        {/* Results */}
        {status === "done" && result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Signal hero */}
            <div style={{
              display: "flex", alignItems: "center", gap: 16,
              padding: "16px 20px", borderRadius: 8,
              background: "var(--s1)", border: "1px solid var(--b1)",
            }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: "var(--t4)", marginBottom: 4 }}>
                  MODEL SIGNAL
                </div>
                <div style={{
                  fontFamily: "var(--mono)", fontSize: 28, fontWeight: 800,
                  color: signalColor, letterSpacing: ".04em",
                }}>
                  {result.signal}
                </div>
              </div>

              <div style={{ width: 1, height: 48, background: "var(--b2)" }} />

              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: "var(--t4)", marginBottom: 4 }}>
                  CONFIDENCE
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--t0)" }}>
                  {(result.confidence * 100).toFixed(1)}%
                </div>
              </div>

              <div style={{ width: 1, height: 48, background: "var(--b2)" }} />

              {/* Probability bars */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: "var(--t4)", marginBottom: 8 }}>
                  PROBABILITY DISTRIBUTION
                </div>
                {(["BUY", "HOLD", "SELL"] as const).map(label => {
                  const p = result.probabilities[label] ?? 0;
                  const c = label === "BUY" ? "#00C896" : label === "SELL" ? "#FF4D6D" : "#FFB020";
                  return (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, color: c, width: 30 }}>
                        {label}
                      </span>
                      <div style={{ flex: 1, height: 6, background: "var(--b1)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          width: `${(p * 100).toFixed(1)}%`, height: "100%",
                          background: c, borderRadius: 3, transition: "width 0.6s ease",
                        }} />
                      </div>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t2)", width: 36, textAlign: "right" }}>
                        {(p * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SHAP waterfall */}
            <div style={{
              padding: 20, borderRadius: 8,
              background: "var(--s1)", border: "1px solid var(--b1)",
            }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: "var(--t4)", marginBottom: 4 }}>
                  SHAP FEATURE IMPORTANCE — WHY {result.signal}?
                </div>
                <div style={{ fontSize: 9, color: "var(--t4)" }}>
                  <span style={{ color: "#00C896", fontWeight: 700 }}>■ Green</span> = pushes toward {result.signal} &nbsp;
                  <span style={{ color: "#FF4D6D", fontWeight: 700 }}>■ Red</span> = pushes away from {result.signal}
                </div>
              </div>
              <ShapWaterfall data={result.shap_values} />
            </div>

            {/* Raw feature values */}
            <div style={{
              padding: 16, borderRadius: 8,
              background: "var(--s1)", border: "1px solid var(--b1)",
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: "var(--t4)", marginBottom: 12 }}>
                LIVE FEATURE VALUES
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px 16px" }}>
                {result.shap_values.map(s => (
                  <div key={s.feature}>
                    <div style={{ fontSize: 8, color: "var(--t4)", marginBottom: 2, letterSpacing: ".04em" }}>
                      {s.feature}
                    </div>
                    <div style={{
                      fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700,
                      color: s.shap > 0 ? "var(--green)" : s.shap < 0 ? "var(--red)" : "var(--t1)",
                    }}>
                      {s.value.toFixed(3)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer note */}
            <div style={{
              fontSize: 8, color: "var(--t4)", letterSpacing: ".04em",
              padding: "8px 0", borderTop: "1px solid var(--b0)",
            }}>
              XGBoost · 120 estimators · 1-year OHLCV · 5-day forward return target ·
              Backtest accuracy {(result.model_accuracy * 100).toFixed(1)}% on last 60 trading days
            </div>
          </div>
        )}

        {/* Idle */}
        {status === "idle" && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 200, color: "var(--t4)", fontSize: 11,
          }}>
            Select a ticker and click Refresh to run the ML model
          </div>
        )}
      </div>
    </div>
  );
}
