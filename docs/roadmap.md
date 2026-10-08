# Erumi Roadmap

## Phase 0: Foundation

- Repository structure in this folder.
- Docker Compose for web, API, worker, PostgreSQL, Redis, and MinIO.
- Health checks, settings, basic CI, and skeleton database models.

## Phase 1: Fast Chat

- Persist users, chats, messages, attachments, and model settings.
- Connect Ollama and OpenAI-compatible providers behind the model router.
- Add stop, retry, regenerate, title generation, and chat search.

## Phase 2: RAG and Research

- File parsers, chunking, embedding, pgvector search, reranking, citations.
- Web search/fetch with SSRF protection, content limits, and source viewer.

## Phase 3: Agent Core

- Tool registry, agent runs, steps, tool calls, approvals, retries, and audit.
- WebSocket event stream for live run state.

## Phase 4: Integrations

- MCP/OpenAPI connectors, email/calendar OAuth, browser tool, and desktop bridge.
