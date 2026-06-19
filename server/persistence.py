"""
Cobalt — Price Persistence Service
=====================================
Buffers price ticks and flushes them to the database in batches.

DESIGN:
  - Incoming ticks are added to an in-memory buffer
  - A background task flushes the buffer every N seconds
  - Batch inserts for performance (one INSERT per flush, not per tick)
  - Provides query methods for historical price retrieval

This is completely opt-in: if DATABASE_URL is not set, everything
uses SQLite and "just works" without any external database.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select, func, desc

from db import get_db, PriceTick, SentimentSnapshot, MLSignalLog, async_session

logger = logging.getLogger(__name__)


class PricePersistence:
    """
    Buffers price ticks and flushes to the database in batches.
    
    Usage:
        persistence = PricePersistence(flush_interval=10.0)
        persistence.add_ticks(ticks, source="yfinance")
        # Call persistence.start() in lifespan to begin background flushing
    """

    def __init__(self, flush_interval: float = 10.0, max_buffer: int = 500):
        self._buffer: list[dict] = []
        self._flush_interval = flush_interval
        self._max_buffer = max_buffer
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None

    def add_ticks(self, ticks: list[dict], source: str = "yfinance"):
        """Add price ticks to the buffer. Non-blocking, no await needed."""
        for tick in ticks:
            self._buffer.append({
                "symbol":     tick.get("symbol", ""),
                "price":      tick.get("price", 0.0),
                "open":       tick.get("open", 0.0),
                "high":       tick.get("high", 0.0),
                "low":        tick.get("low", 0.0),
                "volume":     tick.get("volume", 0),
                "change":     tick.get("change", 0.0),
                "change_pct": tick.get("change_pct", 0.0),
                "source":     source,
                "timestamp":  datetime.now(timezone.utc),
            })

        # Emergency flush if buffer is too large
        if len(self._buffer) > self._max_buffer:
            asyncio.create_task(self._flush())

    async def _flush(self):
        """Flush all buffered ticks to the database."""
        async with self._lock:
            if not self._buffer:
                return

            batch = self._buffer.copy()
            self._buffer.clear()

        try:
            async with async_session() as session:
                for tick_data in batch:
                    session.add(PriceTick(**tick_data))
                await session.commit()

            logger.debug(f"💾 Persisted {len(batch)} price ticks")
        except Exception as e:
            logger.warning(f"Failed to persist price ticks: {e}")
            # Don't re-add to buffer — data loss is acceptable for price ticks

    async def _flush_loop(self):
        """Background loop that flushes the buffer periodically."""
        while True:
            await asyncio.sleep(self._flush_interval)
            await self._flush()

    def start(self) -> asyncio.Task:
        """Start the background flush loop. Returns the task for cleanup."""
        self._task = asyncio.create_task(self._flush_loop())
        logger.info(f"💾 Price persistence started (flush every {self._flush_interval}s)")
        return self._task

    async def stop(self):
        """Flush remaining data and cancel the background task."""
        await self._flush()  # Final flush
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


# ── Query Functions ───────────────────────────────────────────────────────────

async def get_price_history(
    symbol: str,
    hours: int = 24,
    limit: int = 1000,
) -> list[dict]:
    """
    Get historical price ticks for a symbol.
    
    Args:
        symbol: Stock ticker (e.g., "AAPL")
        hours: How far back to look (default: 24 hours)
        limit: Maximum number of ticks to return
    
    Returns:
        List of price tick dicts, oldest first
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    async with async_session() as session:
        result = await session.execute(
            select(PriceTick)
            .where(PriceTick.symbol == symbol.upper())
            .where(PriceTick.timestamp >= since)
            .order_by(PriceTick.timestamp.asc())
            .limit(limit)
        )
        ticks = result.scalars().all()

    return [
        {
            "symbol":     t.symbol,
            "price":      t.price,
            "open":       t.open,
            "high":       t.high,
            "low":        t.low,
            "volume":     t.volume,
            "change":     t.change,
            "change_pct": t.change_pct,
            "source":     t.source,
            "timestamp":  int(t.timestamp.timestamp() * 1000),
        }
        for t in ticks
    ]


async def save_sentiment(symbol: str, score: float, label: str, headline: str, market_cap: int):
    """Save a sentiment snapshot to the database."""
    try:
        async with async_session() as session:
            session.add(SentimentSnapshot(
                symbol=symbol,
                score=score,
                label=label,
                headline=headline,
                market_cap=market_cap,
            ))
            await session.commit()
    except Exception as e:
        logger.debug(f"Failed to persist sentiment for {symbol}: {e}")


async def log_ml_signal(symbol: str, signal: str, confidence: float, accuracy: float):
    """Log an ML signal prediction for audit trail."""
    try:
        async with async_session() as session:
            session.add(MLSignalLog(
                symbol=symbol,
                signal=signal,
                confidence=confidence,
                model_accuracy=accuracy,
            ))
            await session.commit()
    except Exception as e:
        logger.debug(f"Failed to log ML signal for {symbol}: {e}")


# ── Singleton instance ────────────────────────────────────────────────────────
price_persistence = PricePersistence(flush_interval=10.0)
