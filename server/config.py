"""
Cobalt — Configuration
================================
Uses pydantic-settings so every setting can be overridden by environment variables.
This is the single source of truth for all config in the app.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "CobaltQuant"
    environment: str = "development"
    
    # DATA_MODE:
    #   "mock"   → simulated prices, no API keys needed (great for development)
    #   "live"   → real Alpaca WebSocket feed
    data_mode: str = "mock"

    # Alpaca (paper trading — free, no real money)
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_base_url: str = "https://paper-api.alpaca.markets"

    # News
    news_api_key: str = ""

    # LLM
    openai_api_key: str = ""

    # Infrastructure
    redis_url: str = "redis://localhost:6379"
    database_url: str = ""

    class Config:
        # Look for .env in project root (one level up from server/)
        env_file = str(__import__("pathlib").Path(__file__).parent.parent / ".env")
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """
    Returns a cached Settings instance.
    lru_cache means this only runs once — same object is returned every call.
    This is how FastAPI's dependency injection works with config.
    """
    return Settings()
