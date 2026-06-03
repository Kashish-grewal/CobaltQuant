"""
App State — Shared Singleton Objects
======================================
Global objects that live for the entire app lifetime.
FastAPI's dependency injection can't hold mutable state between requests,
so we use module-level variables for long-running objects like the Alpaca client.

WHY NOT USE FastAPI's app.state?
  app.state works, but importing it requires the app object, which creates
  circular imports. Module-level globals are simpler and equally correct here.
"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from data.alpaca_client import AlpacaLiveClient

# Set to an AlpacaLiveClient instance in main.py lifespan when DATA_MODE=live
alpaca_client: "AlpacaLiveClient | None" = None
