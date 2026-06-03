"""
Yahoo Finance Client — FAST version
=====================================
Uses yf.Ticker.fast_info instead of yf.download().

WHY fast_info IS FASTER:
  yf.download(period='1d', interval='1m') fetches every 1-minute bar
  for the whole trading day — 400+ rows × 16 symbols = huge payload.

  yf.Ticker.fast_info fetches only the current quote summary:
  price, day_high, day_low, open, volume — that's it.
  One tiny JSON response per symbol instead of a giant CSV.

BENCHMARK (approximate):
  yf.download() first call:  ~40–60 seconds
  fast_info per symbol:      ~0.3–0.5 seconds
  16 symbols in parallel:    ~1.5–3 seconds total

TRADE-OFF:
  fast_info doesn't give us minute-by-minute bars for charts.
  But for the dashboard we only need the CURRENT price per symbol.
  The TradingView chart builds its own history from WebSocket updates.
"""
import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Awaitable

import yfinance as yf

logger = logging.getLogger(__name__)

ASSET_META: dict[str, dict] = {
    "AAPL":  {"name": "Apple",               "sector": "Technology"},
    "MSFT":  {"name": "Microsoft",           "sector": "Technology"},
    "NVDA":  {"name": "NVIDIA",              "sector": "Technology"},
    "GOOGL": {"name": "Alphabet",            "sector": "Technology"},
    "META":  {"name": "Meta",                "sector": "Technology"},
    "AMD":   {"name": "AMD",                 "sector": "Technology"},
    "JPM":   {"name": "JPMorgan",            "sector": "Finance"},
    "GS":    {"name": "Goldman Sachs",       "sector": "Finance"},
    "V":     {"name": "Visa",                "sector": "Finance"},
    "JNJ":   {"name": "J&J",                 "sector": "Healthcare"},
    "PFE":   {"name": "Pfizer",              "sector": "Healthcare"},
    "XOM":   {"name": "Exxon",               "sector": "Energy"},
    "CVX":   {"name": "Chevron",             "sector": "Energy"},
    "AMZN":  {"name": "Amazon",              "sector": "Consumer"},
    "TSLA":  {"name": "Tesla",               "sector": "Consumer"},
    "IBIT":  {"name": "iShares Bitcoin ETF", "sector": "Crypto"},
}

SYMBOLS = list(ASSET_META.keys())
POLL_INTERVAL = 30.0

# Reuse a thread pool — cheaper than creating threads on every poll
_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="yfinance")


def _fetch_one(sym: str) -> dict | None:
    """
    Fetch current quote for a single symbol using fast_info.
    Runs in a thread (not the async event loop).
    Returns None if the symbol has no data (market closed / bad ticker).
    """
    try:
        meta = ASSET_META[sym]
        ticker = yf.Ticker(sym)
        fi = ticker.fast_info  # lightweight quote — no history download

        price = fi.last_price
        if not price or price != price:  # NaN check
            return None

        open_p  = getattr(fi, "open",       None) or price
        high    = getattr(fi, "day_high",   None) or price
        low     = getattr(fi, "day_low",    None) or price
        volume  = getattr(fi, "three_month_average_volume", None) or 0

        change     = round(price - open_p, 2)
        change_pct = round((change / open_p) * 100, 4) if open_p else 0.0

        return {
            "symbol":     sym,
            "name":       meta["name"],
            "sector":     meta["sector"],
            "price":      round(price, 2),
            "open":       round(open_p, 2),
            "high":       round(high, 2),
            "low":        round(low, 2),
            "volume":     int(volume),
            "change":     change,
            "change_pct": change_pct,
            "timestamp":  int(time.time() * 1000),
        }
    except Exception as e:
        logger.debug(f"fast_info failed for {sym}: {e}")
        return None


async def _fetch_all_async() -> list[dict]:
    """
    Fetch all symbols concurrently using the thread pool.
    asyncio.gather fires all _fetch_one calls in parallel threads.
    Total time ≈ slowest single fetch (~0.5s) not sum of all fetches.
    """
    loop = asyncio.get_event_loop()
    t0 = time.time()

    # Submit all fetches to the thread pool simultaneously
    tasks = [
        loop.run_in_executor(_executor, _fetch_one, sym)
        for sym in SYMBOLS
    ]
    results = await asyncio.gather(*tasks)

    # Filter out None (failed fetches)
    ticks = [r for r in results if r is not None]
    elapsed = round(time.time() - t0, 2)
    logger.info(f"⚡ yfinance fast_info: {len(ticks)}/{len(SYMBOLS)} symbols in {elapsed}s")
    return ticks


class YFinanceClient:
    """
    Polls Yahoo Finance using fast_info every POLL_INTERVAL seconds.
    Compatible interface with AlpacaLiveClient (same get_snapshot / run / stop).
    """

    def __init__(self, on_tick: Callable[[list[dict]], Awaitable[None]]):
        self.on_tick = on_tick
        self._running = False
        self._last_snapshot: list[dict] = []

    async def run(self):
        self._running = True
        logger.info(f"📡 YFinance fast_info polling — interval: {POLL_INTERVAL}s")

        while self._running:
            ticks = await _fetch_all_async()

            if ticks:
                self._last_snapshot = ticks
                await self.on_tick(ticks)
            else:
                logger.warning("All fetches returned None — market may be closed")

            await asyncio.sleep(POLL_INTERVAL)

    def get_snapshot(self) -> list[dict]:
        return self._last_snapshot

    def stop(self):
        self._running = False
        _executor.shutdown(wait=False)
