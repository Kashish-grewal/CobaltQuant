"use client";

import { useState, useRef, useEffect, useMemo, useCallback, memo, Suspense } from "react";
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

const SidebarMLSignals = dynamic(() => import("@/components/SidebarMLSignals"), {
  ssr: false,
  loading: () => (
    <div className="loader"><div className="spinner" /><span>Loading signals</span></div>
  ),
});

const SidebarDebate = dynamic(() => import("@/components/SidebarDebate"), {
  ssr: false,
  loading: () => (
    <div className="loader"><div className="spinner" /><span>Loading debate</span></div>
  ),
});

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt  = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtV = (v: number) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : String(v);
const fmtT = (ms: number | null) => ms ? new Date(ms).toLocaleTimeString("en-US", { hour12: false }) : "—";

// ── Sparkline component ───────────────────────────────────────────────────────
function Sparkline({ points = [], up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <div style={{ width: 48, height: 12, borderBottom: "1px dashed var(--b2)" }} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 48;
  const height = 12;
  const padding = 1;
  const coords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * (width - 2 * padding) + padding;
    const y = height - ((p - min) / range) * (height - 2 * padding) - padding;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        fill="none"
        stroke={up ? "var(--green)" : "var(--red)"}
        strokeWidth="1.2"
        points={coords}
      />
    </svg>
  );
}

// ── Memoized sub-components (prevent re-renders on unrelated state changes) ───
const TickerItem = memo(function TickerItem({ symbol, price, change_pct }: {
  symbol: string; price: number; change_pct: number;
}) {
  return (
    <div className="ticker-item">
      <span className="tk-sym">{symbol}</span>
      <span className="tk-px">${fmt(price)}</span>
      <span className={`tk-chg ${change_pct >= 0 ? "up" : "dn"}`}>
        {change_pct >= 0 ? "▲" : "▼"}{Math.abs(change_pct).toFixed(2)}%
      </span>
    </div>
  );
});

const AssetRow = memo(function AssetRow({ a, isSelected, flash, history = [], onSelect }: {
  a: { symbol: string; name: string; price: number; change_pct: number };
  isSelected: boolean;
  flash: "fp" | "fn" | undefined;
  history?: number[];
  onSelect: (sym: string) => void;
}) {
  const up = a.change_pct >= 0;
  return (
    <div
      className={`asset-row ${isSelected ? "active" : ""} ${flash ?? ""}`}
      onClick={() => onSelect(a.symbol)}
    >
      <div className="ar-info">
        <span className="ar-sym">{a.symbol}</span>
        <span className="ar-name">{a.name}</span>
      </div>
      <div className="ar-sparkline" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Sparkline points={history} up={up} />
      </div>
      <span className="ar-price">${fmt(a.price)}</span>
      <span className={`ar-chg ${up ? "up" : "dn"}`}>
        {up ? "+" : ""}{a.change_pct.toFixed(2)}%
      </span>
    </div>
  );
});

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

// SIGNALS constant removed — was hardcoded dead code. ML signals now come from /api/signals/{ticker} via SidebarMLSignals.

