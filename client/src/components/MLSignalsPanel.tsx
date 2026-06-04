"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

interface ShapEntry {
  feature: string;
  value:   number;
  shap:    number;
}

interface SignalData {
  ticker:         string;
  signal:         "BUY" | "SELL" | "HOLD";
  confidence:     number;
  probabilities:  Record<string, number>;
  shap_values:    ShapEntry[];
  feature_values: Record<string, number>;
  model_accuracy: number;
  error?:         string;
}

type FetchStatus = "idle" | "loading" | "done" | "error";

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
    const barH   = 28;
    const gap    = 5;
    const labelW = 130;
    const valW   = 55;
    const H      = data.length * (barH + gap) + 50;

    const svg = d3.select(svgRef.current).attr("width", W).attr("height", H);
    
    // Ensure container groups exist
    let g = svg.select<SVGGElement>("g.main-group");
    if (g.empty()) {
      g = svg.append("g").attr("class", "main-group").attr("transform", `translate(${labelW},20)`);
    }
    
    let labelsGroup = svg.select<SVGGElement>("g.labels-group");
    if (labelsGroup.empty()) {
      labelsGroup = svg.append("g").attr("class", "labels-group").attr("transform", "translate(0,20)");
    }

    const maxAbs = d3.max(data, d => Math.abs(d.shap)) ?? 1;
    const barMax = W - labelW - valW - 20;

    // Zero line
    let zeroLine = g.select<SVGLineElement>("line.zero-line");
    if (zeroLine.empty()) {
      zeroLine = g.append("line")
        .attr("class", "zero-line")
        .attr("stroke", "rgba(255,255,255,0.12)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");
    }
    zeroLine
      .attr("x1", 0).attr("y1", 0)
      .attr("x2", 0).attr("y2", H - 30);

    // ── Bind BARS ──────────────────────────────────────────
    const bars = g.selectAll<SVGRectElement, ShapEntry>("rect.bar")
      .data(data, d => d.feature);

    // Enter + Update
    bars.join(
      enter => enter.append("rect")
        .attr("class", "bar")
        .attr("x", d => d.shap > 0 ? 0 : -((Math.abs(d.shap) / maxAbs) * (barMax * 0.85)))
        .attr("y", (d, i) => i * (barH + gap))
        .attr("width", 0)
        .attr("height", barH)
        .attr("rx", 3)
        .attr("fill", d => d.shap > 0 ? "#26A69A" : "#EF5350")
        .attr("opacity", 0.85)
        .call(enter => enter.transition().duration(500).delay((d, i) => i * 60)
          .attr("width", d => (Math.abs(d.shap) / maxAbs) * (barMax * 0.85))),
      update => update
        .transition().duration(400)
        .attr("x", d => d.shap > 0 ? 0 : -((Math.abs(d.shap) / maxAbs) * (barMax * 0.85)))
        .attr("y", (d, i) => i * (barH + gap))
        .attr("width", d => (Math.abs(d.shap) / maxAbs) * (barMax * 0.85))
        .attr("fill", d => d.shap > 0 ? "#26A69A" : "#EF5350"),
      exit => exit.remove()
    );

    // ── Bind BAR LABELS (values inside bars) ──────────────
    const barLabels = g.selectAll<SVGTextElement, ShapEntry>("text.bar-label")
      .data(data, d => d.feature);

    barLabels.join(
      enter => enter.append("text")
        .attr("class", "bar-label")
        .attr("y", (d, i) => i * (barH + gap) + barH / 2 + 1)
        .attr("text-anchor", d => d.shap > 0 ? "end" : "start")
        .attr("dominant-baseline", "middle")
        .attr("fill", "#fff")
        .attr("font-size", 9)
        .attr("font-family", "'JetBrains Mono',monospace")
        .attr("font-weight", "700")
        .attr("opacity", 0)
        .text(d => (d.shap > 0 ? "+" : "") + d.shap.toFixed(3))
        .call(enter => enter.transition().duration(500).delay((d, i) => i * 60)
          .attr("x", d => {
            const bw = (Math.abs(d.shap) / maxAbs) * (barMax * 0.85);
            return d.shap > 0 ? Math.max(bw - 4, 4) : Math.min(-bw + 4, -4);
          })
          .attr("opacity", d => ((Math.abs(d.shap) / maxAbs) * (barMax * 0.85)) > 30 ? 1 : 0)),
      update => update
        .text(d => (d.shap > 0 ? "+" : "") + d.shap.toFixed(3))
        .transition().duration(400)
        .attr("y", (d, i) => i * (barH + gap) + barH / 2 + 1)
        .attr("text-anchor", d => d.shap > 0 ? "end" : "start")
        .attr("x", d => {
          const bw = (Math.abs(d.shap) / maxAbs) * (barMax * 0.85);
          return d.shap > 0 ? Math.max(bw - 4, 4) : Math.min(-bw + 4, -4);
        })
        .attr("opacity", d => ((Math.abs(d.shap) / maxAbs) * (barMax * 0.85)) > 30 ? 1 : 0),
      exit => exit.remove()
    );

    // ── Bind FEATURE LABELS (left text) ──────────────────
    const featLabels = labelsGroup.selectAll<SVGTextElement, ShapEntry>("text.feat-label")
      .data(data, d => d.feature);

    featLabels.join(
      enter => enter.append("text")
        .attr("class", "feat-label")
        .attr("x", labelW - 8)
        .attr("y", (d, i) => i * (barH + gap) + barH / 2 + 1)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("fill", "#8694A8")
        .attr("font-size", 10)
        .attr("font-family", "'Inter',sans-serif")
        .text(d => d.feature),
      update => update
        .transition().duration(400)
        .attr("y", (d, i) => i * (barH + gap) + barH / 2 + 1),
      exit => exit.remove()
    );

    // ── Bind FEATURE RAW VALUES (right text) ──────────────
    const rawLabels = labelsGroup.selectAll<SVGTextElement, ShapEntry>("text.raw-label")
      .data(data, d => d.feature);

    rawLabels.join(
      enter => enter.append("text")
        .attr("class", "raw-label")
        .attr("x", labelW + barMax + 8)
        .attr("y", (d, i) => i * (barH + gap) + barH / 2 + 1)
        .attr("dominant-baseline", "middle")
        .attr("fill", "#4A5568")
        .attr("font-size", 9)
        .attr("font-family", "'JetBrains Mono',monospace")
        .text(d => d.value.toFixed(2)),
      update => update
        .text(d => d.value.toFixed(2))
        .transition().duration(400)
        .attr("x", labelW + barMax + 8)
        .attr("y", (d, i) => i * (barH + gap) + barH / 2 + 1),
      exit => exit.remove()
    );

  }, [data, width]);

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg ref={svgRef} style={{ display: "block", overflow: "visible" }} />
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
                  const c = label === "BUY" ? "#26A69A" : label === "SELL" ? "#EF5350" : "#F59E0B";
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
                  <span style={{ color: "#26A69A", fontWeight: 700 }}>■ Green</span> = pushes toward {result.signal} &nbsp;
                  <span style={{ color: "#EF5350", fontWeight: 700 }}>■ Red</span> = pushes away from {result.signal}
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
