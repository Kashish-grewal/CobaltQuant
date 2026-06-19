"""
Cobalt — API Response Schemas (Pydantic)
==========================================
Typed response models for all REST endpoints.

WHY PYDANTIC RESPONSE MODELS?
  - Auto-generates OpenAPI/Swagger documentation with example values
  - Runtime validation of outgoing responses (catches bugs before production)
  - Type safety for frontend integration — the contract is explicit
  - Standard practice in professional FastAPI applications
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    service: str
    database: str


# ── Assets ────────────────────────────────────────────────────────────────────

class AssetInfo(BaseModel):
    symbol: str
    name: str
    sector: str
    price: float

class AssetsResponse(BaseModel):
    assets: list[AssetInfo]


# ── Price History ─────────────────────────────────────────────────────────────

class PriceTickResponse(BaseModel):
    symbol: str
    price: float
    open: float
    high: float
    low: float
    volume: int
    change: float
    change_pct: float
    source: str
    timestamp: int

class HistoryResponse(BaseModel):
    ticker: str
    count: int
    hours: int
    data: list[PriceTickResponse]


# ── ML Signals ────────────────────────────────────────────────────────────────

class ShapValue(BaseModel):
    feature: str
    value: float
    shap: float

class SignalResponse(BaseModel):
    ticker: str
    signal: str = Field(description="BUY | SELL | HOLD")
    confidence: float = Field(ge=0.0, le=1.0)
    probabilities: dict[str, float]
    shap_values: list[ShapValue]
    feature_values: dict[str, float]
    model_accuracy: float
    cached: Optional[bool] = None
    error: Optional[str] = None

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "ticker": "AAPL",
                "signal": "BUY",
                "confidence": 0.72,
                "probabilities": {"BUY": 0.72, "SELL": 0.15, "HOLD": 0.13},
                "shap_values": [{"feature": "RSI (14)", "value": 61.4, "shap": 0.18}],
                "feature_values": {"rsi": 61.4},
                "model_accuracy": 0.62,
            }]
        }
    }


# ── Auth ──────────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Token lifetime in seconds")
    client: str

class TokenVerifyResponse(BaseModel):
    valid: bool
    subject: Optional[str] = None
    issued_at: Optional[float] = None
    expires: Optional[float] = None
    scope: Optional[str] = None


# ── Root ──────────────────────────────────────────────────────────────────────

class RootResponse(BaseModel):
    name: str = "CobaltQuant API"
    version: str = "0.1.0"
    data_mode: str
    docs: str = "/docs"
    metrics: str = "/metrics"
