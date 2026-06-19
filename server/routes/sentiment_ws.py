"""
Cobalt — Sentiment WebSocket Route (Phase 2)
=============================================
Endpoint: ws://localhost:8000/ws/sentiment?token=xxx
Pushes full sentiment snapshots every 8 seconds.
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ws_manager import manager
from config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


@router.websocket("/ws/sentiment")
async def sentiment_ws(websocket: WebSocket):
    """
    Accepts a single sentiment channel client.
    The sentiment broadcast loop (started in lifespan) pushes data;
    this handler just keeps the connection alive.
    """
    # Auth check
    from auth import verify_ws_token
    auth_result = await verify_ws_token(websocket)
    if auth_result is None and settings.jwt_secret:
        return

    await manager.connect(websocket, channel="sentiment")
    logger.info("Sentiment client connected")
    try:
        while True:
            # Keep connection alive — data is pushed by the broadcast loop
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel="sentiment")
        logger.info("Sentiment client disconnected")
    except Exception as e:
        logger.warning(f"Sentiment WS error: {e}")
        manager.disconnect(websocket, channel="sentiment")
