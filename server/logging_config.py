"""
Cobalt — Structured Logging Configuration
============================================
JSON-formatted logs in production, human-readable in development.
Adds request ID correlation for distributed tracing.

WHY STRUCTURED LOGGING?
  - Machine-parseable (JSON) for log aggregation tools (ELK, Datadog, Loki)
  - Request ID correlation across service boundaries
  - Consistent format for alerting and dashboards
  - Production standard at Google, Microsoft, etc.
"""

import logging
import json
import sys
import uuid
from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Context variable for request-scoped correlation ID
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class JSONFormatter(logging.Formatter):
    """
    Produces one JSON object per log line — parseable by any log aggregation tool.
    Includes request_id from context for distributed tracing.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get("-"),
        }
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, default=str)


class DevFormatter(logging.Formatter):
    """
    Human-readable coloured format for development.
    Includes request_id when available.
    """
    COLORS = {
        "DEBUG": "\033[36m",    # cyan
        "INFO": "\033[32m",     # green
        "WARNING": "\033[33m",  # yellow
        "ERROR": "\033[31m",    # red
        "CRITICAL": "\033[35m", # magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        rid = request_id_var.get("-")
        rid_str = f" [{rid[:8]}]" if rid != "-" else ""
        return (
            f"{self.formatTime(record)} "
            f"{color}[{record.levelname:>7}]{self.RESET} "
            f"{record.name}:{rid_str} {record.getMessage()}"
        )


def setup_logging(environment: str = "development") -> None:
    """
    Configure the root logger based on environment.
    Call once at application startup, before any other imports log.
    """
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Remove any existing handlers (prevents duplicate output)
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)

    if environment == "production":
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(DevFormatter())

    root.addHandler(handler)

    # Suppress noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("yfinance").setLevel(logging.WARNING)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Assigns a unique request ID to every HTTP request.
    The ID is available via `request_id_var` context variable and
    appears in all log lines produced during that request.

    Clients can pass their own ID via the X-Request-ID header for
    end-to-end tracing across microservices.
    """

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = rid
            return response
        finally:
            request_id_var.reset(token)
