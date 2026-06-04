"use client";

import { useEffect, useRef } from "react";
import { useDebate } from "@/hooks/useDebate";

interface Props {
  ticker: string;
}

const ROLES = [
  {
    key:    "bull"    as const,
    label:  "Bull Agent",
    tag:    "LONG",
    color:  "var(--green)",
    bg:     "var(--green-bg)",
    border: "var(--green-bdr)",
    bar:    "#26A69A",
  },
  {
    key:    "bear"    as const,
    label:  "Bear Agent",
    tag:    "SHORT",
    color:  "var(--red)",
    bg:     "var(--red-bg)",
    border: "var(--red-bdr)",
    bar:    "#EF5350",
  },
  {
    key:    "neutral" as const,
    label:  "Neutral Agent",
    tag:    "HOLD",
    color:  "var(--amber)",
    bg:     "var(--amber-bg)",
    border: "var(--amber-bdr)",
    bar:    "#F59E0B",
  },
];

function Cursor() {
  return (
    <span style={{
      display: "inline-block",
      width: 7, height: 13,
      background: "currentColor",
      opacity: 0.7,
      marginLeft: 2,
      verticalAlign: "text-bottom",
      animation: "blink 1s step-end infinite",
    }} />
  );
}

export default function DebatePanel({ ticker }: Props) {
  const { agentText, status, activeTicker, startDebate, reset } = useDebate();
  const scrollRefs = {
    bull:    useRef<HTMLDivElement>(null),
    bear:    useRef<HTMLDivElement>(null),
    neutral: useRef<HTMLDivElement>(null),
  };

  // Auto-scroll each panel as text streams in
  useEffect(() => {
    Object.values(scrollRefs).forEach(ref => {
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentText]);

  // Auto-start when ticker changes and debate is idle/done
  useEffect(() => {
    if (status === "streaming") reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const isStreaming = status === "streaming";
  const isDone      = status === "done";
  const isIdle      = status === "idle" || status === "error";

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "var(--bg)", overflow: "hidden",
    }}>

      {/* ── Control bar ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "10px 20px", background: "var(--s1)",
        borderBottom: "1px solid var(--b0)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "var(--t0)",
          }}>{ticker}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
            padding: "2px 6px", borderRadius: 2,
            background: "var(--blue-bg,rgba(79,142,247,0.08))",
            border: "1px solid rgba(79,142,247,0.2)",
            color: "var(--blue,#4F8EF7)",
          }}>AI Debate</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Status indicator */}
          {isStreaming && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%", background: "var(--green)",
                animation: "pulse 1.2s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 700, letterSpacing: ".08em" }}>
                STREAMING
              </span>
            </div>
          )}
          {isDone && (
            <span style={{ fontSize: 11, color: "var(--t3)", letterSpacing: ".08em" }}>
              COMPLETE · {activeTicker}
            </span>
          )}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {(isDone || isIdle) && (
            <button
              onClick={() => startDebate(ticker)}
              style={{
                padding: "5px 14px",
                background: "var(--blue,#4F8EF7)",
                border: "none", borderRadius: 4,
                fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700,
                letterSpacing: ".06em", color: "#fff", cursor: "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              {isDone ? "↺ Re-run" : "▶ Run Debate"}
            </button>
          )}
          {isStreaming && (
            <button
              onClick={reset}
              style={{
                padding: "5px 14px",
                background: "transparent",
                border: "1px solid var(--b2)", borderRadius: 4,
                fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700,
                letterSpacing: ".06em", color: "var(--t3)", cursor: "pointer",
              }}
            >
              ✕ Stop
            </button>
          )}
        </div>
      </div>

      {/* ── Three agent columns ──────────────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, overflow: "hidden" }}>
        {ROLES.map(role => {
          const text = agentText[role.key];
          const active = isStreaming && text.length > 0 && text.length < 1000;

          return (
            <div key={role.key} style={{
              display: "flex", flexDirection: "column",
              background: "var(--s0)", overflow: "hidden",
              borderRight: role.key !== "neutral" ? "1px solid var(--b0)" : undefined,
            }}>
              {/* Agent header */}
              <div style={{
                padding: "12px 16px 10px",
                borderBottom: "1px solid var(--b0)",
                flexShrink: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{
                    width: 3, height: 14, borderRadius: 2,
                    background: role.bar, flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--t0)",
                    letterSpacing: ".04em",
                  }}>{role.label}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: ".12em",
                    padding: "1px 5px", borderRadius: 2,
                    background: role.bg, border: `1px solid ${role.border}`,
                    color: role.color, marginLeft: "auto",
                  }}>{role.tag}</span>
                </div>

                {/* Word count progress */}
                {(isStreaming || isDone) && (
                  <div style={{
                    height: 1, background: "var(--b1)", borderRadius: 1, overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%", background: role.bar, borderRadius: 1,
                      width: isDone ? "100%" : `${Math.min(100, (text.split(" ").length / 45) * 100)}%`,
                      transition: "width 0.3s",
                    }} />
                  </div>
                )}
              </div>

              {/* Streaming text area */}
              <div
                ref={scrollRefs[role.key]}
                style={{
                  flex: 1, overflowY: "auto", padding: "14px 16px",
                  fontFamily: "var(--sans,'Inter',sans-serif)",
                  fontSize: 13, lineHeight: 1.72, color: "var(--t1)",
                  letterSpacing: ".01em",
                }}
              >
                {text.length === 0 && isIdle && (
                  <div style={{
                    height: "100%", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      border: `2px solid ${role.bar}22`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: role.bar, opacity: 0.4,
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--t4)", letterSpacing: ".08em" }}>
                      {role.label.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--t4)" }}>
                      Press Run Debate to start
                    </span>
                  </div>
                )}

                {text.length === 0 && isStreaming && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--t4)" }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: "50%",
                      border: `1.5px solid ${role.bar}`,
                      borderTopColor: "transparent",
                      animation: "spin 0.7s linear infinite",
                    }} />
                    <span style={{ fontSize: 11 }}>Thinking…</span>
                  </div>
                )}

                {text.length > 0 && (
                  <span>
                    {text}
                    {active && <Cursor />}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Disclaimer Banner ─────────────────────────────────────── */}
      <div style={{
        padding: "8px 20px",
        background: "rgba(245,158,11,0.03)",
        borderTop: "1px solid var(--b0)",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: "var(--amber)", lineHeight: 1 }}>⚠️</span>
        <span style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.4 }}>
          <strong>Notice:</strong> Agent opinions, price targets (e.g. $230), and buy/sell recommendations are generated by LLM models for comparative analysis and debate purposes. They are arguments to weigh, not verified predictions or financial advice.
        </span>
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div style={{
        padding: "5px 20px", background: "var(--s1)",
        borderTop: "1px solid var(--b0)", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 11, color: "var(--t4)", letterSpacing: ".04em" }}>
          Phase 3 · Mock streaming — plug in LangGraph + Claude to go live
        </span>
        <span style={{ fontSize: 11, color: "var(--t4)" }}>
          {process.env.NEXT_PUBLIC_WS_URL ? `${process.env.NEXT_PUBLIC_WS_URL}/ws/debate` : "ws://localhost:8000/ws/debate"}
        </span>
      </div>

    </div>
  );
}
