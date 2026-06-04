"use client";

import { useEffect, useRef } from "react";
import { useDebate } from "@/hooks/useDebate";

interface Props {
  symbol: string;
}

const ROLES = [
  { key: "bull" as const, label: "Bull Agent", cls: "bull", barColor: "var(--green)" },
  { key: "bear" as const, label: "Bear Agent", cls: "bear", barColor: "var(--red)" },
  { key: "neutral" as const, label: "Neutral Agent", cls: "neut", barColor: "var(--amber)" },
];

function Cursor() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 12,
        background: "currentColor",
        opacity: 0.7,
        marginLeft: 2,
        verticalAlign: "text-bottom",
        animation: "blink 1s step-end infinite",
      }}
    />
  );
}

export default function SidebarDebate({ symbol }: Props) {
  const { agentText, status, activeTicker, startDebate, reset } = useDebate();
  
  const scrollRefs = {
    bull: useRef<HTMLDivElement>(null),
    bear: useRef<HTMLDivElement>(null),
    neutral: useRef<HTMLDivElement>(null),
  };

  // Auto-run debate when symbol changes
  useEffect(() => {
    if (symbol) {
      startDebate(symbol);
    }
    return () => {
      reset();
    };
  }, [symbol, startDebate, reset]);

  // Auto-scroll each card as text streams in
  useEffect(() => {
    Object.values(scrollRefs).forEach(ref => {
      if (ref.current) {
        ref.current.scrollTop = ref.current.scrollHeight;
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentText]);

  const isStreaming = status === "streaming";
  const isDone      = status === "done";
  const isIdle      = status === "idle" || status === "error";

  return (
    <div className="rp-section" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div className="rp-header" style={{ flexShrink: 0 }}>
        <div className="rp-title">
          Agent Debate
          {isStreaming && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--green)",
                  animation: "blink 1.2s ease-in-out infinite",
                }}
              />
              <span style={{ fontSize: "10px", color: "var(--green)", fontWeight: 700 }}>LIVE</span>
            </span>
          )}
        </div>
        
        {/* Manual controls */}
        <div>
          {isStreaming && (
            <button
              onClick={reset}
              style={{
                fontSize: "11px",
                color: "var(--t3)",
                border: "1px solid var(--b2)",
                padding: "2px 6px",
                borderRadius: "3px",
              }}
            >
              ✕ Stop
            </button>
          )}
          {(isDone || isIdle) && (
            <button
              onClick={() => startDebate(symbol)}
              style={{
                fontSize: "11px",
                color: "var(--blue-b)",
                background: "var(--blue-bg)",
                border: "1px solid var(--blue-bdr)",
                padding: "2px 6px",
                borderRadius: "3px",
              }}
            >
              {isDone ? "↺ Re-run" : "▶ Run"}
            </button>
          )}
        </div>
      </div>

      {/* Agents cards container */}
      <div className="agents-body" style={{ flex: 1, overflowY: "auto" }}>
        {ROLES.map((role) => {
          const text = agentText[role.key];
          const active = isStreaming && text.length > 0 && text.length < 1000;
          const wordCount = text.split(" ").length;
          const percent = isDone ? 100 : Math.min(100, (wordCount / 45) * 100);

          return (
            <div key={role.key} className={`agent-card ${role.cls}`} style={{ display: "flex", flexDirection: "column" }}>
              <div className="agent-head" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", padding: "8px 10px 4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="agent-bar" />
                  <span className="agent-name">{role.label}</span>
                </div>
                
                {/* Horizontal progress bar */}
                {(isStreaming || isDone) && text.length > 0 && (
                  <div style={{ height: "1px", background: "var(--b1)", marginTop: "4px", borderRadius: "1px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: role.barColor, width: `${percent}%`, transition: "width 0.3s" }} />
                  </div>
                )}
              </div>
              
              <div 
                ref={scrollRefs[role.key]}
                className="agent-body-text" 
                style={{ 
                  maxHeight: "110px", 
                  overflowY: "auto", 
                  fontSize: "12px", 
                  lineHeight: "1.6",
                  color: text.length === 0 ? "var(--t4)" : "var(--t2)",
                  fontFamily: "var(--sans)",
                }}
              >
                {text.length === 0 && isIdle && "Awaiting debate stream..."}
                {text.length === 0 && isStreaming && "Thinking..."}
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
    </div>
  );
}