const CS: Record<string, { title:string; desc:string; features:string[] }> = {
  heatmap: {
    title: "Live Sentiment Heatmap",
    desc: "Every cell is an asset. Colour = sentiment, size = market cap. Watch the grid shift in real time as news breaks.",
    features: ["Yahoo Finance → VADER sentiment pipeline","D3.js treemap with live transitions","WebSocket push on sentiment change"],
  },
  debate: {
    title: "Multi-Agent AI Debate",
    desc: "Three AI agents argue Bull, Bear, and Neutral in split panels — streaming simultaneously via WebSocket.",
    features: ["OpenAI GPT-4o-mini streaming","Concurrent agent orchestration via WebSocket","Fallback to curated arguments when offline"],
  },
  signals: {
    title: "ML Signal Engine",
    desc: "XGBoost trained on 1 year of daily OHLCV. Each signal includes SHAP feature importance explanations.",
    features: ["XGBoost with full SHAP explanations","~60% directional accuracy on backtest","Live feature engineering (RSI, MACD, Bollinger, ATR)"],
  },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data, isConnected, connectionStatus, lastUpdate, dataSource } = useMarketData();
  const sentiment = useSentiment();

  const assets  = useMemo(() => Object.values(data), [data]);

  const [tab, setTab]       = useState("terminal");
  const [sym, setSym]       = useState("AAPL");
  const [sector, setSector] = useState("All");
  const [ticks, setTicks]   = useState(0);
  const [history, setHistory] = useState<Record<string, number[]>>({});

  // Manage rolling price history for sparklines
  useEffect(() => {
    if (!assets.length) return;
    setHistory(prev => {
      const next = { ...prev };
      let changed = false;
      assets.forEach(a => {
        const arr = next[a.symbol] || [];
        if (!arr.length || arr[arr.length - 1] !== a.price) {
          next[a.symbol] = [...arr, a.price].slice(-12); // Keep rolling 12 ticks
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [assets]);

  // Load selection from localStorage to persist across reloads
  useEffect(() => {
    const savedTab = localStorage.getItem("cobalt_tab");
    if (savedTab) setTab(savedTab);
    const savedSym = localStorage.getItem("cobalt_sym");
    if (savedSym) setSym(savedSym);
    const savedSector = localStorage.getItem("cobalt_sector");
    if (savedSector) setSector(savedSector);
  }, []);

  const changeTab = (newTab: string) => {
    setTab(newTab);
    localStorage.setItem("cobalt_tab", newTab);
  };

  const changeSym = (newSym: string) => {
    setSym(newSym);
    localStorage.setItem("cobalt_sym", newSym);
  };

  const changeSector = (newSector: string) => {
    setSector(newSector);
    localStorage.setItem("cobalt_sector", newSector);
  };

  const [rowFlash, setRowFlash]     = useState<Record<string, "fp"|"fn">>({});
  const [priceFlash, setPriceFlash] = useState<"fp"|"fn"|null>(null);
  const prev = useRef<Record<string, number>>({});

  const sel     = data[sym];
  const visible = useMemo(
    () => sector === "All" ? assets : assets.filter(a => a.sector === sector),
    [assets, sector]
  );
  // Doubled array for seamless ticker-tape loop — memoized so it's not recreated each render
  const tape = useMemo(() => [...assets, ...assets], [assets]);

  // Flash on price change — useCallback stabilises the closure
  const runFlash = useCallback(() => {
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
    return id;
  }, [assets, sym]);

  useEffect(() => {
    const id = runFlash();
    return () => { if (id) clearTimeout(id); };
  }, [runFlash]);

  // Connection display
  const connClass = isConnected ? "live" : connectionStatus === "connecting" ? "wait" : "offline";
  const connLabel = isConnected
    ? (dataSource === "yfinance" ? "Yahoo Finance" : dataSource === "alpaca_live" ? "Alpaca Live" : "Live")
    : connectionStatus === "connecting" ? "Connecting" : "Offline";

  const srcIsLive = dataSource === "yfinance" || dataSource === "alpaca_live";
  const srcLabel  = dataSource === "yfinance" ? "Yahoo Finance"
    : dataSource === "alpaca_live" ? "Alpaca Live"
    : dataSource === "mock" ? "Simulated"
    : dataSource === "mock_fallback" ? "Loading real data..."
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
            <TickerItem key={`${a.symbol}-${i}`} symbol={a.symbol} price={a.price} change_pct={a.change_pct} />
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
          <span className="brand-tag">Kashish&apos;s Terminal</span>
        </div>

        {/* Nav */}
        <nav className="topbar-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => changeTab(t.id)}
            >
              {t.label}
              {t.phase && <span className="nav-phase">P{t.phase}</span>}
            </button>
          ))}
        </nav>

        {/* Status */}
        <div className="topbar-right">
          <div className="matrix-monitor" title="Active Quantitative Cycles">
            <span className="mm-dot blink-1" />
            <span className="mm-dot blink-2" />
            <span className="mm-dot blink-3" />
            <span className="mm-dot blink-4" />
            <span className="mm-dot blink-1" />
            <span className="mm-dot blink-3" />
          </div>
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
                  onClick={() => changeSector(s)}
                >
                  {SECTOR_SHORT[s]}
                </button>
              ))}
            </div>
            <div className="wl-col-head">
              <span>Symbol</span>
              <span>Trend</span>
              <span>Price</span>
              <span>Change</span>
            </div>
            <div className="asset-list">
              {visible.map(a => (
                <AssetRow
                  key={a.symbol}
                  a={a}
                  isSelected={sym === a.symbol}
                  flash={rowFlash[a.symbol]}
                  history={history[a.symbol]}
                  onSelect={changeSym}
                />
              ))}
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
            <Suspense fallback={<div className="loader"><div className="spinner" /><span>Loading signals</span></div>}>
              <SidebarMLSignals symbol={sym} />
            </Suspense>
            <Suspense fallback={<div className="loader"><div className="spinner" /><span>Loading debate</span></div>}>
              <SidebarDebate symbol={sym} />
            </Suspense>
          </aside>
        </div>

      ) : tab === "heatmap" ? (
        <Suspense fallback={<div className="loader"><div className="spinner" /><span>Loading heatmap</span></div>}>
          <SentimentHeatmap data={sentiment.data} isConnected={sentiment.isConnected} />
        </Suspense>
      ) : tab === "debate" ? (
        <Suspense fallback={<div className="loader"><div className="spinner" /><span>Loading debate</span></div>}>
          <DebatePanel ticker={sym} />
        </Suspense>
      ) : tab === "signals" ? (
        <Suspense fallback={<div className="loader"><div className="spinner" /><span>Loading signals</span></div>}>
          <MLSignalsPanel ticker={sym} />
        </Suspense>
      ) : (
        <div className="cs-view">
          <div className="cs-radar">
            <svg viewBox="0 0 200 200" fill="none" style={{ width: "100%", height: "100%" }}>
              <circle cx="100" cy="100" r="90" stroke="var(--b1)" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx="100" cy="100" r="60" stroke="var(--b1)" strokeWidth="1" />
              <circle cx="100" cy="100" r="30" stroke="var(--b1)" strokeWidth="1" strokeDasharray="2 4" />
              
              <line x1="100" y1="100" x2="100" y2="10" stroke="var(--blue)" strokeWidth="1.5" className="cs-radar-sweep" />
              <circle cx="100" cy="10" r="3" fill="var(--blue)" />
              
              <circle cx="140" cy="60" r="2.5" fill="var(--green)" className="cs-radar-target-1" />
              <circle cx="70" cy="130" r="2" fill="var(--red)" className="cs-radar-target-2" />
            </svg>
          </div>
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
          <span className="disclaimer">Not financial advice</span>
          <span>CobaltQuant v0.1</span>
        </div>
      </footer>

    </div>
  );
}
