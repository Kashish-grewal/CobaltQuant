"""
Cobalt — Sentiment Engine (Phase 2)
====================================
Generates realistic mock sentiment scores for each tracked asset.
Each ticker has an independent random-walk score with mean reversion,
so the heatmap constantly shifts in a believable way.

Later: replace `_mock_tick()` with Yahoo Finance → VADER/FinBERT pipeline.
"""

import asyncio
import math
import random
import time
import logging
from typing import AsyncIterator
import json
import httpx
import redis.asyncio as aioredis
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

logger = logging.getLogger(__name__)
_analyzer = SentimentIntensityAnalyzer()

# ── Asset universe (must match yfinance_client SYMBOLS) ───────────────────────
SYMBOLS: list[str] = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "META",
    "TSLA", "AMZN", "JPM", "GS", "BAC",
    "JNJ", "PFE", "XOM", "CVX",
    "BTC-USD", "ETH-USD",
]

# Approximate market caps (USD billions) — used for heatmap cell sizing
MARKET_CAPS: dict[str, float] = {
    "AAPL": 3100, "MSFT": 3300, "NVDA": 2600, "GOOGL": 2100, "META": 1400,
    "TSLA": 750,  "AMZN": 1900, "JPM":  580,  "GS":   160,  "BAC":  280,
    "JNJ":  380,  "PFE":  140,  "XOM":  480,  "CVX":  260,
    "BTC-USD": 1200, "ETH-USD": 380,
}

# Mock headlines — rotated randomly to give a news-like feel
_HEADLINES: dict[str, list[str]] = {
    "AAPL": [
        "Apple Vision Pro sales accelerating into Q3",
        "iPhone 17 pre-orders shatter previous records",
        "Apple Services revenue hits all-time high",
        "Tim Cook: AI integration is 'transformative'",
    ],
    "MSFT": [
        "Azure AI growth outpaces analyst estimates",
        "Microsoft Copilot hits 100M daily users",
        "Windows 12 AI features get glowing reviews",
        "Microsoft closes $68B Activision deal synergies",
    ],
    "NVDA": [
        "Blackwell GPU demand far exceeds supply",
        "NVIDIA raises full-year revenue guidance",
        "Data center orders from hyperscalers surge",
        "Jensen Huang: AI is 'at an inflection point'",
    ],
    "GOOGL": [
        "Gemini Ultra beats GPT-4 on key benchmarks",
        "Google Search market share holds above 89%",
        "YouTube Premium crosses 100M subscribers",
        "Waymo expanding to 10 new cities by Q4",
    ],
    "META": [
        "Threads reaches 300M monthly active users",
        "Ray-Ban smart glasses selling faster than expected",
        "Meta AI assistant surpasses ChatGPT in DAUs",
        "Ad revenue grows 27% YoY on AI targeting",
    ],
    "TSLA": [
        "Cybertruck production ramp ahead of schedule",
        "Tesla FSD v13 achieves 99.7% task completion",
        "Energy storage deploys hit record in Q3",
        "Musk announces 4680 cell yield breakthrough",
    ],
    "AMZN": [
        "AWS re:Invent announcements drive analyst upgrades",
        "Amazon Prime same-day delivery expands to 40 cities",
        "Alexa+ subscribers exceed 50M globally",
        "Amazon Pharmacy grows 60% YoY",
    ],
    "JPM": [
        "JPMorgan reports record trading revenue",
        "Investment banking fees surge on M&A revival",
        "Dimon warns on long-term fiscal sustainability",
        "JPM raises dividend, launches $30B buyback",
    ],
    "GS": [
        "Goldman Sachs beats on fixed income trading",
        "Asset management AUM crosses $3T milestone",
        "Goldman expands AI trading desk to 200 engineers",
        "Consumer banking wind-down complete, margins improve",
    ],
    "BAC": [
        "Bank of America sees NII stabilise at higher rates",
        "Merrill Lynch advisor headcount grows for third quarter",
        "BAC credit card delinquencies fall to 5-year low",
        "Moynihan: consumer spending remains resilient",
    ],
    "JNJ": [
        "J&J talc liability settlement receives court approval",
        "Innovative medicine pipeline shows strong Phase 3 data",
        "MedTech segment beats expectations on surgical volumes",
        "JNJ raises full-year EPS guidance by $0.15",
    ],
    "PFE": [
        "Pfizer oncology drug receives FDA priority review",
        "Cost-cutting plan on track to save $4B annually",
        "COVID antiviral royalties provide steady cashflow",
        "Pfizer weight-loss candidate shows promising Phase 2",
    ],
    "XOM": [
        "ExxonMobil Pioneer acquisition synergies exceed targets",
        "Permian Basin production hits 1.4M barrels/day",
        "Exxon low-carbon unit secures 3 CCS contracts",
        "Crude margins improve as OPEC+ extends cuts",
    ],
    "CVX": [
        "Chevron Hess deal expected to close next quarter",
        "Tengizchevroil expansion adds 260k barrels/day",
        "Chevron raises quarterly dividend by 8%",
        "Renewable energy investments pace ahead of plan",
    ],
    "BTC-USD": [
        "Bitcoin ETF inflows hit $2.1B in a single week",
        "MicroStrategy adds 12,000 BTC to treasury",
        "Bitcoin hash rate reaches all-time high",
        "BlackRock Bitcoin ETF AUM crosses $20B",
    ],
    "ETH-USD": [
        "Ethereum spot ETF approvals drive institutional demand",
        "Layer 2 transaction volume surpasses Ethereum mainnet",
        "ETH staking yield rises to 4.8% annually",
        "Vitalik unveils roadmap for stateless Ethereum",
    ],
}


