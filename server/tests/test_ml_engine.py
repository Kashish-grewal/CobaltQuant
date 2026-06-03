import numpy as np
import pandas as pd
import pytest
from data.ml_engine import (
    _rsi,
    _macd,
    _bollinger_pct,
    _atr_pct,
    build_features,
    FEATURE_NAMES,
)

def test_rsi_calculation():
    # Construct a dummy series where price strictly increases
    prices = pd.Series([10.0 + i for i in range(20)])
    rsi_vals = _rsi(prices, period=14)
    assert len(rsi_vals) == 20
    # RSI should be high/approaching 100 for strictly increasing series
    assert rsi_vals.iloc[-1] > 80

def test_macd_calculation():
    # Series with a trend shift
    prices = pd.Series([10.0 + (i if i < 10 else 20 - i) for i in range(20)])
    macd_vals = _macd(prices)
    assert len(macd_vals) == 20
    assert not macd_vals.isnull().all()

def test_bollinger_pct_calculation():
    prices = pd.Series([100.0] * 20)
    bb_pct = _bollinger_pct(prices, period=10)
    assert len(bb_pct) == 20
    # On perfectly flat series, bb position is defined to not crash due to small constant 1e-10
    assert not bb_pct.isnull().all()

def test_atr_pct_calculation():
    df = pd.DataFrame({
        "High": [105.0] * 20,
        "Low": [95.0] * 20,
        "Close": [100.0] * 20,
    })
    atr_val = _atr_pct(df, period=14)
    assert len(atr_val) == 20
    assert (atr_val > 0).all()

def test_build_features():
    # Construct dummy OHLCV data
    dates = pd.date_range(start="2026-01-01", periods=50, freq="D")
    df = pd.DataFrame({
        "Open": np.random.uniform(90, 110, 50),
        "High": np.random.uniform(105, 120, 50),
        "Low": np.random.uniform(80, 95, 50),
        "Close": np.random.uniform(90, 110, 50),
        "Volume": np.random.randint(1000, 10000, 50),
    }, index=dates)
    
    feats = build_features(df)
    # Check that output columns are present and no NaN values remain
    for col in FEATURE_NAMES:
        assert col in feats.columns
    assert not feats.isnull().any().any()
    assert len(feats) > 0
