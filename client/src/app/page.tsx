"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* ── Boot log line ──────────────────────────────────────────────────────────── */
function BootLine({ text, delay, prefix = "✓" }: { text: string; delay: number; prefix?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!show) return null;
  return (
    <div className="boot-line">
      <span className="boot-ok">{prefix}</span>
      <span className="boot-text">{text}</span>
    </div>
  );
}

/* ── Live clock ─────────────────────────────────────────────────────────────── */
function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-US", { hour12: false }));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);
  return <span className="lp-clock">{time}</span>;
}

/* ── Main ───────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [phase, setPhase] = useState(0);

  // Progress through boot phases
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="lp-root">

      {/* ── Top status bar ─────────────────────────── */}
      <div className="lp-topbar">
        <div className="lp-topbar-l">
          <span className="lp-sys-tag">SYS</span>
          <span className="lp-topbar-dim">cobaltquant v0.1.0</span>
        </div>
        <div className="lp-topbar-r">
          <Clock />
        </div>
      </div>

      {/* ── Grid structure ─────────────────────────── */}
      <main className="lp-grid">

        {/* Left Column: Metadata Index */}
        <div className="lp-col">
          <span className="lp-index-tag">Index / Contents</span>
          
          <div className="lp-index-list">
            <div className="lp-index-item">
              <span className="lp-index-num">SECTION 01</span>
              <span className="lp-index-label">Live Market Feed</span>
              <span style={{ fontSize: "9.5px", color: "var(--t3)", marginTop: "2px" }}>Real-time tracking of asset prices and volume dynamics</span>
            </div>
            <div className="lp-index-item">
              <span className="lp-index-num">SECTION 02</span>
              <span className="lp-index-label">Public Sentiment</span>
              <span style={{ fontSize: "9.5px", color: "var(--t3)", marginTop: "2px" }}>Media headlines parsed to measure market consensus</span>
            </div>
            <div className="lp-index-item">
              <span className="lp-index-num">SECTION 03</span>
              <span className="lp-index-label">Consensus Debate</span>
              <span style={{ fontSize: "9.5px", color: "var(--t3)", marginTop: "2px" }}>Multi-agent analysis providing balanced perspectives</span>
            </div>
            <div className="lp-index-item">
              <span className="lp-index-num">SECTION 04</span>
              <span className="lp-index-label">Predictive Index</span>
              <span style={{ fontSize: "9.5px", color: "var(--t3)", marginTop: "2px" }}>Advanced models calculating directional price trends</span>
            </div>
          </div>
        </div>

        {/* Center Column: Editorial Header */}
        <div className="lp-col lp-col-center">
          <div>
            <span className="lp-volume">Vol. 01 / Issue 01</span>
            
            <h1 className="lp-main-title">
              CobaltQuant
            </h1>
            
            <p className="lp-tagline">
              A collaborative intelligence terminal for global financial markets. Stream live asset indexes, explore collective AI logic, and track advanced forecasting models.
            </p>
          </div>

          {/* Interactive Editorial SVG Chart */}
          <div className="lp-vector-chart">
            <svg viewBox="0 0 400 150" fill="none" style={{ width: "100%" }}>
              {/* Grid lines */}
              <line x1="0" y1="30" x2="400" y2="30" stroke="var(--b1)" strokeWidth="1" strokeDasharray="2 4" />
              <line x1="0" y1="75" x2="400" y2="75" stroke="var(--b1)" strokeWidth="1" />
              <line x1="0" y1="120" x2="400" y2="120" stroke="var(--b1)" strokeWidth="1" strokeDasharray="2 4" />
              
              <line x1="100" y1="0" x2="100" y2="150" stroke="var(--b1)" strokeWidth="1" strokeDasharray="2 4" />
              <line x1="200" y1="0" x2="200" y2="150" stroke="var(--b1)" strokeWidth="1" />
              <line x1="300" y1="0" x2="300" y2="150" stroke="var(--b1)" strokeWidth="1" strokeDasharray="2 4" />

              {/* Trend path */}
              <path
                d="M 0 110 Q 50 120 100 80 T 200 60 T 300 110 T 400 20"
                fill="none"
                stroke="var(--blue)"
                strokeWidth="1.5"
                className="lp-trend-path"
              />
              
              {/* Nodes */}
              <circle cx="200" cy="60" r="3.5" fill="var(--blue)" />
              <circle cx="200" cy="60" r="9" stroke="var(--blue)" strokeWidth="1" strokeDasharray="2 2" className="lp-node-pulse" />
              
              <text x="210" y="55" fill="var(--blue)" fontSize="8.5" fontFamily="var(--mono)" letterSpacing="0.04em">FORECAST_INDEX: +4.82%</text>
              <text x="10" y="20" fill="var(--t4)" fontSize="8" fontFamily="var(--mono)" letterSpacing="0.06em">PREDICTIVE STOCHASTIC RANGE</text>
              <text x="345" y="140" fill="var(--t4)" fontSize="8" fontFamily="var(--mono)" letterSpacing="0.06em">SEC_INDEX</text>
            </svg>
          </div>

          <div className="lp-coordinates">
            <span>COORD: 37.7749° N, 122.4194° W</span>
            <span>SYS: ACTIVE</span>
          </div>
        </div>

        {/* Right Column: Technical Logs & Enter Panel */}
        <div className="lp-col lp-col-right">
          <div>
            <div className="lp-log-title">Terminal Stream Process</div>
            
            <div className="lp-boot-log">
              <BootLine delay={600} text="Establishing connection to global asset feeds..." />
              <BootLine delay={900} text="Analysing financial media and market headlines..." />
              <BootLine delay={1200} text="Initialising multi-agent debate pipelines..." />
              <BootLine delay={1500} text="Generating predictive trend metrics..." />
              <BootLine delay={1800} text="Synthesising data streams into terminal interface..." />
            </div>
          </div>

          {phase >= 3 && (
            <div className="lp-enter-section">
              <div className="lp-enter-prompt">
                <span className="lp-prompt">$</span>
                <span className="lp-enter-text">system ready</span>
              </div>
              <Link href="/dashboard" className="lp-enter-btn" id="enter-terminal-btn">
                Enter Terminal <span className="lp-enter-arrow">→</span>
              </Link>
            </div>
          )}
        </div>

      </main>

      {/* ── Bottom bar ─────────────────────────────── */}
      <div className="lp-bottombar">
        <span>Built by Kashish Grewal</span>
        <span className="lp-sep">·</span>
        <span>MIT License</span>
        <span className="lp-sep">·</span>
        <span>Not financial advice</span>
      </div>
    </div>
  );
}
