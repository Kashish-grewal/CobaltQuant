"""
REST API Routes
================
HTTP endpoints for fetching static/historical data.
WebSocket is for live updates; REST is for initial data loads and queries.
"""
from fastapi import APIRouter, Query
from data.mock_prices import ASSETS
from schemas import AssetsResponse, HealthResponse, HistoryResponse

router = APIRouter(prefix="/api/v1")


@router.get("/assets", response_model=AssetsResponse)
async def get_assets():
    """
    Returns the full list of tracked assets with their metadata.
    Frontend calls this once on load to know what assets exist.
    """
    return {
        "assets": [
            {
                "symbol": a.symbol,
                "name": a.name,
                "sector": a.sector,
                "price": round(a.price, 2),
            }
            for a in ASSETS
        ]
    }


@router.get("/history/{ticker}", response_model=HistoryResponse)
async def get_history(
    ticker: str,
    hours: int = Query(default=24, ge=1, le=720, description="Hours of history to fetch (max 30 days)"),
    limit: int = Query(default=500, ge=1, le=5000, description="Max ticks to return"),
):
    """
    Returns persisted price history for a ticker.
    
    Data is saved every 10 seconds from the live price feed.
    Available after at least one flush cycle (~10s after server start).
    
    Example: GET /api/v1/history/AAPL?hours=4&limit=100
    """
    from persistence import get_price_history
    ticks = await get_price_history(symbol=ticker, hours=hours, limit=limit)
    return {
        "ticker": ticker.upper(),
        "count": len(ticks),
        "hours": hours,
        "data": ticks,
    }


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check with database connectivity status.
    Used by Docker and monitoring tools.
    Returns 200 OK if the server is alive.
    """
    db_ok = False
    try:
        from db import async_session
        async with async_session() as session:
            await session.execute(__import__("sqlalchemy").text("SELECT 1"))
            db_ok = True
    except Exception:
        pass

    return {
        "status": "healthy",
        "service": "cobalt-api",
        "database": "connected" if db_ok else "unavailable",
    }
