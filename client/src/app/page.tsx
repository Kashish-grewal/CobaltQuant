"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useMarketData } from "@/hooks/useMarketData";
import { useSentiment } from "@/hooks/useSentiment";

const PriceChart = dynamic(() => import("@/components/PriceChart"), {
  ssr: false,
  loading: () => (
    <div className="loader"><div className="spinner" /><span>Loading chart</span></div>
  ),
});

const SentimentHeatmap = dynamic(() => import("@/components/SentimentHeatmap"), {
  ssr: false,
  loading: () => (
    <div className="loader"><div className="spinner" /><span>Loading heatmap</span></div>
  ),
});

const DebatePanel = dynamic(() => import("@/components/DebatePanel"), {
  ssr: false,
  loading: () => (
    <div className="loader"><div className="spinner" /><span>Loading debate</span></div>
  ),
});

const MLSignalsPanel = dynamic(() => import("@/components/MLSignalsPanel"), {
  ssr: false,
  loading: () => (
    <div className="loader"><div className="spinner" /><span>Loading signals</span></div>
  ),
});

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt  = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtV = (v: number) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : String(v);
const fmtT = (ms: number | null) => ms ? new Date(ms).toLocaleTimeString("en-US", { hour12: false }) : "—";

// ── Static data ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "terminal", label: "Terminal" },
  { id: "heatmap",  label: "Sentiment",  phase: "2" },
  { id: "debate",   label: "AI Debate",  phase: "3" },
  { id: "signals",  label: "ML Signals", phase: "4" },
];

const SECTORS = ["All","Technology","Finance","Healthcare","Energy","Consumer","Crypto"] as const;
const SECTOR_SHORT: Record<string, string> = {
  All:"ALL", Technology:"TECH", Finance:"FINA", Healthcare:"HEAL",
  Energy:"ENER", Consumer:"CONS", Crypto:"CRYP",
};

const SIGNALS = [
  { name:"RSI (14)",   val:"61.4",  tag:"HOLD", cls:"sig-hold" },
  { name:"MACD",       val:"+0.58", tag:"BUY",  cls:"sig-buy"  },
  { name:"Bollinger",  val:"Upper", tag:"SELL", cls:"sig-sell" },
  { name:"Sentiment",  val:"0.67",  tag:"BULL", cls:"sig-bull" },
  { name:"Vol. Ratio", val:"1.4×",  tag:"BULL", cls:"sig-bull" },
];

