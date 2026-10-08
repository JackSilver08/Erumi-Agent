# Erumi Agent

Erumi (Erudite Mind) is a self-hosted AI Agent platform built for fast chat first and agent capabilities when needed.

## Foundation stack

- Frontend: React + TypeScript + Vite + Tailwind CSS + TanStack Query + Zustand.
- Backend: FastAPI + Pydantic + SQLAlchemy async + Alembic.
- Data: PostgreSQL + pgvector, Redis, MinIO.
- Inference: Ollama for local development; vLLM/provider APIs can be added for production.
- Realtime: SSE for token streaming and WebSocket for agent events.
- Runtime: Docker Compose first.

## Local development

Create .env.

PowerShell:

~~~powershell
Copy-Item .env.example .env
~~~

Linux/macOS:

~~~bash
cp .env.example .env
~~~

Start the stack:

~~~bash
docker compose up --build
~~~

Endpoints:

- Web UI: http://localhost:8080
- API: http://localhost:8000
- API live: http://localhost:8000/health/live
- API ready: http://localhost:8000/health/ready
- OpenAPI: http://localhost:8000/docs
- Ollama: http://localhost:11434
- MinIO console: http://localhost:9001

Run the first local model:

~~~bash
docker compose exec ollama ollama pull qwen3:4b
~~~

Then set:

~~~env
ERUMI_MOCK_MODEL=false
ERUMI_OLLAMA_MODEL=qwen3:4b
~~~

and restart the API:

~~~bash
docker compose up -d --build api web worker
~~~

## Database

Run migrations inside the API container:

~~~bash
docker compose exec api alembic upgrade head
~~~

## Repository flow

- main: production.
- develop: integration/staging.
- feature/*: normal work.
- fix/*: bug fixes.
- release/*: optional release freeze.

Required checks are defined in GitHub Actions. Auto-merge should be enabled at repository level and protected branches should require the CI checks before merge.

## CI/CD

- Pull requests to develop or main run frontend, backend, Docker and security checks.
- Pushes to develop publish staging images to GHCR.
- Pushes to main publish production images to GHCR.
- Server deployment is guarded by GitHub Environment variables ERUMI_STAGING_DEPLOY_ENABLED and ERUMI_PRODUCTION_DEPLOY_ENABLED.

## Current scope

This foundation makes the Docker stack, database migration path, realtime channels and real local Ollama streaming path ready. RAG, browser automation, MCP integrations, desktop bridge and the full Agent execution loop remain later roadmap phases.
