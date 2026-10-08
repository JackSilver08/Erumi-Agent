# Erumi Foundation Status

This document records the Foundation environment now present in the repository.

## Implemented

- React + TypeScript + Vite frontend container.
- FastAPI backend container.
- PostgreSQL with pgvector image and initial Alembic schema.
- Redis.
- MinIO.
- Ollama service for local inference.
- SSE chat streaming.
- WebSocket realtime endpoint.
- Real database and Redis readiness checks.
- CI for frontend lint/build, backend tests, Docker builds and security scan.
- Staging and production image publishing workflows.
- Optional SSH deployment guarded by GitHub Environment variables.
- Production Compose stack with pinned core service versions.
- develop integration branch created from main.
- Deployment and auto-merge policy documented.

## Intentionally deferred

- Full Agent planner and tool executor.
- MCP/OpenAPI tool registry.
- Web research and browser automation.
- RAG ingestion/retrieval/reranking.
- Long-term memory.
- OAuth integrations.
- Desktop filesystem bridge.
- Production observability stack.
- Full database-backed authentication and conversation persistence.

Those capabilities follow the project roadmap after the foundation is verified in a real Docker environment.
