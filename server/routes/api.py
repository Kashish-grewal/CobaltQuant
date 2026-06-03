"""
REST API Routes
================
HTTP endpoints for fetching static/historical data.
WebSocket is for live updates; REST is for initial data loads and queries.
"""
from fastapi import APIRouter
from data.mock_prices import ASSETS

router = APIRouter(prefix="/api/v1")


@router.get("/assets")
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


@router.get("/health")
async def health_check():
    """
    Simple health check. Used by Docker and monitoring tools.
    Returns 200 OK if the server is alive.
    """
    return {"status": "healthy", "service": "cobalt-api"}
