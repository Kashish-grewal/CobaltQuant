"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface DebateChunk {
  type: "debate_start" | "debate_chunk" | "debate_done";
  agent?: "bull" | "bear" | "neutral";
  chunk?: string;
  ticker?: string;
}

export type AgentText = { bull: string; bear: string; neutral: string };

export type DebateStatus = "idle" | "connecting" | "streaming" | "done" | "error";

interface UseDebateReturn {
  agentText:    AgentText;
  status:       DebateStatus;
  activeTicker: string | null;
  startDebate:  (ticker: string) => void;
  reset:        () => void;
}

const WS_URL = "ws://localhost:8000/ws/debate";

const EMPTY: AgentText = { bull: "", bear: "", neutral: "" };

export function useDebate(): UseDebateReturn {
  const [agentText, setAgentText]     = useState<AgentText>(EMPTY);
  const [status, setStatus]           = useState<DebateStatus>("idle");
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

  const wsRef  = useRef<WebSocket | null>(null);
  const dead   = useRef(false);

  // Establish persistent WS connection on mount
  const connect = useCallback(() => {
    if (dead.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen  = () => setStatus("idle");
    ws.onerror = () => setStatus("error");

    ws.onmessage = (evt) => {
      try {
        const msg: DebateChunk = JSON.parse(evt.data);

        if (msg.type === "debate_start") {
          setAgentText(EMPTY);
          setActiveTicker(msg.ticker ?? null);
          setStatus("streaming");
        } else if (msg.type === "debate_chunk" && msg.agent && msg.chunk) {
          setAgentText(prev => ({
            ...prev,
            [msg.agent!]: prev[msg.agent!] + msg.chunk,
          }));
        } else if (msg.type === "debate_done") {
          setStatus("done");
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (!dead.current) {
        setTimeout(connect, 800);
      }
    };
  }, []);

  useEffect(() => {
    dead.current = false;
    connect();
    return () => {
      dead.current = true;
      wsRef.current?.close();
    };
  }, [connect]);

  const startDebate = useCallback((ticker: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setStatus("connecting");
      return;
    }
    setStatus("streaming");
    setAgentText(EMPTY);
    setActiveTicker(ticker);
    ws.send(JSON.stringify({ action: "debate", ticker }));
  }, []);

  const reset = useCallback(() => {
    setAgentText(EMPTY);
    setStatus("idle");
    setActiveTicker(null);
  }, []);

  return { agentText, status, activeTicker, startDebate, reset };
}
