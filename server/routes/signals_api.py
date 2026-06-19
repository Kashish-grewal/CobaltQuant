"""
Cobalt — ML Signals REST Route (Phase 4)
==========================================
GET /api/signals/{ticker}
Returns XGBoost signal + SHAP values. Cached for 5 minutes.
Rate-limited to prevent abuse of expensive model training.
"""

import logging
import time
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Request
from data.ml_engine import get_signal
from config import get_settings
from schemas import SignalResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")
settings = get_settings()

# ── Simple rate limiter (sliding window, per-IP) ─────────────────────────────
# No external dependency needed — just a dict of timestamps.
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60.0  # seconds


def _check_rate_limit(client_ip: str) -> bool:
    """Returns True if the request is allowed, False if rate-limited."""
    now = time.time()
    window_start = now - _RATE_WINDOW

    # Prune old timestamps
    timestamps = _rate_limit_store[client_ip]
    _rate_limit_store[client_ip] = [t for t in timestamps if t > window_start]

    if len(_rate_limit_store[client_ip]) >= settings.rate_limit_per_minute:
        return False

    _rate_limit_store[client_ip].append(now)
    return True


@router.get("/signals/{ticker}", response_model=SignalResponse)
async def signals(ticker: str, request: Request):
    """
    Returns ML signal for the given ticker.
    Trains a fresh model on first call; subsequent calls within 5min use cache.
    Training takes ~3–8 seconds on first call.
    Rate-limited to {rate_limit_per_minute} requests/minute per IP.
    """
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {settings.rate_limit_per_minute} requests per minute.",
        )

    ticker = ticker.upper().strip()
    if not ticker or len(ticker) > 10:
        raise HTTPException(status_code=400, detail="Invalid ticker")

    result = await get_signal(ticker)

    if result.error:
        # Return degraded payload rather than 500 so UI can show error state
        return {
            "ticker":         ticker,
            "signal":         "HOLD",
            "confidence":     0.5,
            "probabilities":  {},
            "shap_values":    [],
            "feature_values": {},
            "model_accuracy": 0.0,
            "error":          result.error,
        }

    return {
        "ticker":         result.ticker,
        "signal":         result.signal,
        "confidence":     result.confidence,
        "probabilities":  result.probabilities,
        "shap_values":    result.shap_values,
        "feature_values": result.feature_values,
        "model_accuracy": result.model_accuracy,
        "cached":         True,
    }

