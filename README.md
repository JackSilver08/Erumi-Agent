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

Start the entire development environment with one command on Windows:

```powershell
.\run.ps1
```

Or from Command Prompt:

```cmd
run.cmd
```

The runner creates `.env` when needed, builds/starts Docker services, applies Alembic migrations, waits for API/Web health, opens `http://localhost:8080` automatically, and then follows container logs in the terminal.

For an already-built stack:

```powershell
.\run.ps1 -NoBuild
```

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
