"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface SentimentTick {
  symbol:     string;
  score:      number;   // -1 to +1
  label:      string;   // "bullish" | "slightly_bullish" | "neutral" | "slightly_bearish" | "bearish"
  news_count: number;
  headline:   string;
  market_cap: number;   // USD billions (used for treemap cell size)
  ts:         number;
}

export type SentimentMap = Record<string, SentimentTick>;

interface UseSentimentReturn {
  data:        SentimentMap;
  isConnected: boolean;
  lastUpdate:  number | null;
}

const WS_URL    = "ws://localhost:8000/ws/sentiment";
const MIN_DELAY = 500;
const MAX_DELAY = 8000;

export function useSentiment(): UseSentimentReturn {
  const [data, setData]               = useState<SentimentMap>({});
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate]   = useState<number | null>(null);

  const wsRef    = useRef<WebSocket | null>(null);
  const delay    = useRef(MIN_DELAY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dead     = useRef(false);

  const connect = useCallback(() => {
    if (dead.current) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      delay.current = MIN_DELAY;
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type !== "sentiment_update") return;
        const ticks: SentimentTick[] = msg.data;
        setData(prev => {
          const next = { ...prev };
          ticks.forEach(t => { next[t.symbol] = t; });
          return next;
        });
        setLastUpdate(msg.timestamp ?? Date.now());
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      if (!dead.current) {
        timerRef.current = setTimeout(() => {
          delay.current = Math.min(delay.current * 1.5, MAX_DELAY);
          connect();
        }, delay.current);
      }
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    dead.current = false;   // reset on every mount (React Strict Mode runs twice)
    connect();
    return () => {
      dead.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { data, isConnected, lastUpdate };
}
