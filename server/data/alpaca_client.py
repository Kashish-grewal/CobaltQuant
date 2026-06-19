"""
Alpaca Markets WebSocket Client — Real Live Prices
====================================================
Connects to Alpaca's free IEX data stream and broadcasts real trade prices
to all connected frontend clients via our WebSocket manager.

HOW ALPACA STREAMING WORKS:
  1. Connect to wss://stream.data.alpaca.markets/v2/iex
  2. Authenticate with API key + secret
  3. Subscribe to trade events for our symbols
  4. Each trade event = a real transaction that just happened on IEX exchange
  5. We update our in-memory price state and broadcast to all WS clients

IMPORTANT ABOUT FREE TIER:
  - Only IEX exchange data (not full SIP/consolidated tape)
  - Only streams during market hours: Mon–Fri 9:30 AM – 4:00 PM ET
  - Outside market hours: no data flows (market is closed)
  - We detect this and automatically fall back to mock data so the UI
    stays alive 24/7 even when markets are closed

ALPACA TRADE MESSAGE FORMAT:
  [{"T": "t", "S": "AAPL", "p": 182.50, "s": 100, "t": "2024-01-15T14:30:00Z",
    "c": ["@"], "z": "C"}]
  T = message type ("t" = trade)
  S = symbol
  p = price
  s = size (shares)
  t = timestamp (ISO 8601)
"""
import asyncio
import json
import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Callable, Awaitable

import websockets
from websockets.exceptions import ConnectionClosed

from config import get_settings
from data.assets import ASSET_META, SYMBOLS

logger = logging.getLogger(__name__)
settings = get_settings()

ALPACA_WS_URL = "wss://stream.data.alpaca.markets/v2/iex"

# US Eastern timezone — handles EDT/EST automatically
_ET = ZoneInfo("America/New_York")


def is_market_open() -> bool:
    """
    Check if US stock market is currently open.
    Market hours: Monday–Friday, 9:30 AM – 4:00 PM US Eastern Time.

    Uses zoneinfo.ZoneInfo which correctly handles EDT ↔ EST transitions
    (daylight saving), unlike hardcoded UTC offsets.

    For a production system: use the Alpaca /clock endpoint for holiday awareness.
    """
    now_et = datetime.now(_ET)

    # Skip weekends
    if now_et.weekday() >= 5:  # 5=Saturday, 6=Sunday
        return False

    # 9:30 AM = 9*60+30 = 570 minutes, 4:00 PM = 16*60 = 960 minutes
    minutes_et = now_et.hour * 60 + now_et.minute
    return 570 <= minutes_et < 960


