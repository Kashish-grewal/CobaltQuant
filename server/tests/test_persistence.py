"""
Persistence Service — Unit Tests
==================================
Tests buffer flush mechanics, emergency flush, and query functions.
"""

import asyncio
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime, timezone
from persistence import PricePersistence


@pytest.mark.anyio
async def test_add_ticks_buffers_data():
    """add_ticks should buffer data without immediately flushing."""
    p = PricePersistence(flush_interval=10.0)

    ticks = [
        {"symbol": "AAPL", "price": 210.50, "open": 209.0, "high": 211.0,
         "low": 208.5, "volume": 1000, "change": 1.50, "change_pct": 0.72},
        {"symbol": "MSFT", "price": 450.00, "open": 448.0, "high": 451.0,
         "low": 447.0, "volume": 2000, "change": 2.00, "change_pct": 0.45},
    ]
    p.add_ticks(ticks, source="yfinance")

    assert len(p._buffer) == 2
    assert p._buffer[0]["symbol"] == "AAPL"
    assert p._buffer[0]["source"] == "yfinance"
    assert p._buffer[1]["symbol"] == "MSFT"


@pytest.mark.anyio
async def test_add_ticks_fills_default_values():
    """Missing fields in ticks should get default values."""
    p = PricePersistence(flush_interval=10.0)

    ticks = [{"symbol": "TSLA"}]  # Minimal tick
    p.add_ticks(ticks, source="mock")

    assert p._buffer[0]["price"] == 0.0
    assert p._buffer[0]["volume"] == 0
    assert p._buffer[0]["source"] == "mock"
    assert isinstance(p._buffer[0]["timestamp"], datetime)


@pytest.mark.anyio
async def test_flush_clears_buffer():
    """Flushing should clear the buffer after writing to the database."""
    p = PricePersistence(flush_interval=10.0)

    ticks = [
        {"symbol": "AAPL", "price": 210.50, "open": 209.0, "high": 211.0,
         "low": 208.5, "volume": 1000, "change": 1.50, "change_pct": 0.72},
    ]
    p.add_ticks(ticks, source="mock")
    assert len(p._buffer) == 1

    # Mock the database session
    with patch("persistence.async_session") as mock_session:
        mock_ctx = AsyncMock()
        mock_ctx.add = MagicMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        await p._flush()

    assert len(p._buffer) == 0


@pytest.mark.anyio
async def test_flush_on_empty_buffer_is_noop():
    """Flushing an empty buffer should not attempt database writes."""
    p = PricePersistence(flush_interval=10.0)

    with patch("persistence.async_session") as mock_session:
        await p._flush()
        mock_session.assert_not_called()


@pytest.mark.anyio
async def test_emergency_flush_on_buffer_overflow():
    """When buffer exceeds max_buffer, an emergency flush should be triggered."""
    p = PricePersistence(flush_interval=999.0, max_buffer=5)

    ticks = [
        {"symbol": f"SYM{i}", "price": 100.0 + i}
        for i in range(6)  # One more than max_buffer
    ]

    with patch("persistence.asyncio.create_task") as mock_create_task:
        p.add_ticks(ticks, source="mock")
        # Emergency flush should have been triggered
        mock_create_task.assert_called_once()
        coro = mock_create_task.call_args[0][0]
        coro.close()


@pytest.mark.anyio
async def test_stop_flushes_remaining_data():
    """Calling stop() should flush any remaining buffered data."""
    p = PricePersistence(flush_interval=10.0)

    ticks = [{"symbol": "AAPL", "price": 210.50}]
    p.add_ticks(ticks, source="mock")

    with patch.object(p, "_flush", new_callable=AsyncMock) as mock_flush:
        await p.stop()
        mock_flush.assert_awaited_once()
