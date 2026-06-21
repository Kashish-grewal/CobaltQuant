"""
Cobalt — Shared Asset Universe
================================
Single source of truth for all tracked assets.
Every module imports from here — no more duplicate metadata.

HOW TO ADD A NEW ASSET:
  1. Add it to ASSET_META below
  2. That's it — all data sources (mock, yfinance, alpaca) and
     the sentiment engine will pick it up automatically.
"""

from dataclasses import dataclass, field
from typing import Optional

# ── Asset Metadata ─────────────────────────────────────────────────────────────
# symbol → { name, sector, approx_price, market_cap_billions }
# approx_price is used as the GBM starting price in mock mode.
# market_cap is used for heatmap cell sizing in the sentiment view.

ASSET_META: dict[str, dict] = {
    # Technology
    "AAPL":  {"name": "Apple",               "sector": "Technology", "approx_price": 210.0,  "market_cap": 3200},
    "MSFT":  {"name": "Microsoft",           "sector": "Technology", "approx_price": 450.0,  "market_cap": 3350},
    "NVDA":  {"name": "NVIDIA",              "sector": "Technology", "approx_price": 135.0,  "market_cap": 3300},
    "GOOGL": {"name": "Alphabet",            "sector": "Technology", "approx_price": 180.0,  "market_cap": 2200},
    "META":  {"name": "Meta",                "sector": "Technology", "approx_price": 530.0,  "market_cap": 1350},
    "AMD":   {"name": "AMD",                 "sector": "Technology", "approx_price": 155.0,  "market_cap": 250},
    # Finance
    "JPM":   {"name": "JPMorgan",            "sector": "Finance",    "approx_price": 240.0,  "market_cap": 680},
    "GS":    {"name": "Goldman Sachs",       "sector": "Finance",    "approx_price": 530.0,  "market_cap": 170},
    "V":     {"name": "Visa",                "sector": "Finance",    "approx_price": 310.0,  "market_cap": 590},
    # Healthcare
    "JNJ":   {"name": "J&J",                 "sector": "Healthcare", "approx_price": 160.0,  "market_cap": 390},
    "PFE":   {"name": "Pfizer",              "sector": "Healthcare", "approx_price": 26.0,   "market_cap": 145},
    # Energy
    "XOM":   {"name": "Exxon",               "sector": "Energy",     "approx_price": 108.0,  "market_cap": 470},
    "CVX":   {"name": "Chevron",             "sector": "Energy",     "approx_price": 155.0,  "market_cap": 270},
    # Consumer
    "AMZN":  {"name": "Amazon",              "sector": "Consumer",   "approx_price": 200.0,  "market_cap": 2100},
    "TSLA":  {"name": "Tesla",               "sector": "Consumer",   "approx_price": 340.0,  "market_cap": 1100},
    # Crypto ETF
    "IBIT":  {"name": "iShares Bitcoin ETF", "sector": "Crypto",     "approx_price": 58.0,   "market_cap": 70},
}

# Convenience lists derived from the single source of truth
SYMBOLS: list[str] = list(ASSET_META.keys())
SECTORS: list[str] = sorted({m["sector"] for m in ASSET_META.values()})
