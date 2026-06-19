"""
Mock Price Generator
====================
Simulates realistic OHLCV (Open/High/Low/Close/Volume) data using
Geometric Brownian Motion — the same model used in Black-Scholes options pricing.

WHY GEOMETRIC BROWNIAN MOTION?
  Real stock prices are multiplicative (% changes), not additive.
  A $100 stock moving +1% is different from a $10 stock moving +1%.
  GBM handles this correctly. Formula: dS = μSdt + σSdW
  where μ = drift (trend), σ = volatility, dW = random Wiener process

This is Phase 1. In Phase 3, we'll replace this with real Alpaca WebSocket data.
"""
import asyncio
import math
import random
import time
from dataclasses import dataclass, field
from typing import AsyncGenerator

from data.assets import ASSET_META


@dataclass
class Asset:
    symbol: str
    name: str
    price: float
    sector: str
    # GBM parameters
    mu: float = 0.0001       # drift per tick (annualised ~2.5%)
    sigma: float = 0.002     # volatility per tick (annualised ~31%)
    # State
    open_price: float = field(init=False)
    high: float = field(init=False)
    low: float = field(init=False)
    volume: int = field(default=0)

    def __post_init__(self):
        self.open_price = self.price
        self.high = self.price
        self.low = self.price

    def tick(self) -> dict:
        """
        Advance price by one tick using GBM.
        Returns a full OHLCV candle dict ready to send to the frontend.
        """
        # Wiener process increment: random normal draw scaled by sqrt(dt)
        # dt = 1 second, so sqrt(dt) = 1
        epsilon = random.gauss(0, 1)
        
        # Core GBM formula: S_new = S * exp((μ - σ²/2)dt + σ*ε*sqrt(dt))
        drift = (self.mu - 0.5 * self.sigma ** 2)
        shock = self.sigma * epsilon
        self.price = self.price * math.exp(drift + shock)
        
        # Track intraday high/low
        self.high = max(self.high, self.price)
        self.low = min(self.low, self.price)
        
        # Simulate volume: higher during volatility (realistic)
        base_volume = random.randint(1000, 5000)
        vol_multiplier = 1 + abs(epsilon) * 2
        self.volume += int(base_volume * vol_multiplier)
        
        change = self.price - self.open_price
        change_pct = (change / self.open_price) * 100

        return {
            "symbol": self.symbol,
            "name": self.name,
            "sector": self.sector,
            "price": round(self.price, 2),
            "open": round(self.open_price, 2),
            "high": round(self.high, 2),
            "low": round(self.low, 2),
            "volume": self.volume,
            "change": round(change, 2),
            "change_pct": round(change_pct, 4),
            "timestamp": int(time.time() * 1000),  # milliseconds for JS
        }


# ── Asset Universe ─────────────────────────────────────────────────────────────
# Built from the shared ASSET_META — prices come from approx_price field.
# Per-asset GBM parameters tuned by sector volatility profile.
_SIGMA_BY_SECTOR: dict[str, float] = {
    "Technology": 0.0025,
    "Finance":    0.0015,
    "Healthcare": 0.0015,
    "Energy":     0.0021,
    "Consumer":   0.0025,
    "Crypto":     0.0060,
}

ASSETS = [
    Asset(
        symbol=sym,
        name=meta["name"],
        price=meta["approx_price"],
        sector=meta["sector"],
        sigma=_SIGMA_BY_SECTOR.get(meta["sector"], 0.002),
    )
    for sym, meta in ASSET_META.items()
]


async def price_stream(interval_seconds: float = 1.0) -> AsyncGenerator[list[dict], None]:
    """
    Async generator that yields a list of all asset ticks every `interval_seconds`.
    
    HOW ASYNC GENERATORS WORK:
    - `yield` suspends the function and returns a value to the caller
    - `await asyncio.sleep()` yields control back to the event loop (non-blocking)
    - This means thousands of WebSocket clients can be served concurrently
      without any thread blocking
    """
    while True:
        await asyncio.sleep(interval_seconds)
        yield [asset.tick() for asset in ASSETS]
