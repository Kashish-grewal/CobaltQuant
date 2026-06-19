"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ShapEntry, SignalData, FetchStatus } from "@/types/signals";

interface Props { symbol: string }

const fmtVal = (featureName: string, val: number): string => {
  if (featureName.includes("Momentum") || featureName.includes("Volatility") || featureName.includes("ATR")) {
    // If momentum is stored as decimal return percentage
    const pct = val * 100;
    return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
  }
  if (featureName.includes("Volume")) {
    return val.toFixed(1) + "x";
  }
  if (featureName.includes("MACD")) {
    return (val >= 0 ? "+" : "") + val.toFixed(2);
  }
  return val.toFixed(1);
};

function ShapForceBar({ shap }: { shap: number }) {
  const maxPercent = 50; // Max half width
  // A SHAP value of 0.008 represents maximum bar width on each side
  const rawPct = Math.abs(shap) * 6250;
  const widthPct = Math.min(rawPct, maxPercent);
  const up = shap > 0;
  
  return (
    <div className="shap-force-bar" style={{
      width: "50px",
      height: "4px",
      background: "var(--s3)",
      position: "relative",
      border: "1px solid var(--b1)",
      overflow: "hidden",
      borderRadius: "1px"
    }}>
      <div style={{
        position: "absolute",
        left: "50%",
        top: 0,
        bottom: 0,
        width: "1px",
        background: "rgba(255,255,255,0.12)",
        zIndex: 1
      }} />
      <div style={{
        position: "absolute",
        left: up ? "50%" : `calc(50% - ${widthPct}%)`,
        width: `${widthPct}%`,
        height: "100%",
        background: up ? "var(--green)" : "var(--red)"
      }} />
    </div>
  );
}

export default function SidebarMLSignals({ symbol }: Props) {
  const [result, setResult] = useState<SignalData | null>(null);
  const [status, setStatus] = useState<FetchStatus>("idle");
  const prevSymbol = useRef<string>("");

  const fetchSignal = useCallback(async (s: string) => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/signals/${s}`);
      const data = await res.json();
      if (data.error) {
        setStatus("error");
      } else {
        setResult(data);
        setStatus("done");
      }
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (symbol && symbol !== prevSymbol.current) {
      prevSymbol.current = symbol;
      // Debounce: wait 400ms before fetching to avoid spamming during rapid ticker switching
      const timer = setTimeout(() => {
        if (prevSymbol.current === symbol) {
          fetchSignal(symbol);
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [symbol, fetchSignal]);

  const getTagInfo = (shap: number) => {
    if (shap > 0.002) {
      return { tag: "BUY", cls: "sig-buy" };
    } else if (shap < -0.002) {
      return { tag: "SELL", cls: "sig-sell" };
    } else {
      return { tag: "HOLD", cls: "sig-hold" };
    }
  };

  return (
    <div className="rp-section">
      <div className="rp-header">
        <div className="rp-title">
          ML Signals
          <span className="rp-sym">{symbol}</span>
        </div>
        {status === "done" && result && (
          <span className="rp-phase" style={{ fontSize: "10px" }}>
            ACC: {(result.model_accuracy * 100).toFixed(0)}%
          </span>
        )}
        {status === "loading" && (
          <span className="rp-phase" style={{ background: "transparent", border: "none", color: "var(--blue)" }}>
            Training...
          </span>
        )}
      </div>

      {status === "loading" && (
        <div style={{ padding: "20px 14px", display: "flex", alignItems: "center", gap: 10, color: "var(--t3)" }}>
          <div className="spinner" />
          <span style={{ fontSize: "12px", fontFamily: "var(--mono)" }}>Calculating features...</span>
        </div>
      )}

      {status === "error" && (
        <div style={{ padding: "14px", fontSize: "12px", color: "var(--red)", fontFamily: "var(--mono)" }}>
          Error training model
        </div>
      )}

      {status === "done" && result && (
        <>
          <div className="signal-table">
            {result.shap_values.slice(0, 5).map((s) => {
              const { tag, cls } = getTagInfo(s.shap);
              return (
                <div key={s.feature} className="signal-row">
                  <span className="signal-name">{s.feature}</span>
                  <div className="signal-right" style={{ gap: "10px" }}>
                    <span className="signal-val">{fmtVal(s.feature, s.value)}</span>
                    <ShapForceBar shap={s.shap} />
                    <span className={`sig-tag ${cls}`}>{tag}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="conf-wrap">
            <div className="conf-row">
              <span className="conf-lbl" style={{ display: "flex", gap: "6px" }}>
                <span>Confidence ({result.signal})</span>
              </span>
              <span className="conf-pct">{(result.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="conf-bar">
              <div
                className="conf-fill"
                style={{
                  width: `${(result.confidence * 100).toFixed(0)}%`,
                  background: result.signal === "BUY" ? "var(--green)" : result.signal === "SELL" ? "var(--red)" : "var(--amber)"
                }}
              />
            </div>
            <div style={{ marginTop: 8, fontSize: "9px", color: "var(--t4)", fontFamily: "var(--mono)", lineHeight: 1.4, letterSpacing: ".02em" }}>
              Experimental model · ~60% backtest accuracy · Not financial advice
            </div>
          </div>
        </>
      )}

      {status === "idle" && (
        <div style={{ padding: "14px", color: "var(--t4)", fontSize: "12px" }}>
          Select an asset to view ML Signals
        </div>
      )}
    </div>
  );
}
