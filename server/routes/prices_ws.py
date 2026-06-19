"""
Price WebSocket Route
======================
/ws/prices — single endpoint for all data modes.

ARCHITECTURE:
  Broadcasts come from ONE background task (yfinance / mock),
  NOT from inside each client's handler. This means:
    - N clients = 1 data fetch loop (not N loops)
    - No duplicate messages
    - Server load is O(1) regardless of connected clients
"""
import asyncio
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ws_manager import manager
from config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


@router.websocket("/ws/prices")
async def prices_websocket(websocket: WebSocket):
    """
    Accept a WebSocket, send initial snapshot, then keep alive.
    All price updates are pushed via manager.broadcast() from the background task.

    Authentication: pass ?token=xxx query parameter.
    In dev mode (no JWT_SECRET set), all connections are accepted.
    """
    # Auth check — closes connection with 4001/4003 if token is invalid in production
    from auth import verify_ws_token
    auth_result = await verify_ws_token(websocket)
    if auth_result is None and settings.jwt_secret:
        return  # Connection was closed by verify_ws_token

    await manager.connect(websocket, channel="prices")

    try:
        # Send initial snapshot immediately so UI is never blank
        await _send_snapshot(websocket)

        # Keep connection alive — real updates come via background broadcast
        while True:
            await asyncio.sleep(25)
            alive = await manager.send_to_one(websocket, {
                "type": "heartbeat",
                "timestamp": int(time.time() * 1000),
            })
            if not alive:
                break

    except WebSocketDisconnect:
        pass  # normal — client navigated away
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        manager.disconnect(websocket, channel="prices")


async def _send_snapshot(websocket: WebSocket):
    """Send the best available initial snapshot to a freshly connected client."""
    import app_state
    import time

    client = app_state.alpaca_client
    snapshot = client.get_snapshot() if client else []

    if snapshot:
        # We have real/recent data cached — send it immediately
        source = getattr(client, "_source_label", "yfinance")
        await manager.send_to_one(websocket, {
            "type": "initial_snapshot",
            "source": source,
            "data": snapshot,
            "timestamp": int(time.time() * 1000),
        })
    else:
        # Server just started, first yfinance/alpaca fetch not done yet.
        # Send mock seed prices so UI isn't blank (~2s until first real data).
        # The "loading" flag tells the frontend to show a "Loading real data..." indicator.
        from data.mock_prices import ASSETS
        await manager.send_to_one(websocket, {
            "type": "initial_snapshot",
            "source": "mock_fallback",
            "loading": True,
            "data": [a.tick() for a in ASSETS],
            "timestamp": int(time.time() * 1000),
        })
