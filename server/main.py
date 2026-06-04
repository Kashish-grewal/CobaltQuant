"""
Cobalt — FastAPI Application Entry Point
==================================================
All data sources (mock, yfinance, alpaca) run as singleton background tasks.
They call manager.broadcast() on their own schedule — client handlers just
accept connections and keep them alive.

DATA_MODE options (set in .env):
  mock     → GBM simulation, 1s ticks, 24/7, no API keys
  yfinance → Yahoo Finance, 30s poll, real prices, no API keys
  live     → Alpaca IEX, ~500ms, real-time, needs API keys
"""
import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
import app_state

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)
settings = get_settings()

import redis.asyncio as aioredis
import json

# Redis connection for publishing messages
redis_pub = aioredis.from_url(settings.redis_url, decode_responses=True)


async def publish_message(channel: str, message: dict):
    """
    Publishes a message to a Redis channel.
    Falls back to direct local broadcasting if Redis is unavailable.
    """
    try:
        await redis_pub.publish(channel, json.dumps(message))
    except Exception as e:
        logger.debug(f"Redis publish failed, falling back to local broadcast: {e}")
        from ws_manager import manager
        await manager.broadcast(channel=channel, message=message)


async def redis_listener_task():
    """
    Background subscriber task. Listens to Redis channels ('prices', 'sentiment')
    and broadcasts to locally connected WebSocket clients.
    """
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    try:
        await pubsub.subscribe("prices", "sentiment")
        logger.info("📡 Redis Pub/Sub listener subscribed to 'prices' and 'sentiment' channels.")
        async for message in pubsub.listen():
            if message["type"] == "message":
                channel = message["channel"]
                payload = json.loads(message["data"])
                from ws_manager import manager
                await manager.broadcast(channel=channel, message=payload)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.warning(f"Redis Pub/Sub listener connection failed or lost (normal in standalone/offline mode): {e}")
    finally:
        try:
            await pubsub.unsubscribe("prices", "sentiment")
        except Exception:
            pass
        await r.close()


async def _mock_broadcast_loop():
    """
    Singleton mock broadcast loop.
    Runs ONCE in the background — sends ticks to ALL connected clients.
    """
    from data.mock_prices import price_stream

    logger.info("📊 Mock broadcast loop started (1s ticks)")
    async for ticks in price_stream(interval_seconds=1.0):
        await publish_message(
            channel="prices",
            message={
                "type": "price_update",
                "source": "mock",
                "data": ticks,
                "timestamp": int(time.time() * 1000),
            }
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"🚀 CobaltQuant — DATA_MODE={settings.data_mode}")
    tasks = []

    # Start the Redis subscriber task
    tasks.append(asyncio.create_task(redis_listener_task()))

    async def _on_tick(ticks: list[dict], source: str):
        await publish_message(
            channel="prices",
            message={
                "type": "price_update",
                "source": source,
                "data": ticks,
                "timestamp": int(time.time() * 1000),
            }
        )

    if settings.data_mode == "yfinance":
        from data.yfinance_client import YFinanceClient
        client = YFinanceClient(on_tick=lambda t: _on_tick(t, "yfinance"))
        client._source_label = "yfinance"
        app_state.alpaca_client = client
        tasks.append(asyncio.create_task(client.run()))
        logger.info("📈 YFinance client started (real prices, ~30s poll)")

    elif settings.data_mode == "live":
        if not settings.alpaca_api_key or not settings.alpaca_secret_key:
            logger.warning("⚠️  Alpaca keys missing — falling back to yfinance")
            from data.yfinance_client import YFinanceClient
            client = YFinanceClient(on_tick=lambda t: _on_tick(t, "yfinance"))
            client._source_label = "yfinance"
            app_state.alpaca_client = client
            tasks.append(asyncio.create_task(client.run()))
        else:
            from data.alpaca_client import AlpacaLiveClient
            client = AlpacaLiveClient(on_tick=lambda t: _on_tick(t, "alpaca_live"))
            client._source_label = "alpaca_live"
            app_state.alpaca_client = client
            tasks.append(asyncio.create_task(client.run()))
            logger.info("📡 Alpaca live client started")

    else:
        # mock mode — singleton background broadcast loop
        tasks.append(asyncio.create_task(_mock_broadcast_loop()))
        logger.info("📊 Mock broadcast loop started")

    # ── Sentiment broadcast loop (all data modes) ────────────────────
    async def _sentiment_loop():
        from data.sentiment_engine import SentimentEngine
        import time as _time
        engine = SentimentEngine()
        logger.info("💬 Sentiment engine started (8s ticks)")
        async for snapshot in engine.stream(interval=8.0):
            await publish_message(
                channel="sentiment",
                message={
                    "type": "sentiment_update",
                    "data": snapshot,
                    "timestamp": int(_time.time() * 1000),
                },
            )

    tasks.append(asyncio.create_task(_sentiment_loop()))

    yield  # ── server running ──

    for t in tasks:
        t.cancel()
        try:
            await t
        except asyncio.CancelledError:
            pass
            
    if app_state.alpaca_client:
        app_state.alpaca_client.stop()
        
    # Close Redis client connections
    try:
        await redis_pub.close()
    except Exception:
        pass
        
    logger.info("🛑 Shutdown complete")


app = FastAPI(
    title="CobaltQuant",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routes.api import router as api_router
from routes.prices_ws import router as prices_ws_router
from routes.sentiment_ws import router as sentiment_ws_router
from routes.debate_ws import router as debate_ws_router
from routes.signals_api import router as signals_router

app.include_router(api_router)
app.include_router(prices_ws_router)
app.include_router(sentiment_ws_router)
app.include_router(debate_ws_router)
app.include_router(signals_router)


@app.get("/")
async def root():
    return {
        "name": "CobaltQuant API",
        "version": "0.1.0",
        "data_mode": settings.data_mode,
        "docs": "/docs",
    }
