"""
Cobalt — Database Models & Engine
===================================
SQLAlchemy async models for persistent price history and session management.

STORAGE STRATEGY:
  - SQLite in development (zero config, file-based)
  - PostgreSQL in production (via DATABASE_URL env var)
  - Async engine using aiosqlite / asyncpg

USAGE:
  from db import get_db, PriceTick
  async with get_db() as session:
      session.add(PriceTick(...))
      await session.commit()
"""

import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import (
    Column, Integer, Float, String, DateTime, Index,
    BigInteger, create_engine,
)
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlalchemy.orm import DeclarativeBase

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ── Base ──────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Models ────────────────────────────────────────────────────────────────────

class PriceTick(Base):
    """
    Stores individual price ticks for historical replay and charting.
    One row per (symbol, timestamp) pair.
    """
    __tablename__ = "price_ticks"

    id        = Column(BigInteger().with_variant(Integer(), "sqlite"), primary_key=True, autoincrement=True)
    symbol    = Column(String(10), nullable=False, index=True)
    price     = Column(Float, nullable=False)
    open      = Column(Float)
    high      = Column(Float)
    low       = Column(Float)
    volume    = Column(BigInteger, default=0)
    change    = Column(Float, default=0.0)
    change_pct = Column(Float, default=0.0)
    source    = Column(String(20), default="yfinance")  # yfinance, mock, alpaca_live
    timestamp = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    # Composite index for efficient time-range queries per symbol
    __table_args__ = (
        Index("ix_price_ticks_symbol_ts", "symbol", "timestamp"),
    )

    def __repr__(self):
        return f"<PriceTick {self.symbol} ${self.price:.2f} @ {self.timestamp}>"


class SentimentSnapshot(Base):
    """
    Stores sentiment snapshots for historical analysis.
    One row per (symbol, timestamp) pair.
    """
    __tablename__ = "sentiment_snapshots"

    id         = Column(BigInteger().with_variant(Integer(), "sqlite"), primary_key=True, autoincrement=True)
    symbol     = Column(String(10), nullable=False, index=True)
    score      = Column(Float, nullable=False)           # -1.0 to 1.0
    label      = Column(String(10))                       # positive, negative, neutral
    headline   = Column(String(500))                      # news headline used
    market_cap = Column(BigInteger)
    timestamp  = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_sentiment_symbol_ts", "symbol", "timestamp"),
    )


class MLSignalLog(Base):
    """
    Logs ML signal predictions for audit trail and accuracy tracking.
    """
    __tablename__ = "ml_signal_logs"

    id             = Column(BigInteger().with_variant(Integer(), "sqlite"), primary_key=True, autoincrement=True)
    symbol         = Column(String(10), nullable=False, index=True)
    signal         = Column(String(10), nullable=False)   # BUY, SELL, HOLD
    confidence     = Column(Float, nullable=False)
    model_accuracy = Column(Float)
    timestamp      = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_ml_signals_symbol_ts", "symbol", "timestamp"),
    )


# ── Engine & Session Factory ─────────────────────────────────────────────────

def _get_database_url() -> str:
    """
    Returns the async-compatible database URL.
    - If DATABASE_URL is set and looks like postgres, use asyncpg driver.
    - Otherwise, fall back to a local SQLite file via aiosqlite.
    """
    url = settings.database_url

    if url and ("postgresql" in url or "postgres" in url):
        # Convert postgres:// → postgresql+asyncpg://
        url = url.replace("postgresql://", "postgresql+asyncpg://")
        url = url.replace("postgres://", "postgresql+asyncpg://")
        return url

    # Default: SQLite file in the server directory
    import pathlib
    db_path = pathlib.Path(__file__).parent / "cobaltquant.db"
    return f"sqlite+aiosqlite:///{db_path}"


# Lazy-initialized — created in init_db() to avoid import-time crashes
# when asyncpg isn't installed but DATABASE_URL points to PostgreSQL.
_engine = None
_async_session = None


def _ensure_engine():
    """Create the engine and session factory on first use."""
    global _engine, _async_session
    if _engine is not None:
        return

    url = _get_database_url()
    is_sqlite = "sqlite" in url

    _engine = create_async_engine(
        url,
        echo=False,
        # pool_pre_ping not needed for SQLite
        **({"pool_pre_ping": True} if not is_sqlite else {}),
    )

    _async_session = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    logger.info(f"🗄️  Database engine created: {'SQLite' if is_sqlite else 'PostgreSQL'}")


async def init_db():
    """
    Creates all tables if they don't exist.
    Called once during app startup in the lifespan handler.
    """
    _ensure_engine()
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    db_type = "SQLite" if "sqlite" in _get_database_url() else "PostgreSQL"
    logger.info(f"🗄️  Database initialised ({db_type})")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager for database sessions.
    
    Usage:
        async for session in get_db():
            session.add(PriceTick(...))
            await session.commit()
    """
    _ensure_engine()
    async with _async_session() as session:
        try:
            yield session
        finally:
            await session.close()


def async_session() -> AsyncSession:
    """
    Returns a new AsyncSession instance, ensuring the engine is initialized.
    
    Usage:
        async with async_session() as session:
            ...
    """
    _ensure_engine()
    return _async_session()


async def close_db():
    """Dispose the engine pool on shutdown."""
    if _engine:
        await _engine.dispose()

