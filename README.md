# Erumi Agent

Erumi is a self-hosted AI Agent platform scaffold based on the project plan in
`Erumi_Agent_Project_Plan.docx`. This repository is initialized directly in the
workspace root, with no extra wrapper project folder.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand.
- Backend: FastAPI, Pydantic, SQLAlchemy async, Alembic.
- Data: PostgreSQL with pgvector, Redis, MinIO.
- Runtime: Docker Compose first; Kubernetes can come later when scale demands it.

## Local Development

Copy environment defaults:

```powershell
Copy-Item .env.example .env
```

Run frontend:

```powershell
npm --prefix frontend run dev
```

Run backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Run the full container stack:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Frontend is served at `http://localhost:5173` in dev or `http://localhost:8080`
through Docker. Backend health is available at `http://localhost:8000/health/live`.

## Project Layout

```text
frontend/          React application
backend/           FastAPI application, models, routers, worker
deploy/            nginx and deployment helpers
docs/              Architecture and roadmap notes
.github/workflows/ CI/CD workflow skeletons
```