class AlpacaLiveClient:
    """
    Manages the connection to Alpaca's real-time trade stream.
    
    DESIGN PATTERN — Observer / Callback:
    Rather than coupling this client to the WebSocket manager directly,
    we accept a `on_tick` callback. This makes the client reusable and testable.
    The prices_ws.py route passes its broadcast function as the callback.
    """

    def __init__(self, on_tick: Callable[[list[dict]], Awaitable[None]]):
        self.on_tick = on_tick
        self._running = False
        self._source_label = "alpaca_live"
        
        # In-memory price state — tracks the latest tick per symbol
        # Initialized to None; will populate once first trade arrives
        self._state: dict[str, dict] = {
            sym: {
                "symbol": sym,
                "name": meta["name"],
                "sector": meta["sector"],
                "price": 0.0,
                "open": 0.0,
                "high": 0.0,
                "low": float("inf"),
                "volume": 0,
                "change": 0.0,
                "change_pct": 0.0,
                "timestamp": int(time.time() * 1000),
            }
            for sym, meta in ASSET_META.items()
        }
        self._open_prices: dict[str, float] = {}  # first trade of the day

    def _process_trade(self, trade: dict) -> dict | None:
        """
        Convert a raw Alpaca trade message into our standard tick format.
        Returns None if the trade is for an unknown symbol.
        """
        sym = trade.get("S")
        price = trade.get("p")
        size = trade.get("s", 0)

        if sym not in self._state or not price:
            return None

        current = self._state[sym]

        # Record first trade of session as open price
        if sym not in self._open_prices:
            self._open_prices[sym] = price
            current["open"] = price
            current["high"] = price
            current["low"] = price

        open_p = self._open_prices[sym]
        current["price"] = price
        current["high"] = max(current["high"], price)
        current["low"] = min(current["low"], price)
        current["volume"] += size
        current["change"] = round(price - open_p, 2)
        current["change_pct"] = round((price - open_p) / open_p * 100, 4)
        current["timestamp"] = int(time.time() * 1000)

        return dict(current)  # return a copy

    async def _connect_and_stream(self):
        """
        Core connection loop. Handles auth, subscription, and message processing.
        """
        logger.info("🔌 Connecting to Alpaca IEX stream...")

        async with websockets.connect(
            ALPACA_WS_URL,
            ping_interval=20,
            ping_timeout=10,
        ) as ws:
            # Step 1: Wait for connection confirmation
            msg = await ws.recv()
            data = json.loads(msg)
            if data[0].get("msg") != "connected":
                raise RuntimeError(f"Unexpected connect response: {data}")
            logger.info("✅ Alpaca WebSocket connected")

            # Step 2: Authenticate
            await ws.send(json.dumps({
                "action": "auth",
                "key": settings.alpaca_api_key,
                "secret": settings.alpaca_secret_key,
            }))
            msg = await ws.recv()
            data = json.loads(msg)
            if data[0].get("msg") != "authenticated":
                raise RuntimeError(f"Auth failed: {data}. Check your ALPACA_API_KEY / ALPACA_SECRET_KEY in .env")
            logger.info("✅ Alpaca authenticated")

            # Step 3: Subscribe to trade events for all our symbols
            await ws.send(json.dumps({
                "action": "subscribe",
                "trades": SYMBOLS,
            }))
            logger.info(f"📡 Subscribed to trades: {', '.join(SYMBOLS)}")

            # Step 4: Process the stream
            # We batch updates: collect trades, then broadcast every 500ms
            pending_updates: dict[str, dict] = {}
            last_broadcast = time.time()

            async for raw_msg in ws:
                messages = json.loads(raw_msg)
                for msg in messages:
                    if msg.get("T") != "t":  # only process trade events
                        continue
                    tick = self._process_trade(msg)
                    if tick:
                        pending_updates[tick["symbol"]] = tick

                # Broadcast accumulated updates every 500ms
                # This prevents flooding the frontend with individual trades
                now = time.time()
                if pending_updates and (now - last_broadcast) >= 0.5:
                    ticks = list(pending_updates.values())
                    await self.on_tick(ticks)
                    pending_updates.clear()
                    last_broadcast = now

    async def run(self):
        """
        Main run loop with automatic reconnection and market-hours awareness.
        Exponential backoff prevents hammering the server on repeated failures.
        """
        self._running = True
        attempt = 0

        while self._running:
            if not is_market_open():
                logger.info("🕐 Market closed — Alpaca stream running in mock fallback mode.")
                self._source_label = "mock"
                from data.mock_prices import ASSETS
                
                # Seed state with mock prices if empty
                for asset in ASSETS:
                    sym = asset.symbol
                    if self._state[sym]["price"] == 0.0:
                        self._state[sym]["price"] = asset.price
                        self._state[sym]["open"] = asset.price
                        self._state[sym]["high"] = asset.price
                        self._state[sym]["low"] = asset.price

                tick_count = 0
                while self._running and not is_market_open():
                    ticks = []
                    for asset in ASSETS:
                        tick = asset.tick()
                        self._state[asset.symbol] = tick
                        ticks.append(tick)
                    await self.on_tick(ticks)
                    await asyncio.sleep(1.0)
                    
                    tick_count += 1
                    if tick_count >= 10:
                        tick_count = 0

                if self._running:
                    self._source_label = "alpaca_live"
                continue

            try:
                attempt += 1
                await self._connect_and_stream()

            except ConnectionClosed as e:
                logger.warning(f"Alpaca connection closed: {e}. Reconnecting...")
            except Exception as e:
                logger.error(f"Alpaca stream error (attempt {attempt}): {e}")

            # Exponential backoff: 2s, 4s, 8s... max 60s
            backoff = min(2 ** attempt, 60)
            logger.info(f"↩️  Reconnecting in {backoff}s...")
            await asyncio.sleep(backoff)

    def get_snapshot(self) -> list[dict]:
        """Return current state of all symbols for the initial snapshot."""
        return [dict(v) for v in self._state.values() if v["price"] > 0]

    def stop(self):
        self._running = False
