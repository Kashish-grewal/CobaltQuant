/**
 * WebSocket Hook — useMarketData
 * ================================
 * Custom React hook that manages the entire WebSocket lifecycle.
 * 
 * WHAT THIS TEACHES YOU:
 * - Custom hooks extract stateful logic from components (reusability)
 * - useEffect with cleanup prevents memory leaks
 * - useRef for the WebSocket instance (not useState) because we don't want
 *   re-renders when the socket opens/closes — only when DATA changes
 * - Exponential backoff reconnection is production-standard
 */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface AssetTick {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  change_pct: number;
  timestamp: number;
}

export type MarketData = Record<string, AssetTick>;

export type DataSource = "yfinance" | "alpaca_live" | "mock" | "mock_fallback" | "unknown";

interface UseMarketDataReturn {
  data: MarketData;
  isConnected: boolean;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  lastUpdate: number | null;
  dataSource: DataSource;
  marketOpen: boolean | null;
}

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export function useMarketData(): UseMarketDataReturn {
  const [data, setData] = useState<MarketData>({});
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>("unknown");
  const [marketOpen, setMarketOpen] = useState<boolean | null>(null);

  // useRef: persists across renders without causing re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    // Don't connect if already open
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus("connecting");

    const ws = new WebSocket(`${WS_URL}/ws/prices`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setConnectionStatus("connected");
      reconnectAttempts.current = 0; // Reset on successful connection
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "heartbeat") {
          if (msg.market_open !== undefined) setMarketOpen(msg.market_open);
          return;
        }

        if (
          msg.type === "price_update" ||
          msg.type === "initial_snapshot"
        ) {
          // Track the data source so UI can show LIVE vs MOCK badge
          if (msg.source) setDataSource(msg.source as DataSource);
          if (msg.market_open !== undefined) setMarketOpen(msg.market_open);

          // Transform array → Record<symbol, tick> for O(1) lookups by symbol
          setData((prev) => {
            const next = { ...prev };
            for (const tick of msg.data as AssetTick[]) {
              next[tick.symbol] = tick;
            }
            return next;
          });
          setLastUpdate(msg.timestamp);
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
    };

    ws.onclose = () => {
      setIsConnected(false);
      setConnectionStatus("disconnected");

      // Fast reconnect: 300ms → 600ms → 1.2s → 2.4s → 3s (cap)
      // Resets after 5 attempts so it never gets stuck in slow-retry mode
      const attempt = reconnectAttempts.current % 5;
      const backoff = Math.min(300 * Math.pow(2, attempt), 3_000);
      reconnectAttempts.current += 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, backoff);
    };
  }, []);

  useEffect(() => {
    connect();

    // CLEANUP: runs when component unmounts (e.g., user navigates away)
    // Without this, the WebSocket stays open forever → memory leak
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { data, isConnected, connectionStatus, lastUpdate, dataSource, marketOpen };
}