const CS: Record<string, { title:string; desc:string; features:string[] }> = {
  heatmap: {
    title: "Live Sentiment Heatmap",
    desc: "Every cell is an asset. Colour = sentiment, size = volume. Watch the grid shift in real time as news breaks.",
    features: ["NewsAPI → VADER / FinBERT pipeline","D3.js treemap with live transitions","WebSocket push on sentiment change"],
  },
  debate: {
    title: "Multi-Agent AI Debate",
    desc: "Three LangGraph agents argue Bull, Bear, and Neutral in split panels — streaming simultaneously via WebSocket.",
    features: ["LangGraph agent orchestration","Claude streaming via WebSocket","Persistent per-ticker debate memory"],
  },
  signals: {
    title: "ML Signal Engine",
    desc: "XGBoost trained on 5 years of OHLCV. Click any signal to see a SHAP waterfall chart explaining the output.",
    features: ["XGBoost with full SHAP explanations","62% directional accuracy on backtest","Live feature engineering pipeline"],
  },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data, isConnected, connectionStatus, lastUpdate, dataSource } = useMarketData();
  const sentiment = useSentiment();

  const [tab, setTab]       = useState("terminal");
  const [sym, setSym]       = useState("AAPL");
  const [sector, setSector] = useState("All");
  const [ticks, setTicks]   = useState(0);

  const [rowFlash, setRowFlash]     = useState<Record<string, "fp"|"fn">>({});
  const [priceFlash, setPriceFlash] = useState<"fp"|"fn"|null>(null);
  const prev = useRef<Record<string, number>>({});

  const assets  = Object.values(data);
  const sel     = data[sym];
  const visible = sector === "All" ? assets : assets.filter(a => a.sector === sector);
  const tape    = [...assets, ...assets];

  // Flash on price change
  useEffect(() => {
    if (!assets.length) return;
    setTicks(t => t + 1);
    const f: Record<string, "fp"|"fn"> = {};
    assets.forEach(a => {
      const p = prev.current[a.symbol];
      if (p !== undefined && p !== a.price) f[a.symbol] = a.price > p ? "fp" : "fn";
      prev.current[a.symbol] = a.price;
    });
    if (!Object.keys(f).length) return;
    setRowFlash(f);
    if (sym && f[sym]) setPriceFlash(f[sym]);
    const id = setTimeout(() => { setRowFlash({}); setPriceFlash(null); }, 380);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Connection display
  const connClass = isConnected ? "live" : connectionStatus === "connecting" ? "wait" : "offline";
  const connLabel = isConnected
    ? (dataSource === "yfinance" ? "Yahoo Finance" : dataSource === "alpaca_live" ? "Alpaca Live" : "Live")
    : connectionStatus === "connecting" ? "Connecting" : "Offline";

  const srcIsLive = dataSource === "yfinance" || dataSource === "alpaca_live";
  const srcLabel  = dataSource === "yfinance" ? "Yahoo Finance"
    : dataSource === "alpaca_live" ? "Alpaca Live"
    : dataSource === "mock" ? "Simulated"
    : "Connecting";

  const chartLabel = dataSource === "yfinance" ? "30s · Yahoo Finance"
    : dataSource === "alpaca_live" ? "500ms · Alpaca"
    : "1s · Simulated";

  return (
    <div className="shell">

      {/* ── Ticker Tape ──────────────────────────────────────────────── */}
      <div className="ticker-tape">
        <div className="ticker-track">
          {tape.map((a, i) => (
            <div key={`${a.symbol}-${i}`} className="ticker-item">
              <span className="tk-sym">{a.symbol}</span>
              <span className="tk-px">${fmt(a.price)}</span>
              <span className={`tk-chg ${a.change_pct >= 0 ? "up" : "dn"}`}>
                {a.change_pct >= 0 ? "▲" : "▼"}{Math.abs(a.change_pct).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Topbar ───────────────────────────────────────────────────── */}
      <header className="topbar">
        {/* Brand */}
        <div className="brand">
          <div className="brand-mark">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="rgba(255,255,255,0.9)"/>
              <rect x="7" y="1" width="4" height="4" rx="1" fill="rgba(255,255,255,0.55)"/>
              <rect x="1" y="7" width="4" height="4" rx="1" fill="rgba(255,255,255,0.55)"/>
              <rect x="7" y="7" width="4" height="4" rx="1" fill="rgba(255,255,255,0.3)"/>
            </svg>
          </div>
          <span className="brand-wordmark">Cobalt<em>Quant</em></span>
          <div className="divider" />
          <span className="brand-tag">Terminal</span>
        </div>

        {/* Nav */}
        <nav className="topbar-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.phase && <span className="nav-phase">P{t.phase}</span>}
            </button>
          ))}
        </nav>

        {/* Status */}
        <div className="topbar-right">
          <div className={`status-pill ${connClass}`}>
            <div className={`status-dot ${isConnected ? "pulse" : ""}`} />
            {connLabel}
          </div>
        </div>
      </header>

      {/* ── Workspace ────────────────────────────────────────────────── */}
      {tab === "terminal" ? (
        <div className="workspace">

          {/* LEFT: Watchlist */}
          <aside className="sidebar">
            <div className="wl-header">
              <span className="wl-title">Watchlist</span>
            </div>
            <div className="filter-row">
              {SECTORS.map(s => (
                <button
                  key={s}
                  className={`f-chip ${sector === s ? "on" : ""}`}
                  onClick={() => setSector(s)}
                >
                  {SECTOR_SHORT[s]}
                </button>
              ))}
            </div>
            <div className="wl-col-head">
              <span>Symbol</span>
              <span>Price</span>
              <span>Change</span>
            </div>
            <div className="asset-list">
              {visible.map(a => {
                const up = a.change_pct >= 0;
                return (
                  <div
                    key={a.symbol}
                    className={`asset-row ${sym === a.symbol ? "active" : ""} ${rowFlash[a.symbol] ?? ""}`}
                    onClick={() => setSym(a.symbol)}
                  >
                    <div className="ar-info">
                      <span className="ar-sym">{a.symbol}</span>
                      <span className="ar-name">{a.name}</span>
                    </div>
                    <span className="ar-price">${fmt(a.price)}</span>
                    <span className={`ar-chg ${up ? "up" : "dn"}`}>
                      {up ? "+" : ""}{a.change_pct.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* CENTER: Chart */}
          <main className="center">
            {/* Hero */}
            <div className="hero">
              <div className="hero-top">
                <span className="hero-sym">{sym}</span>
                {sel?.sector && (
                  <span className={`sector-badge sb-${sel.sector}`}>{sel.sector}</span>
                )}
                <span className="hero-name">{sel?.name}</span>
              </div>

              <div className="hero-price-row">
                <span className={`hero-price ${priceFlash ?? ""}`}>
                  ${sel ? fmt(sel.price) : "—"}
                </span>
                {sel && (
                  <span className={`hero-badge ${sel.change_pct >= 0 ? "up" : "dn"}`}>
                    {sel.change_pct >= 0 ? "▲" : "▼"} {Math.abs(sel.change_pct).toFixed(2)}%
                    &nbsp;({sel.change_pct >= 0 ? "+" : ""}{fmt(sel.change)})
                  </span>
                )}
              </div>

              <div className="hero-stats">
                <div className="hero-stat">
                  <span className="hs-label">Open</span>
                  <span className="hs-val">${sel ? fmt(sel.open) : "—"}</span>
                </div>
                <div className="stat-sep" />
                <div className="hero-stat">
                  <span className="hs-label">High</span>
                  <span className="hs-val hi">${sel ? fmt(sel.high) : "—"}</span>
                </div>
                <div className="stat-sep" />
                <div className="hero-stat">
                  <span className="hs-label">Low</span>
                  <span className="hs-val lo">${sel ? fmt(sel.low) : "—"}</span>
                </div>
                <div className="stat-sep" />
                <div className="hero-stat">
                  <span className="hs-label">Volume</span>
                  <span className="hs-val">{sel ? fmtV(sel.volume) : "—"}</span>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="chart-wrap">
              <div className="chart-toolbar">
                <span className="ct-sym">{sym}</span>
                <div className="ct-sep" />
                <span className="ct-label">{chartLabel}</span>
              </div>
              <div className="chart-inner">
                <PriceChart symbol={sym} ticks={[]} currentPrice={sel?.price ?? null} />
              </div>
            </div>
          </main>

          {/* RIGHT: Signals + Agents */}
          <aside className="right-panel">

            {/* ML Signals */}
            <div className="rp-section">
              <div className="rp-header">
                <div className="rp-title">
                  ML Signals
                  <span className="rp-sym">{sym}</span>
                </div>
                <span className="rp-phase">Phase 4</span>
              </div>
              <div className="signal-table">
                {SIGNALS.map(s => (
                  <div key={s.name} className="signal-row">
                    <span className="signal-name">{s.name}</span>
                    <div className="signal-right">
                      <span className="signal-val">{s.val}</span>
                      <span className={`sig-tag ${s.cls}`}>{s.tag}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="conf-wrap">
                <div className="conf-row">
                  <span className="conf-lbl">Confidence</span>
                  <span className="conf-pct">68%</span>
                </div>
                <div className="conf-bar">
                  <div className="conf-fill" style={{ width: "68%" }} />
                </div>
              </div>
            </div>

            {/* Agent Debate */}
            <div className="rp-section">
              <div className="rp-header">
                <div className="rp-title">Agent Debate</div>
                <span className="rp-phase">Phase 3</span>
              </div>
              <div className="agents-body">
                {[
                  { role:"Bull", cls:"bull", text:`Strong momentum in ${sym}. Earnings beat by 8% last quarter. Institutional accumulation visible in volume. Price target $195.` },
                  { role:"Bear", cls:"bear", text:`P/E of 28× stretched vs sector median 22×. Insider selling spiked last month. Rate headwinds compress multiples.` },
                  { role:"Neutral", cls:"neut", text:`Momentum supports Bulls short-term; valuation risk gives Bears a medium-term edge. Hold with tight stop.` },
                ].map(a => (
                  <div key={a.role} className={`agent-card ${a.cls}`}>
                    <div className="agent-head">
                      <div className="agent-bar" />
                      <span className="agent-name">{a.role} Agent</span>
                    </div>
                    <div className="agent-body-text">{a.text}</div>
                  </div>
                ))}

                <div className="coming-note">
                  <div className="coming-note-title">Phase 3 — Streaming</div>
                  <div className="coming-note-body">
                    LangGraph agents will stream live via WebSocket, arguing in real time for any selected ticker.
                  </div>
                </div>
              </div>
            </div>

          </aside>
        </div>

      ) : tab === "heatmap" ? (
        <SentimentHeatmap data={sentiment.data} isConnected={sentiment.isConnected} />
      ) : tab === "debate" ? (
        <DebatePanel ticker={sym} />
      ) : tab === "signals" ? (
        <MLSignalsPanel ticker={sym} />
      ) : (
        <div className="cs-view">
          <div className="cs-card">
            <span className="cs-chip">Phase {TABS.find(t => t.id === tab)?.phase} — Coming Soon</span>
            <div className="cs-title">{CS[tab]?.title}</div>
            <div className="cs-desc">{CS[tab]?.desc}</div>
            <div className="cs-list">
              {CS[tab]?.features.map(f => (
                <div key={f} className="cs-item">
                  <div className="cs-item-dot" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Status Bar ───────────────────────────────────────────────── */}
      <footer className="statusbar">
        <div className="sb-left">
          <div className={isConnected ? "sb-live" : "sb-offline"}>
            <div className="sb-dot" />
            {isConnected ? "Connected" : "Offline"}
          </div>
          <span className={`src-tag ${srcIsLive ? "live" : "sim"}`}>{srcLabel}</span>
        </div>
        <div className="sb-right">
          <span>Ticks {ticks.toLocaleString()}</span>
          <span>{visible.length} assets</span>
          <span>Last {fmtT(lastUpdate)}</span>
          <span>CobaltQuant v0.1</span>
        </div>
      </footer>

    </div>
  );
}
