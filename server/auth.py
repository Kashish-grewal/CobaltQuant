"""
Cobalt — Authentication Module
================================
Provides JWT token generation/validation and API key checking.

THREE MODES OF OPERATION:
  1. Development (no keys set): All endpoints are open. No auth required.
  2. API Key mode (API_KEY set): REST endpoints require X-API-Key header.
  3. JWT mode (JWT_SECRET set): Full token-based auth with login endpoint.

WebSocket auth uses a token query parameter: ws://host/ws/prices?token=xxx
"""

import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
from fastapi import HTTPException, Security, WebSocket, Query
from fastapi.security import APIKeyHeader

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── API Key Security ──────────────────────────────────────────────────────────
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: Optional[str] = Security(_api_key_header)) -> Optional[str]:
    """
    FastAPI dependency that checks X-API-Key header.
    If API_KEY is not configured (dev mode), allows all requests.
    """
    if not settings.api_key or settings.environment == "development":
        # No API key configured or in dev mode — allow all requests
        return None

    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")

    if api_key != settings.api_key:
        raise HTTPException(status_code=403, detail="Invalid API key")

    return api_key


# ── JWT Token Management ─────────────────────────────────────────────────────

def create_jwt_token(subject: str, extra_claims: dict | None = None) -> str:
    """
    Creates a signed JWT token.

    Args:
        subject: The token subject (e.g., user ID or API client name)
        extra_claims: Additional claims to include in the token

    Returns:
        Encoded JWT string
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
        "iss": "cobaltquant",
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(
        payload,
        settings.effective_jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def verify_jwt_token(token: str) -> dict:
    """
    Validates and decodes a JWT token.

    Returns:
        Decoded payload dict

    Raises:
        HTTPException 401 if token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token,
            settings.effective_jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer="cobaltquant",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


# ── WebSocket Auth ────────────────────────────────────────────────────────────

async def verify_ws_token(websocket: WebSocket) -> Optional[dict]:
    """
    Validates a WebSocket connection's auth token.
    Token is passed as a query parameter: ws://host/ws/prices?token=xxx

    In dev mode (no JWT_SECRET configured), all connections are allowed.

    Returns:
        Decoded token payload, or None if auth is disabled (dev mode)
    """
    if not settings.jwt_secret or settings.environment == "development":
        # No JWT secret configured or in dev mode — allow all WS connections
        return {}

    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing auth token")
        return None

    try:
        payload = verify_jwt_token(token)
        return payload
    except HTTPException:
        await websocket.close(code=4003, reason="Invalid or expired token")
        return None
