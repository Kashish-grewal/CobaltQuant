"""
Cobalt — Sentiment WebSocket Route (Phase 2)
=============================================
Endpoint: ws://localhost:8000/ws/sentiment
Pushes full sentiment snapshots every 8 seconds.
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ws_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/sentiment")
async def sentiment_ws(websocket: WebSocket):
    """
    Accepts a single sentiment channel client.
    The sentiment broadcast loop (started in lifespan) pushes data;
    this handler just keeps the connection alive.
    """
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
