"""
API Endpoint Tests
====================
Tests REST endpoints including health check, assets, signals, and edge cases.
"""

from unittest.mock import patch, AsyncMock
from data.ml_engine import SignalResult


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["name"] == "CobaltQuant API"
    assert "data_mode" in json_data
    assert json_data["docs"] == "/docs"


def test_health_endpoint(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "cobalt-api"
    assert "database" in data  # Should include database connectivity status


def test_assets_endpoint(client):
    response = client.get("/api/v1/assets")
    assert response.status_code == 200
    json_data = response.json()
    assert "assets" in json_data
    assert len(json_data["assets"]) > 0
    # Verify asset schema
    asset = json_data["assets"][0]
    assert "symbol" in asset
    assert "name" in asset
    assert "sector" in asset
    assert "price" in asset
    assert isinstance(asset["price"], (int, float))


@patch("routes.signals_api.get_signal", new_callable=AsyncMock)
def test_signals_endpoint(mock_get_signal, client):
    """ML signals endpoint should return prediction with SHAP values."""
    mock_get_signal.return_value = SignalResult(
        ticker="AAPL",
        signal="BUY",
        confidence=0.85,
        probabilities={"BUY": 0.85, "SELL": 0.05, "HOLD": 0.10},
        shap_values=[{"feature": "RSI (14)", "value": 60.0, "shap": 0.15}],
        feature_values={"rsi": 60.0},
        model_accuracy=0.62,
    )
    
    response = client.get("/api/signals/AAPL")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["ticker"] == "AAPL"
    assert json_data["signal"] == "BUY"
    assert json_data["confidence"] == 0.85
    assert json_data["probabilities"]["BUY"] == 0.85
    assert json_data["shap_values"][0]["feature"] == "RSI (14)"


@patch("routes.signals_api.get_signal", new_callable=AsyncMock)
def test_signals_invalid_ticker_too_long(mock_get_signal, client):
    """Tickers longer than 10 characters should be rejected."""
    response = client.get("/api/signals/THISISWAYTOOLONGFORATICKER")
    assert response.status_code == 400
    assert "Invalid ticker" in response.json()["detail"]


@patch("routes.signals_api.get_signal", new_callable=AsyncMock)
def test_signals_error_returns_degraded_response(mock_get_signal, client):
    """When ML model fails, endpoint should return degraded (not 500)."""
    mock_get_signal.return_value = SignalResult(
        ticker="AAPL",
        signal="HOLD",
        confidence=0.5,
        probabilities={},
        shap_values=[],
        feature_values={},
        model_accuracy=0.0,
        error="Insufficient data",
    )
    
    response = client.get("/api/signals/AAPL")
    assert response.status_code == 200  # Degraded, not 500
    json_data = response.json()
    assert json_data["signal"] == "HOLD"
    assert json_data["error"] == "Insufficient data"


def test_history_endpoint_validates_params(client):
    """History endpoint should validate query parameters."""
    # hours must be >= 1
    response = client.get("/api/v1/history/AAPL?hours=0")
    assert response.status_code == 422

    # limit must be >= 1
    response = client.get("/api/v1/history/AAPL?limit=0")
    assert response.status_code == 422


def test_auth_token_dev_mode(client):
    """In dev mode, token generation should work without API key."""
    response = client.post("/api/auth/token?client_name=test-client")
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["client"] == "test-client"
    assert data["expires_in"] > 0
