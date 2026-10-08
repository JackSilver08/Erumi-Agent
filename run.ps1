param(
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "          ERUMI AGENT DEV RUNNER          " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "[ERROR] Docker was not found. Install/start Docker Desktop first." -ForegroundColor Red
  exit 1
}

if (-not (docker info 2>$null)) {
  Write-Host "[ERROR] Docker Desktop/Engine is not running." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".env")) {
  Write-Host "[INIT] .env not found -> creating from .env.example" -ForegroundColor Yellow
  Copy-Item ".env.example" ".env"
}

Write-Host "[1/4] Starting Erumi containers..." -ForegroundColor Green

if ($NoBuild) {
  docker compose up -d
} else {
  docker compose up -d --build
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] Docker Compose failed to start." -ForegroundColor Red
  Write-Host ""
  Write-Host "Container status:" -ForegroundColor Yellow
  docker compose ps -a
  Write-Host ""
  Write-Host "Postgres logs:" -ForegroundColor Yellow
  docker compose logs --tail=120 postgres 2>$null
  Write-Host ""
  Write-Host "Redis logs:" -ForegroundColor Yellow
  docker compose logs --tail=120 redis 2>$null
  exit 1
}

Write-Host "[2/4] Waiting for API health..." -ForegroundColor Green

$apiReady = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health/live" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $apiReady = $true
      break
    }
  } catch { }
  Start-Sleep -Seconds 2
}

if (-not $apiReady) {
  Write-Host "[ERROR] API did not become healthy in time." -ForegroundColor Red
  docker compose ps
  docker compose logs --tail=120 api
  exit 1
}

Write-Host "[3/4] Applying database migrations..." -ForegroundColor Green
docker compose exec -T api alembic upgrade head

if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] Database migration failed." -ForegroundColor Red
  docker compose logs --tail=120 api
  exit 1
}

Write-Host "[4/4] Waiting for Web UI..." -ForegroundColor Green

$webReady = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $webReady = $true
      break
    }
  } catch { }
  Start-Sleep -Seconds 2
}

if (-not $webReady) {
  Write-Host "[ERROR] Web UI did not become available in time." -ForegroundColor Red
  docker compose ps
  docker compose logs --tail=120 web
  exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "       ERUMI IS READY TO USE             " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Web UI : http://localhost:8080" -ForegroundColor White
Write-Host "API    : http://localhost:8000/docs" -ForegroundColor White
Write-Host "MinIO  : http://localhost:9001" -ForegroundColor White
Write-Host "Ollama : http://localhost:11434" -ForegroundColor White
Write-Host ""
Write-Host "Opening browser..." -ForegroundColor Cyan
Start-Process "http://localhost:8080"
Write-Host ""
Write-Host "Live container logs (Ctrl+C stops log view only):" -ForegroundColor Yellow
Write-Host ""
docker compose logs --tail=100 -f