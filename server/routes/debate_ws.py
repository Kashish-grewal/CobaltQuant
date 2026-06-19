"""
Cobalt — Debate WebSocket Route (Phase 3)
==========================================
Endpoint: ws://localhost:8000/ws/debate
Bidirectional: client sends ticker, server streams debate chunks.

Protocol (client → server):
  {"action": "debate", "ticker": "AAPL"}

Protocol (server → client):
  {"type": "debate_start", "ticker": "AAPL"}
  {"type": "debate_chunk", "agent": "bull",    "chunk": "Strong "}
  {"type": "debate_chunk", "agent": "bear",    "chunk": "P/E "}
  ...
  {"type": "debate_done",  "ticker": "AAPL"}
"""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from data.debate_engine import stream_debate

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/debate")
async def debate_ws(websocket: WebSocket):
    # Auth check
    from auth import verify_ws_token
    from config import get_settings
    settings = get_settings()
    auth_result = await verify_ws_token(websocket)
    if auth_result is None and settings.jwt_secret:
        return

    await websocket.accept()
    logger.info("Debate client connected")
    active_task: asyncio.Task | None = None

    async def send(msg: dict):
        """Thread-safe send wrapper."""
        try:
            await websocket.send_text(json.dumps(msg))
        except Exception:
            pass  # connection already closing

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("action") == "debate":
                ticker = msg.get("ticker", "AAPL").upper()

                # Cancel any in-flight debate for this connection
                if active_task and not active_task.done():
                    active_task.cancel()
                    try:
                        await active_task
                    except asyncio.CancelledError:
                        pass

                active_task = asyncio.create_task(
                    stream_debate(ticker=ticker, ws_send=send)
                )
                logger.info(f"Debate started → {ticker}")

    except WebSocketDisconnect:
        logger.info("Debate client disconnected")
    except Exception as e:
        logger.warning(f"Debate WS error: {e}")
    finally:
        if active_task and not active_task.done():
            active_task.cancel()
