"""
Cobalt — ML Signals REST Route (Phase 4)
==========================================
GET /api/signals/{ticker}
Returns XGBoost signal + SHAP values. Cached for 5 minutes.
"""

import logging
from fastapi import APIRouter, HTTPException
from data.ml_engine import get_signal

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.get("/signals/{ticker}")
async def signals(ticker: str):
    """
    Returns ML signal for the given ticker.
    Trains a fresh model on first call; subsequent calls within 5min use cache.
    Training takes ~3–8 seconds on first call.
    """
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
