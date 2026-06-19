"""
Shared test fixtures for CobaltQuant backend tests.
=====================================================
Provides a reusable test client, mock settings, and database fixtures.
"""

import asyncio
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def anyio_backend():
    """Use asyncio as the async backend for all tests."""
    return "asyncio"


@pytest.fixture
def client():
    """
    Provides a FastAPI TestClient with mocked Redis.
    Redis is mocked because tests shouldn't require running infrastructure.
    """
    async def dummy_stream(*args, **kwargs):
        while True:
            await asyncio.sleep(3600)
            yield []

    with patch("main.aioredis") as mock_redis, \
         patch("data.mock_prices.price_stream", side_effect=dummy_stream), \
         patch("data.sentiment_engine.SentimentEngine.stream", side_effect=dummy_stream):
        mock_client = AsyncMock()
        mock_pubsub = AsyncMock()
        
        async def dummy_coro(*args, **kwargs):
            pass
            
        async def mock_listen():
            while True:
                await asyncio.sleep(3600)
                yield {"type": "message", "channel": "prices", "data": "{}"}
                
        mock_pubsub.listen = mock_listen
        mock_pubsub.subscribe = dummy_coro
        mock_pubsub.unsubscribe = dummy_coro
        mock_client.pubsub = MagicMock(return_value=mock_pubsub)
        mock_client.aclose = dummy_coro
        mock_client.publish = dummy_coro
        mock_redis.from_url.return_value = mock_client
        
        from main import app
        with TestClient(app) as c:
            yield c


@pytest.fixture
def mock_settings():
    """Returns a mock settings object for unit tests that don't need FastAPI."""
    settings = MagicMock()
    settings.environment = "development"
    settings.data_mode = "mock"
    settings.jwt_secret = "test-secret-key-for-unit-tests"
    settings.effective_jwt_secret = "test-secret-key-for-unit-tests"
    settings.jwt_algorithm = "HS256"
    settings.jwt_expire_minutes = 60
    settings.api_key = ""
    settings.rate_limit_per_minute = 30
    settings.redis_url = "redis://localhost:6379"
    return settings
