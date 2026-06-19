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
from logging_config import setup_logging, RequestIDMiddleware
import app_state

settings = get_settings()
setup_logging(environment=settings.environment)
logger = logging.getLogger(__name__)

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
        await r.aclose()


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

    # ── Database initialisation ───────────────────────────────────────
    from db import init_db, close_db
    from persistence import price_persistence
    await init_db()
    tasks.append(price_persistence.start())

    # Start the Redis subscriber task
    tasks.append(asyncio.create_task(redis_listener_task()))

    async def _on_tick(ticks: list[dict], source: str):
        # Persist to database in background
        price_persistence.add_ticks(ticks, source=source)
        # Broadcast to WebSocket clients via Redis
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
            client = AlpacaLiveClient(on_tick=lambda t: _on_tick(t, client._source_label))
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

    # ── Security warnings for production ──────────────────────────────────────
    if settings.environment == "production":
        if not settings.jwt_secret:
            logger.warning("⚠️  JWT_SECRET not set — using auto-generated secret. Tokens will NOT survive restarts!")
        if not settings.api_key:
            logger.warning("⚠️  API_KEY not set — REST endpoints are UNPROTECTED.")
        if not settings.sentry_dsn:
            logger.warning("⚠️  SENTRY_DSN not set — errors will NOT be tracked.")

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
        await redis_pub.aclose()
    except Exception:
        pass
    # Close database connections
    from db import close_db
    from persistence import price_persistence
    await price_persistence.stop()
    await close_db()
        
    logger.info("🛑 Shutdown complete")


# ── Sentry Error Monitoring ──────────────────────────────────────────────────
# Initialise Sentry BEFORE creating the FastAPI app so it can hook into the
# framework. If SENTRY_DSN is empty, this is a complete no-op.
if settings.sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=0.1,             # 10% of requests traced
            profiles_sample_rate=0.1,            # 10% of traced requests profiled
            environment=settings.environment,
            release=f"cobaltquant@0.1.0",
            send_default_pii=False,              # Don't send user data to Sentry
        )
        logger.info("🛡️  Sentry error tracking initialised")
    except ImportError:
        logger.warning("sentry-sdk not installed — error tracking disabled")
else:
    logger.info("ℹ️  SENTRY_DSN not set — Sentry disabled (set it in .env for production)")


app = FastAPI(
    title="CobaltQuant",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request ID middleware — assigns a unique ID to every request for tracing
app.add_middleware(RequestIDMiddleware)

# ── Prometheus Metrics ────────────────────────────────────────────────────────
# Exposes /metrics endpoint for Prometheus scraping.
# Tracks: request count, latency histograms, in-progress requests.
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/metrics", "/docs", "/openapi.json"],
    ).instrument(app).expose(app, endpoint="/metrics")
    logger.info("📊 Prometheus metrics exposed at /metrics")
except ImportError:
    logger.info("ℹ️  prometheus-fastapi-instrumentator not installed — metrics disabled")


from schemas import RootResponse
from routes.api import router as api_router
from routes.prices_ws import router as prices_ws_router
from routes.sentiment_ws import router as sentiment_ws_router
from routes.debate_ws import router as debate_ws_router
from routes.signals_api import router as signals_router
from routes.auth_routes import router as auth_router

app.include_router(api_router)
app.include_router(prices_ws_router)
app.include_router(sentiment_ws_router)
app.include_router(debate_ws_router)
app.include_router(signals_router)
app.include_router(auth_router)


@app.get("/", response_model=RootResponse)
async def root():
    return {
        "name": "CobaltQuant API",
        "version": "0.1.0",
        "data_mode": settings.data_mode,
        "docs": "/docs",
        "metrics": "/metrics",
    }

