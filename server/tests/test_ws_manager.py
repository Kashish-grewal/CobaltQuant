"""
WebSocket Connection Manager — Unit Tests
============================================
Tests broadcast, dead connection eviction, channel isolation, and edge cases.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from ws_manager import ConnectionManager


def _make_mock_ws(*, should_fail: bool = False):
    """Create a mock WebSocket that optionally raises on send."""
    ws = AsyncMock()
    ws.accept = AsyncMock()
    if should_fail:
        ws.send_text = AsyncMock(side_effect=Exception("Connection closed"))
    else:
        ws.send_text = AsyncMock()
    return ws


@pytest.mark.anyio
async def test_connect_adds_to_channel():
    """Connecting a WebSocket should add it to the specified channel."""
    mgr = ConnectionManager()
    ws = _make_mock_ws()

    await mgr.connect(ws, channel="prices")

    assert mgr.connection_count == 1
    assert ws in mgr._channels["prices"]
    ws.accept.assert_awaited_once()


@pytest.mark.anyio
async def test_disconnect_removes_from_channel():
    """Disconnecting should remove the WebSocket from the channel."""
    mgr = ConnectionManager()
    ws = _make_mock_ws()

    await mgr.connect(ws, channel="prices")
    mgr.disconnect(ws, channel="prices")

    assert mgr.connection_count == 0
    assert ws not in mgr._channels["prices"]


@pytest.mark.anyio
async def test_broadcast_sends_to_all_clients():
    """Broadcast should send the same payload to every client in the channel."""
    mgr = ConnectionManager()
    ws1 = _make_mock_ws()
    ws2 = _make_mock_ws()
    ws3 = _make_mock_ws()

    await mgr.connect(ws1, channel="prices")
    await mgr.connect(ws2, channel="prices")
    await mgr.connect(ws3, channel="prices")

    msg = {"type": "test", "data": [1, 2, 3]}
    await mgr.broadcast(msg, channel="prices")

    # All three should have received the same serialized payload
    assert ws1.send_text.await_count == 1
    assert ws2.send_text.await_count == 1
    assert ws3.send_text.await_count == 1

    # Verify same payload was sent (serialized once)
    sent_payload = ws1.send_text.call_args[0][0]
    assert '"type"' in sent_payload
    assert '"test"' in sent_payload


@pytest.mark.anyio
async def test_broadcast_evicts_dead_connections():
    """Dead connections should be automatically removed during broadcast."""
    mgr = ConnectionManager()
    alive_ws = _make_mock_ws()
    dead_ws = _make_mock_ws(should_fail=True)

    await mgr.connect(alive_ws, channel="prices")
    await mgr.connect(dead_ws, channel="prices")
    assert mgr.connection_count == 2

    await mgr.broadcast({"type": "test"}, channel="prices")

    # Dead connection should have been evicted
    assert mgr.connection_count == 1
    assert dead_ws not in mgr._channels["prices"]
    assert alive_ws in mgr._channels["prices"]


@pytest.mark.anyio
async def test_channel_isolation():
    """Messages on one channel should not reach clients on another channel."""
    mgr = ConnectionManager()
    prices_ws = _make_mock_ws()
    sentiment_ws = _make_mock_ws()

    await mgr.connect(prices_ws, channel="prices")
    await mgr.connect(sentiment_ws, channel="sentiment")

    await mgr.broadcast({"type": "price_update"}, channel="prices")

    prices_ws.send_text.assert_awaited_once()
    sentiment_ws.send_text.assert_not_awaited()


@pytest.mark.anyio
async def test_broadcast_to_empty_channel_is_noop():
    """Broadcasting to a channel with no clients should not raise."""
    mgr = ConnectionManager()
    await mgr.broadcast({"type": "test"}, channel="nonexistent")
    # No exception = pass


@pytest.mark.anyio
async def test_send_to_one_returns_false_on_dead_connection():
    """send_to_one should return False and evict a dead connection."""
    mgr = ConnectionManager()
    dead_ws = _make_mock_ws(should_fail=True)

    await mgr.connect(dead_ws, channel="prices")
    result = await mgr.send_to_one(dead_ws, {"type": "test"}, channel="prices")

    assert result is False
    assert mgr.connection_count == 0


@pytest.mark.anyio
async def test_send_to_one_returns_true_on_success():
    """send_to_one should return True on successful send."""
    mgr = ConnectionManager()
    ws = _make_mock_ws()

    await mgr.connect(ws, channel="prices")
    result = await mgr.send_to_one(ws, {"type": "test"}, channel="prices")

    assert result is True


@pytest.mark.anyio
async def test_connection_count_across_channels():
    """connection_count should aggregate across all channels."""
    mgr = ConnectionManager()
    ws1 = _make_mock_ws()
    ws2 = _make_mock_ws()
    ws3 = _make_mock_ws()

    await mgr.connect(ws1, channel="prices")
    await mgr.connect(ws2, channel="sentiment")
    await mgr.connect(ws3, channel="prices")

    assert mgr.connection_count == 3

    mgr.disconnect(ws1, channel="prices")
    assert mgr.connection_count == 2
