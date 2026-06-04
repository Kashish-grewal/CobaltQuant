"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

interface Props {
  symbol: string;
}

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
      fetchSignal(symbol);
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
                  <div className="signal-right">
                    <span className="signal-val">{fmtVal(s.feature, s.value)}</span>
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
