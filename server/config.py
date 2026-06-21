"""
Cobalt — Configuration
================================
Uses pydantic-settings so every setting can be overridden by environment variables.
This is the single source of truth for all config in the app.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from functools import lru_cache
from typing import Any
import secrets


class Settings(BaseSettings):
    # App
    app_name: str = "CobaltQuant"
    environment: str = "development"
    
    # DATA_MODE:
    #   "mock"     → simulated prices, no API keys needed (great for development)
    #   "yfinance" → real Yahoo Finance prices, no API keys needed
    #   "live"     → real Alpaca WebSocket feed, needs API keys
    data_mode: str = "yfinance"

    # Alpaca (paper trading — free, no real money)
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_base_url: str = "https://paper-api.alpaca.markets"

    # News
    news_api_key: str = ""

    # LLM
    openai_api_key: str = ""
    gemini_api_key: str = ""

    # Infrastructure
    redis_url: str = "redis://localhost:6379"
    database_url: str = ""

    # CORS — list of allowed origins
    allowed_origins: Any = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]

    # ── Auth ──────────────────────────────────────────────────────────────────
    # JWT_SECRET: used to sign/verify JWT tokens. MUST be set in production.
    # If empty, a random secret is generated at startup (safe for dev, not prod).
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # API_KEY: simple shared API key for protecting REST endpoints.
    # If empty, REST endpoints are unprotected (dev mode).
    api_key: str = ""

    # ── Monitoring ────────────────────────────────────────────────────────────
    # SENTRY_DSN: set to your project DSN to enable error tracking.
    # If empty, Sentry is disabled (no-op).
    sentry_dsn: str = ""

    # Rate limiting
    rate_limit_per_minute: int = 30

    # Internal: auto-generated fallback JWT secret for dev mode.
    # Generated ONCE at Settings init, not on every property access.
    _fallback_jwt_secret: str = ""

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v):
        import json
        if isinstance(v, str):
            v = v.strip()
            # If it looks like a JSON array, try to parse it
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            # Otherwise, split by comma
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    def model_post_init(self, __context) -> None:
        """Generate a stable fallback JWT secret once at init time."""
        if not self.jwt_secret:
            self._fallback_jwt_secret = secrets.token_hex(32)

    @property
    def effective_jwt_secret(self) -> str:
        """Returns the JWT secret, using the stable fallback in dev mode."""
        if self.jwt_secret:
            return self.jwt_secret
        return self._fallback_jwt_secret

    model_config = SettingsConfigDict(
        # Look for .env in project root (one level up from server/)
        env_file=str(__import__("pathlib").Path(__file__).parent.parent / ".env"),
        case_sensitive=False,
        extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    """
    Returns a cached Settings instance.
    lru_cache means this only runs once — same object is returned every call.
    This is how FastAPI's dependency injection works with config.
    """
    return Settings()

