# Contributing to CobaltQuant

Thanks for your interest in contributing! This document outlines how to get started.

## Development Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- Docker Desktop (optional, for full stack)

### Backend

```bash
cd server
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd client
npm install
npm run dev
```

### Full Stack (Docker)

```bash
cp .env.example .env
docker compose up --build
```

## Code Style

### Python
- Follow PEP 8
- Use type hints for all function signatures
- Docstrings for all public functions and classes
- Use `async`/`await` for all I/O operations
- Import order: stdlib → third-party → local

### TypeScript
- Strict mode enabled
- Use interfaces over type aliases for object shapes
- Custom hooks for all stateful logic
- Use `useCallback` / `useMemo` for performance-critical paths

## Testing

```bash
# Run backend tests
cd server
PYTHONPATH=. pytest -v

# Run frontend checks
cd client
npm run lint
npm run type-check
```

All PRs must pass CI (pytest + ESLint + TypeScript type-check + Docker build).

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Write tests for new functionality
4. Ensure all tests pass locally
5. Submit a PR with a clear description of changes

## Architecture Decisions

Key design decisions are documented in code comments (search for `WHY` and `DESIGN`). If you're changing core architecture, please discuss in an issue first.
