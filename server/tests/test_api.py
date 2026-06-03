from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from main import app
from data.ml_engine import SignalResult

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["name"] == "CobaltQuant API"
    assert "data_mode" in json_data

def test_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "cobalt-api"}

def test_assets_endpoint():
    response = client.get("/api/v1/assets")
    assert response.status_code == 200
    json_data = response.json()
    assert "assets" in json_data
    assert len(json_data["assets"]) > 0
    assert "symbol" in json_data["assets"][0]

@patch("routes.signals_api.get_signal", new_callable=AsyncMock)
def test_signals_endpoint(mock_get_signal):
    # Setup mock return value
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
