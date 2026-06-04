import pytest
from unittest.mock import patch, MagicMock
from data.sentiment_engine import SentimentEngine

@pytest.mark.anyio
async def test_sentiment_engine_fetch_yfinance():
    engine = SentimentEngine()
    
    # Mock yfinance Ticker.news payload (with the nested content structure)
    mock_news = [
        {
            "content": {
                "title": "Apple sales are booming in the new quarter",
                "provider": {
                    "displayName": "Reuters"
                }
            },
            "id": "1"
        },
        {
            "content": {
                "title": "Apple store closes in California",
                "provider": {
                    "displayName": "USA Today"
                }
            },
            "id": "2"
        }
    ]
    
    with patch("yfinance.Ticker") as mock_ticker_class:
        mock_instance = MagicMock()
        mock_instance.news = mock_news
        mock_ticker_class.return_value = mock_instance
        
        res = await engine._fetch_ticker_news_yfinance("AAPL")
        
        assert res is not None
        assert "score" in res
        assert "headline" in res
        assert "news_count" in res
        assert res["news_count"] == 2
        # VADER compound score should be non-zero for positive/negative news
        assert isinstance(res["score"], float)
        assert "[Reuters]" in res["headline"]

@pytest.mark.anyio
async def test_sentiment_engine_tick():
    engine = SentimentEngine()
    
    # Mock fetch_news_for_all to succeed
    with patch.object(engine, "_fetch_news_for_all", return_value=True) as mock_fetch:
        ticks = await engine._tick()
        assert len(ticks) == 16  # 16 symbols
        for tick in ticks:
            assert "symbol" in tick
            assert "score" in tick
            assert "headline" in tick
            assert "news_count" in tick
            assert "market_cap" in tick
