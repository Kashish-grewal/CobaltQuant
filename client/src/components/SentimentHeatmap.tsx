"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { SentimentTick, SentimentMap } from "@/hooks/useSentiment";

interface Props {
  data: SentimentMap;
  isConnected: boolean;
}

interface TooltipState {
  x: number;
  y: number;
  tick: SentimentTick;
}

// ── Color scale — matches Cobalt design system ────────────────────────────────
// Red #EF5350 → neutral dark → Teal #26A69A (TradingView calibrated)
const colorScale = d3.scaleLinear<string>()
  .domain([-1, -0.4, -0.1, 0.1, 0.4, 1])
  .range([
    "#EF5350",   // strong bear
    "#B71C1C",   // bear
    "#1E2733",   // slightly bear (near neutral dark)
    "#1A3A38",   // slightly bull
    "#1B6B5E",   // bull
    "#26A69A",   // strong bull
  ])
  .clamp(true);

const textColor = (score: number): string =>
  Math.abs(score) > 0.15 ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)";

const fmt2 = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2);

export default function SentimentHeatmap({ data, isConnected }: Props) {
  const svgRef       = useRef<SVGSVGElement>(null);
  const wrapRef      = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);

  useEffect(() => {
    let raf: number;
    raf = requestAnimationFrame(() => {
    const ticks = Object.values(data);
    if (!ticks.length || !svgRef.current || !wrapRef.current) return;

    const W = wrapRef.current.clientWidth;
    const H = wrapRef.current.clientHeight;
    if (!W || !H) return;

    const svg = d3.select(svgRef.current);
    svg.attr("width", W).attr("height", H);

    // ── D3 Treemap layout ────────────────────────────────────────────
    const root = d3.hierarchy({ children: ticks })
      .sum((d: any) => Math.max(d.market_cap ?? 1, 1))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<any>()
      .size([W, H])
      .padding(2)
      .round(true)(root);

    const leaves = root.leaves();

    // ── Bind cells ───────────────────────────────────────────────────
    const cells = svg.selectAll<SVGGElement, d3.HierarchyRectangularNode<any>>("g.cell")
      .data(leaves, (d: any) => d.data.symbol);

    // Enter
    const entering = cells.enter().append("g").attr("class", "cell");
    entering.append("rect");
    entering.append("text").attr("class", "sym");
    entering.append("text").attr("class", "score");
    entering.append("text").attr("class", "label");

    const merged = entering.merge(cells as any);

    // Update positions (smooth transition)
    merged.transition().duration(600).ease(d3.easeCubicInOut)
      .attr("transform", (d: any) => `translate(${d.x0},${d.y0})`);

    merged.select("rect")
      .transition().duration(600).ease(d3.easeCubicInOut)
      .attr("width",  (d: any) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d: any) => Math.max(0, d.y1 - d.y0))
      .attr("rx", 4).attr("ry", 4)
      .attr("fill",   (d: any) => colorScale(d.data.score));

    // Text visibility based on cell size
    merged.each(function(d: any) {
      const w   = d.x1 - d.x0;
      const h   = d.y1 - d.y0;
      const col = textColor(d.data.score);
      const mid = { x: w / 2, y: h / 2 };

      const g = d3.select(this);

      // Symbol (always shown if cell big enough)
      g.select("text.sym")
        .attr("x", mid.x).attr("y", h >= 60 ? mid.y - 10 : mid.y - 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-family", "'JetBrains Mono', monospace")
        .attr("font-size",   w >= 80 ? "12" : w >= 50 ? "10" : "8")
        .attr("font-weight", "700")
        .attr("fill", col)
        .attr("opacity", w >= 40 ? 1 : 0)
        .text(d.data.symbol);

      // Score
      g.select("text.score")
        .attr("x", mid.x).attr("y", h >= 60 ? mid.y + 6 : mid.y + 10)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-family", "'JetBrains Mono', monospace")
        .attr("font-size",   w >= 80 ? "11" : "9")
        .attr("font-weight", "500")
        .attr("fill", col)
        .attr("opacity", w >= 60 && h >= 55 ? 0.8 : 0)
        .text(fmt2(d.data.score));

      // Label (only for large cells)
      g.select("text.label")
        .attr("x", mid.x).attr("y", h >= 80 ? mid.y + 22 : 0)
        .attr("text-anchor", "middle")
        .attr("font-family", "'Inter', sans-serif")
        .attr("font-size",   "8")
        .attr("font-weight", "600")
        .attr("letter-spacing", "0.08em")
        .attr("fill", col)
        .attr("opacity", w >= 90 && h >= 80 ? 0.55 : 0)
        .text(d.data.label.replace("_", " ").toUpperCase());
    });

    // Hover interaction
    merged
      .style("cursor", "pointer")
      .on("mouseenter", function(event: MouseEvent, d: any) {
        d3.select(this).select("rect")
          .attr("stroke", "rgba(255,255,255,0.25)")
          .attr("stroke-width", 1.5);
        const rect = wrapRef.current!.getBoundingClientRect();
        setTip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          tick: d.data,
        });
      })
      .on("mousemove", function(event: MouseEvent) {
        const rect = wrapRef.current!.getBoundingClientRect();
        setTip(prev => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      })
      .on("mouseleave", function() {
        d3.select(this).select("rect").attr("stroke", null);
        setTip(null);
      });

    // Exit
    cells.exit().remove();
    }); // end RAF
    return () => cancelAnimationFrame(raf);

  }, [data]);

  // Resize observer
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      // Re-trigger the layout effect by forcing a paint
      if (svgRef.current) {
        svgRef.current.setAttribute("width",  String(wrapRef.current?.clientWidth  ?? 0));
        svgRef.current.setAttribute("height", String(wrapRef.current?.clientHeight ?? 0));
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const ticks = Object.values(data);
  const bullish  = ticks.filter(t => t.score > 0.1).length;
  const bearish  = ticks.filter(t => t.score < -0.1).length;
  const neutral  = ticks.length - bullish - bearish;
  const avgScore = ticks.length
    ? ticks.reduce((s, t) => s + t.score, 0) / ticks.length
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)" }}>

      {/* ── Top stats bar ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 20,
        padding: "10px 20px", background: "var(--s1)",
        borderBottom: "1px solid var(--b0)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--t3)" }}>Market Mood</span>
          <span style={{
            fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
            color: avgScore > 0.05 ? "var(--green)" : avgScore < -0.05 ? "var(--red)" : "var(--t2)",
          }}>
            {avgScore > 0.05 ? "BULLISH" : avgScore < -0.05 ? "BEARISH" : "NEUTRAL"}
            &nbsp;{fmt2(avgScore)}
          </span>
        </div>
        <div style={{ width: 1, height: 14, background: "var(--b2)" }} />
        {[
          { label: "Bull", count: bullish,  color: "var(--green)" },
          { label: "Neutral", count: neutral, color: "var(--t3)" },
          { label: "Bear", count: bearish,   color: "var(--red)" },
        ].map(({ label, count, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: "var(--t4)", textTransform: "uppercase" }}>{label}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color }}>{count}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 9, color: "var(--t4)", letterSpacing: ".04em" }}>
          Cell size = Market Cap · Color = Sentiment Score · Updates every 8s
        </div>
      </div>

      {/* ── Treemap ───────────────────────────────────────────────── */}
      <div ref={wrapRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <svg ref={svgRef} style={{ display: "block" }} />

        {/* Empty / connecting state */}
        {ticks.length === 0 && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 12, pointerEvents: "none",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "2px solid var(--b2)",
              borderTopColor: "var(--blue)",
              animation: "spin 0.9s linear infinite",
            }} />
            <span style={{
              fontFamily: "var(--mono)", fontSize: 11, color: "var(--t3)",
              letterSpacing: ".06em",
            }}>
              {isConnected ? "Waiting for first tick…" : "Connecting to sentiment feed…"}
            </span>
            <span style={{ fontSize: 9, color: "var(--t4)" }}>
              {isConnected ? "Refreshes every 8 seconds" : "ws://localhost:8000/ws/sentiment"}
            </span>
          </div>
        )}

        {/* Tooltip */}
        {tip && (
          <div style={{
            position: "absolute",
            left: tip.x + 14, top: tip.y + 14,
            background: "var(--s2)",
            border: "1px solid var(--b2)",
            borderRadius: 8, padding: "10px 13px",
            minWidth: 220, maxWidth: 280,
            pointerEvents: "none", zIndex: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{
                fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--t0)",
              }}>{tip.tick.symbol}</span>
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                padding: "2px 6px", borderRadius: 2, border: "1px solid",
                background: tip.tick.score > 0.1 ? "var(--green-bg)" : tip.tick.score < -0.1 ? "var(--red-bg)" : "var(--amber-bg)",
                borderColor: tip.tick.score > 0.1 ? "var(--green-bdr)" : tip.tick.score < -0.1 ? "var(--red-bdr)" : "var(--amber-bdr)",
                color: tip.tick.score > 0.1 ? "var(--green)" : tip.tick.score < -0.1 ? "var(--red)" : "var(--amber)",
              }}>
                {tip.tick.label.replace("_", " ").toUpperCase()}
              </span>
            </div>

            <div style={{
              fontSize: 9, color: "var(--t3)", fontStyle: "italic", lineHeight: 1.55,
              marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--b0)",
            }}>
              &ldquo;{tip.tick.headline}&rdquo;
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 12px" }}>
              {[
                { k: "Score",     v: fmt2(tip.tick.score) },
                { k: "Mkt Cap",   v: `$${tip.tick.market_cap}B` },
                { k: "News Items",v: String(tip.tick.news_count) },
              ].map(({ k, v }) => (
                <div key={k}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--t4)", marginBottom: 2 }}>{k}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: "var(--t1)" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Legend ────────────────────────────────────────────────── */}
      <div style={{
        padding: "6px 20px", background: "var(--s1)",
        borderTop: "1px solid var(--b0)", flexShrink: 0,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--t4)" }}>Sentiment</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {[
            { color: "#EF5350", label: "Strong Bear" },
            { color: "#B71C1C", label: "Bear" },
            { color: "#1E2733", label: "Neutral" },
            { color: "#1B6B5E", label: "Bull" },
            { color: "#26A69A", label: "Strong Bull" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 24, height: 8, background: color, borderRadius: 2 }} />
              <span style={{ fontSize: 8, color: "var(--t4)", letterSpacing: ".04em" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
