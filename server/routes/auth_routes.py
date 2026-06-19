"""
Cobalt — Auth Routes
=====================
POST /api/auth/token  — Generate a JWT token (requires API_KEY)
GET  /api/auth/verify  — Verify an existing token

In development (no API_KEY set), tokens are generated freely.
In production, the X-API-Key header must match the configured API_KEY.
"""

import logging
from fastapi import APIRouter, HTTPException, Depends

from auth import verify_api_key, create_jwt_token, verify_jwt_token
from config import get_settings
from schemas import TokenResponse, TokenVerifyResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


@router.post("/token", response_model=TokenResponse)
async def generate_token(
    client_name: str = "dashboard",
    _key: str = Depends(verify_api_key),
):
    """
    Generate a JWT token for WebSocket authentication.
    
    In production: requires valid X-API-Key header.
    In dev mode: open to all (API_KEY not configured).
    
    Usage:
      curl -X POST http://localhost:8000/api/auth/token?client_name=my-app \\
           -H "X-API-Key: your-api-key"
    
    Then use the returned token for WebSocket connections:
      ws://localhost:8000/ws/prices?token=<returned_token>
    """
    token = create_jwt_token(
        subject=client_name,
        extra_claims={"scope": "read:prices,read:sentiment,read:debate,read:signals"},
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": settings.jwt_expire_minutes * 60,
        "client": client_name,
    }


@router.get("/verify", response_model=TokenVerifyResponse)
async def verify_token(token: str):
    """
    Verify a JWT token and return its claims.
    Useful for debugging token issues.
    """
    payload = verify_jwt_token(token)
    return {
        "valid": True,
        "subject": payload.get("sub"),
        "issued_at": payload.get("iat"),
        "expires": payload.get("exp"),
        "scope": payload.get("scope"),
    }
