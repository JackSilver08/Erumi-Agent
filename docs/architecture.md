# Erumi Architecture Notes

Erumi starts with a fast chat path and promotes requests to the Agent path only
when tool use, research, files, integrations, or approval are required.

## Runtime Layers

- Frontend: React, TypeScript, Vite, Tailwind, TanStack Query, Zustand.
- API: FastAPI with REST, SSE for token streaming, and future WebSocket agent events.
- Data: PostgreSQL with pgvector as source of truth; Redis for coordination.
- Worker: background jobs for RAG ingestion, web research, exports, and tool calls.
- Tool layer: MCP/OpenAPI connectors with per-tool permissions and audit records.

## Initial Vertical Slice

The first slice proves frontend-to-backend streaming:

1. User sends a message in the React console.
2. API accepts `POST /api/v1/chat/completions`.
3. Backend emits SSE events: metadata, token, done.
4. UI renders tokens live and supports aborting the stream.