class SentimentEngine:
    """
    Maintains a per-symbol sentiment state and emits ticks via `stream()`.

    Score range: -1.0 (extreme bearish) → +1.0 (extreme bullish)
    Mean reversion: pulls toward target score (or 0) over time.
    """

    def __init__(self):
        # Initialise scores with slight positive bias (bull market prior)
        self._scores: dict[str, float] = {
            sym: random.uniform(-0.3, 0.7) for sym in SYMBOLS
        }
        self._news_counts: dict[str, int] = {
            sym: random.randint(3, 25) for sym in SYMBOLS
        }
        self._last_fetched: float = 0.0
        self._fetch_interval: float = 1800.0  # 30 minutes
        self._cached_data: dict[str, dict] = {}
        
        from config import get_settings
        settings = get_settings()
        self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)

    async def _fetch_news_for_all(self) -> bool:
        """Fetch news headlines from Yahoo Finance and run VADER analysis."""
        # Check Redis cache for whatever is available
        redis_cached_symbols = []
        for sym in SYMBOLS:
            try:
                cached_str = await self._redis.get(f"sentiment:news:{sym}")
                if cached_str:
                    self._cached_data[sym] = json.loads(cached_str)
                    redis_cached_symbols.append(sym)
            except Exception as e:
                logger.warning(f"Redis cache check failed for {sym}: {e}")

        # If everything was cached in Redis, we are done!
        if len(redis_cached_symbols) == len(SYMBOLS):
            logger.info("🎯 All news sentiments retrieved from Redis cache.")
            return True

        missing_symbols = [s for s in SYMBOLS if s not in redis_cached_symbols]
        logger.info(f"📰 Cache miss for {len(missing_symbols)} symbols. Fetching from Yahoo Finance...")

        tasks = [self._fetch_ticker_news_yfinance(sym) for sym in missing_symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        any_success = len(redis_cached_symbols) > 0
        for sym, res in zip(missing_symbols, results):
            if isinstance(res, Exception):
                logger.warning(f"Failed news fetch for {sym}: {res}")
            elif res:
                self._cached_data[sym] = res
                any_success = True
                # Cache in Redis with 30 minutes TTL
                try:
                    await self._redis.set(f"sentiment:news:{sym}", json.dumps(res), ex=int(self._fetch_interval))
                except Exception as e:
                    logger.warning(f"Failed to cache news for {sym} in Redis: {e}")

        return any_success

    async def _fetch_ticker_news_yfinance(self, symbol: str) -> dict | None:
        """Fetch news for ticker from Yahoo Finance using thread pool."""
        try:
            # yfinance download news is synchronous, run in executor
            loop = asyncio.get_event_loop()
            news = await loop.run_in_executor(None, self._sync_fetch_yfinance_news, symbol)
            if not news:
                return None

            scores = []
            headlines = []
            # Take up to 5 articles
            for art in news[:5]:
                content = art.get("content", {}) if isinstance(art.get("content"), dict) else {}
                title = content.get("title") or art.get("title", "")
                if not title:
                    continue

                provider_info = content.get("provider", {}) or art.get("provider", {}) or art.get("publisher", "")
                if isinstance(provider_info, dict):
                    publisher = provider_info.get("displayName") or provider_info.get("name", "Yahoo Finance")
                else:
                    publisher = provider_info or "Yahoo Finance"

                vs = _analyzer.polarity_scores(title)
                scores.append(vs.get("compound", 0.0))

                formatted_headline = f"[{publisher}] {title}" if publisher else title
                headlines.append(formatted_headline)

            if not scores:
                return None

            avg_score = sum(scores) / len(scores)
            headline = headlines[0] if headlines else "No recent news headlines"

            return {
                "score": avg_score,
                "headline": headline,
                "news_count": len(news),
            }
        except Exception as e:
            logger.warning(f"Error querying yfinance news for {symbol}: {e}")
            return None

    def _sync_fetch_yfinance_news(self, symbol: str) -> list[dict] | None:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        return ticker.news

    async def _tick(self) -> list[dict]:
        results = []
        now = time.time()

        # Trigger cached fetch update if interval elapsed
        if now - self._last_fetched > self._fetch_interval:
            success = await self._fetch_news_for_all()
            if success:
                self._last_fetched = now
                logger.info("✅ Yahoo Finance news cache successfully updated.")
            else:
                # Set fetched timestamp anyway to prevent hammering API when failing
                self._last_fetched = now
                logger.info("⚠️ Yahoo Finance news cache update failed or skipped. Using fallbacks.")

        for sym in SYMBOLS:
            cached = self._cached_data.get(sym)

            if cached:
                # Real data cached: mean-revert pulling towards VADER score target
                target = cached["score"]
                current = self._scores[sym]
                drift = -0.1 * (current - target)  # drift pulling toward target sentiment
                shock = random.gauss(0, 0.04)     # lower noise shock since it uses real data
                new_score = max(-1.0, min(1.0, current + drift + shock))
                self._scores[sym] = new_score

                # News count fluctuates gently around cached count
                self._news_counts[sym] = max(1, cached["news_count"] + random.randint(-1, 1))
                headline = cached["headline"]
            else:
                # Simulated fallback: mean-revert pulling towards 0
                current = self._scores[sym]
                drift = -0.05 * current
                shock = random.gauss(0, 0.08)
                new_score = max(-1.0, min(1.0, current + drift + shock))
                self._scores[sym] = new_score

                self._news_counts[sym] = max(1, self._news_counts[sym] + random.randint(-2, 3))
                headlines = _HEADLINES.get(sym, ["No recent headlines"])
                headline = random.choice(headlines)

            results.append({
                "symbol":     sym,
                "score":      round(new_score, 4),
                "label":      _score_to_label(new_score),
                "news_count": self._news_counts[sym],
                "headline":   headline,
                "market_cap": MARKET_CAPS.get(sym, 100),
                "ts":         int(time.time() * 1000),
            })
        return results

    async def stream(self, interval: float = 8.0) -> AsyncIterator[list[dict]]:
        """Yield a full snapshot of all symbols every `interval` seconds."""
        while True:
            yield await self._tick()
            await asyncio.sleep(interval)


def _score_to_label(score: float) -> str:
    if score >= 0.4:  return "bullish"
    if score >= 0.1:  return "slightly_bullish"
    if score >= -0.1: return "neutral"
    if score >= -0.4: return "slightly_bearish"
    return "bearish"
