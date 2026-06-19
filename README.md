# CobaltQuant 🚀

> Real-time financial intelligence terminal with live market data, AI-powered multi-agent debate, NLP sentiment analysis, and explainable ML signals — all streaming via WebSockets.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Next.js)                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Terminal  │ │ Heatmap  │ │ AI Debate│ │  ML Signals/SHAP │   │
│  │ (Charts) │ │(D3.js)   │ │(Streaming│ │  (XGBoost)       │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │
│       │             │            │                 │             │
│       └─────────────┴────────────┴─────────────────┘             │
│                      WebSocket / REST                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│  FastAPI Backend         │                                      │
│  ┌───────────┐  ┌────────┴───────┐  ┌────────────┐             │
│  │ WS Manager│  │ Redis Pub/Sub  │  │ Persistence │             │
│  │ (fan-out) │  │ (message bus)  │  │ (batch flush│             │
│  └───────────┘  └────────────────┘  │  to SQLite/ │             │
│                                      │  PostgreSQL)│             │
│  ┌──────────────────────────────┐   └────────────┘             │
│  │ Data Sources                 │                               │
│  │  ├─ Yahoo Finance (30s poll) │                               │
│  │  ├─ Alpaca IEX (500ms live)  │                               │
│  │  └─ GBM Simulation (1s mock) │                               │
│  └──────────────────────────────┘                               │
│  ┌──────────────────────────────┐                               │
│  │ Intelligence Engines         │                               │
│  │  ├─ Sentiment (VADER + YF)   │                               │
│  │  ├─ Debate (GPT-4o / Gemini) │                               │
│  │  └─ ML Signals (XGBoost)     │                               │
│  └──────────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│  Infrastructure          │                                      │
│  Nginx (TLS) · Docker Compose · GitHub Actions CI               │
│  Prometheus Metrics · Sentry Error Tracking                     │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Highlights

| Concept | Implementation | Why It Matters |
|---------|---------------|----------------|
| **Fan-out broadcast** | `ws_manager.py` — O(1) data fetch, N client delivery | Same pattern used in Discord, Slack, trading platforms |
| **Dead connection eviction** | Defensive copy + async gather + automatic cleanup | Production systems must handle ungraceful disconnects |
| **Geometric Brownian Motion** | `mock_prices.py` — dS = μSdt + σSdW (Black-Scholes model) | Quantitative finance standard for price simulation |
| **Write coalescing** | `persistence.py` — buffer ticks, batch INSERT every 10s | Reduces I/O by ~100× vs per-tick writes |
| **Per-ticker training locks** | `ml_engine.py` — double-checked locking pattern | Prevents duplicate XGBoost training on concurrent requests |
| **SHAP explainability** | TreeExplainer on XGBoost with 7 engineered features | ML transparency — not just predictions, but *why* |
| **Exponential backoff** | Both client (`useMarketData.ts`) and server (`alpaca_client.py`) | Production reconnection standard (300ms → 3s cap) |
| **Redis Pub/Sub with fallback** | `main.py` — publishes to Redis, falls back to local broadcast | Fault-tolerant message bus; works with or without Redis |
| **JWT + API key auth** | `auth.py` — three modes: dev (open), API key, full JWT | Progressive security model for different deployment stages |
| **Structured JSON logging** | `logging_config.py` — request ID tracing, env-aware formatting | Production observability standard for log aggregation |
| **Multi-source data pipeline** | Mock → Yahoo Finance → Alpaca live (same interface) | Strategy pattern — swap data sources without changing consumers |
| **Pydantic response models** | `schemas.py` — typed API responses with auto-generated docs | Contract-first API design with runtime validation |

## Features

### Phase 1: Live Price Terminal ✅
- Real-time OHLCV streaming via WebSocket (16 assets across 6 sectors)
- TradingView Lightweight Charts with live price updates
- Watchlist with sector filtering and price change flash animations
- Three data modes: simulated (GBM), Yahoo Finance, Alpaca real-time

### Phase 2: Sentiment Heatmap ✅
- Yahoo Finance headline ingestion → VADER sentiment scoring
- D3.js treemap visualization (cell size = market cap, color = sentiment)
- Redis-cached news with 30-minute TTL to prevent API hammering
- Mean-reverting sentiment model with configurable drift/shock parameters

### Phase 3: Multi-Agent AI Debate ✅
- Three concurrent AI agents (Bull / Bear / Neutral) stream arguments in real-time
- GPT-4o-mini and Gemini 2.5 Flash support with SSE streaming
- Curated offline fallback arguments for 3 major tickers (no API keys needed)
- Bidirectional WebSocket protocol: client selects ticker, server streams debate

### Phase 4: ML Signal Engine ✅
- XGBoost classifier trained on 1 year of daily OHLCV data per ticker
- 7 engineered features: RSI(14), MACD, Bollinger %B, volume ratio, 5d/20d momentum, ATR
- SHAP TreeExplainer for feature importance visualization
- ~58–64% directional accuracy on held-out backtests (8–14% above random)
- Model caching (5min in-memory, 24h on disk) with per-ticker training locks

## Quick Start

### Prerequisites
- Docker Desktop installed and running

```bash
# 1. Clone the project
git clone https://github.com/YOUR_USERNAME/cobaltQuant.git
cd cobaltQuant

# 2. Copy environment file (default uses Yahoo Finance — no API keys needed)
cp .env.example .env

# 3. Start everything
docker compose up --build

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# Swagger docs: http://localhost:8000/docs
# Prometheus metrics: http://localhost:8000/metrics
```

### Running Without Docker

**Terminal 1 — Backend:**
```bash
cd server
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd client
npm install
npm run dev
```

## Project Structure

```
cobaltQuant/
├── docker-compose.yml          # Dev orchestration (Redis + backend + frontend)
├── docker-compose.prod.yml     # Production stack with Nginx TLS termination
├── .env.example                # Environment variables template
├── .github/workflows/ci.yml    # CI: pytest + lint + type-check + Docker build
├── nginx/nginx.conf            # Reverse proxy with security headers
│
├── server/
│   ├── main.py                 # FastAPI app, lifespan, middleware
│   ├── config.py               # Pydantic settings (single source of truth)
│   ├── schemas.py              # Pydantic response models for all endpoints
│   ├── auth.py                 # JWT + API key authentication
│   ├── logging_config.py       # Structured logging with request ID tracing
│   ├── ws_manager.py           # WebSocket connection pool (fan-out + eviction)
│   ├── db.py                   # SQLAlchemy async (SQLite dev / PostgreSQL prod)
│   ├── persistence.py          # Batch write buffer for price tick persistence
│   ├── data/
│   │   ├── assets.py           # Shared asset universe (single source of truth)
│   │   ├── mock_prices.py      # GBM price simulation
│   │   ├── yfinance_client.py  # Yahoo Finance fast_info polling
│   │   ├── alpaca_client.py    # Alpaca IEX real-time WebSocket client
│   │   ├── sentiment_engine.py # VADER sentiment + Yahoo Finance news
│   │   ├── debate_engine.py    # Multi-agent LLM debate streaming
│   │   └── ml_engine.py        # XGBoost + SHAP signal engine
│   ├── routes/
│   │   ├── api.py              # REST endpoints (assets, history, health)
│   │   ├── prices_ws.py        # Price WebSocket endpoint
│   │   ├── sentiment_ws.py     # Sentiment WebSocket endpoint
│   │   ├── debate_ws.py        # Debate WebSocket endpoint
│   │   ├── signals_api.py      # ML signals REST endpoint (rate-limited)
│   │   └── auth_routes.py      # Token generation and verification
│   └── tests/                  # pytest suite (API, WebSocket, auth, ML, sentiment)
│
└── client/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx      # Root layout (SEO metadata)
    │   │   ├── page.tsx        # Main dashboard (terminal, tabs)
    │   │   └── globals.css     # Design system tokens
    │   ├── components/
    │   │   ├── PriceChart.tsx   # TradingView Lightweight Charts
    │   │   ├── SentimentHeatmap.tsx  # D3.js treemap
    │   │   ├── DebatePanel.tsx  # Multi-agent debate UI
    │   │   ├── MLSignalsPanel.tsx    # Full SHAP explainer view
    │   │   ├── SidebarMLSignals.tsx  # Compact ML signals sidebar
    │   │   └── SidebarDebate.tsx     # Compact debate sidebar
    │   ├── hooks/
    │   │   ├── useMarketData.ts # WebSocket hook (backoff reconnection)
    │   │   ├── useSentiment.ts  # Sentiment WebSocket hook
    │   │   └── useDebate.ts     # Debate WebSocket hook
    │   └── types/
    │       └── signals.ts       # ML signal TypeScript interfaces
    └── package.json
```

## API Reference

| Endpoint | Type | Auth | Description |
|----------|------|------|-------------|
| `GET /` | REST | — | API info + version |
| `GET /api/v1/assets` | REST | — | List all tracked assets |
| `GET /api/v1/health` | REST | — | Health check with DB status |
| `GET /api/v1/history/{ticker}` | REST | — | Historical price ticks |
| `GET /api/signals/{ticker}` | REST | Rate-limited | XGBoost signal + SHAP values |
| `POST /api/auth/token` | REST | API Key | Generate JWT token |
| `GET /api/auth/verify` | REST | — | Verify JWT token |
| `WS /ws/prices` | WebSocket | JWT (prod) | Live OHLCV stream |
| `WS /ws/sentiment` | WebSocket | JWT (prod) | Sentiment snapshots |
| `WS /ws/debate` | WebSocket | JWT (prod) | AI debate streaming |
| `GET /docs` | REST | — | Swagger UI |
| `GET /metrics` | REST | — | Prometheus metrics |

## Testing

```bash
# Backend tests
cd server
PYTHONPATH=. pytest -v

# Frontend checks
cd client
npm run lint
npm run type-check
```

## Production Deployment

```bash
# Build and run the production stack
docker compose -f docker-compose.prod.yml up --build -d

# Required environment variables for production:
# JWT_SECRET=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
# API_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(32))">
# SENTRY_DSN=<from https://sentry.io>
```

## License

MIT — see [LICENSE](./LICENSE) for details.
