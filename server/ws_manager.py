"""
WebSocket Connection Manager
==============================
Manages all active WebSocket connections in a channel/room system.

KEY FIXES in this version:
  1. Dead connection auto-eviction during broadcast
  2. send_to_one returns bool so callers can exit cleanly
  3. Defensive copy of channel set before iteration (avoids mutation-during-iteration bugs)
"""
import asyncio
import json
import logging
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, channel: str = "prices"):
        await websocket.accept()
        self._channels[channel].add(websocket)
        logger.info(f"Client connected → '{channel}'. Active: {self.connection_count}")

    def disconnect(self, websocket: WebSocket, channel: str = "prices"):
        self._channels[channel].discard(websocket)
        logger.info(f"Client disconnected ← '{channel}'. Active: {self.connection_count}")

    @property
    def connection_count(self) -> int:
        return sum(len(c) for c in self._channels.values())

    async def broadcast(self, message: dict, channel: str = "prices"):
        """
        Send to ALL clients in a channel concurrently.
        Dead connections are automatically removed after each broadcast.
        """
        clients = set(self._channels[channel])  # snapshot — safe to mutate original
        if not clients:
            return

        payload = json.dumps(message)
        dead: set[WebSocket] = set()

        async def _send(ws: WebSocket):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)

        await asyncio.gather(*[_send(ws) for ws in clients], return_exceptions=True)

        # Evict dead connections immediately
        for ws in dead:
            self._channels[channel].discard(ws)
        if dead:
            logger.debug(f"Evicted {len(dead)} dead connection(s) from '{channel}'")

    async def send_to_one(self, websocket: WebSocket, message: dict) -> bool:
        """
        Send to a single client. Returns False if connection is already dead.
        Callers should break their loop when False is returned.
        """
        try:
            await websocket.send_text(json.dumps(message))
            return True
        except Exception:
            self._channels["prices"].discard(websocket)  # evict immediately
            return False


manager = ConnectionManager()
