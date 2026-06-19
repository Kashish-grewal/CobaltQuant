"""
Authentication Module — Unit Tests
=====================================
Tests JWT token lifecycle, API key verification, and dev/prod mode behavior.
"""

import time
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

import jwt as pyjwt


# ── JWT Token Tests ───────────────────────────────────────────────────────────

class TestJWTTokens:
    """Tests for JWT token creation and verification."""

    def test_create_token_returns_valid_jwt(self):
        with patch("auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = "a" * 32  # 32-byte key
            mock_settings.jwt_algorithm = "HS256"
            mock_settings.jwt_expire_minutes = 60

            from auth import create_jwt_token
            token = create_jwt_token(subject="test-user")

            assert isinstance(token, str)
            assert len(token) > 0

            # Decode and verify claims
            payload = pyjwt.decode(token, "a" * 32, algorithms=["HS256"], issuer="cobaltquant")
            assert payload["sub"] == "test-user"
            assert payload["iss"] == "cobaltquant"
            assert "exp" in payload
            assert "iat" in payload

    def test_create_token_includes_extra_claims(self):
        with patch("auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = "b" * 32
            mock_settings.jwt_algorithm = "HS256"
            mock_settings.jwt_expire_minutes = 60

            from auth import create_jwt_token
            token = create_jwt_token(subject="api-client", extra_claims={"scope": "read:prices"})

            payload = pyjwt.decode(token, "b" * 32, algorithms=["HS256"], issuer="cobaltquant")
            assert payload["scope"] == "read:prices"

    def test_verify_token_succeeds_with_valid_token(self):
        with patch("auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = "c" * 32
            mock_settings.jwt_algorithm = "HS256"
            mock_settings.jwt_expire_minutes = 60

            from auth import create_jwt_token, verify_jwt_token
            token = create_jwt_token(subject="dashboard")
            payload = verify_jwt_token(token)

            assert payload["sub"] == "dashboard"

    def test_verify_expired_token_raises_401(self):
        secret = "d" * 32
        with patch("auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = secret
            mock_settings.jwt_algorithm = "HS256"
            mock_settings.jwt_expire_minutes = 0

            # Create an already-expired token
            payload = {
                "sub": "test-user",
                "iat": datetime.now(timezone.utc) - timedelta(hours=2),
                "exp": datetime.now(timezone.utc) - timedelta(hours=1),
                "iss": "cobaltquant",
            }
            expired_token = pyjwt.encode(payload, secret, algorithm="HS256")

            from auth import verify_jwt_token
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc_info:
                verify_jwt_token(expired_token)
            assert exc_info.value.status_code == 401
            assert "expired" in exc_info.value.detail.lower()

    def test_verify_token_with_wrong_secret_raises_401(self):
        with patch("auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = "e" * 32
            mock_settings.jwt_algorithm = "HS256"

            # Create token with a different secret
            payload = {
                "sub": "test-user",
                "iat": datetime.now(timezone.utc),
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
                "iss": "cobaltquant",
            }
            bad_token = pyjwt.encode(payload, "f" * 32, algorithm="HS256")

            from auth import verify_jwt_token
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc_info:
                verify_jwt_token(bad_token)
            assert exc_info.value.status_code == 401


# ── API Key Tests ─────────────────────────────────────────────────────────────

class TestAPIKeyVerification:
    """Tests for API key middleware behavior."""

    @pytest.mark.anyio
    async def test_dev_mode_allows_all_requests(self):
        """In dev mode (no API_KEY set), all requests should pass."""
        with patch("auth.settings") as mock_settings:
            mock_settings.api_key = ""
            mock_settings.environment = "development"

            from auth import verify_api_key
            result = await verify_api_key(api_key=None)
            assert result is None  # None = allowed (no key required)

    @pytest.mark.anyio
    async def test_production_mode_rejects_missing_key(self):
        """In production, missing API key should return 401."""
        with patch("auth.settings") as mock_settings:
            mock_settings.api_key = "real-api-key"
            mock_settings.environment = "production"

            from auth import verify_api_key
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc_info:
                await verify_api_key(api_key=None)
            assert exc_info.value.status_code == 401

    @pytest.mark.anyio
    async def test_production_mode_rejects_wrong_key(self):
        """In production, wrong API key should return 403."""
        with patch("auth.settings") as mock_settings:
            mock_settings.api_key = "correct-key"
            mock_settings.environment = "production"

            from auth import verify_api_key
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc_info:
                await verify_api_key(api_key="wrong-key")
            assert exc_info.value.status_code == 403

    @pytest.mark.anyio
    async def test_production_mode_accepts_correct_key(self):
        """In production, correct API key should return the key."""
        with patch("auth.settings") as mock_settings:
            mock_settings.api_key = "correct-key"
            mock_settings.environment = "production"

            from auth import verify_api_key
            result = await verify_api_key(api_key="correct-key")
            assert result == "correct-key"
