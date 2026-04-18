# =============================================================================
# restart_all.ps1 — Kill existing services and restart them in new windows
#
# Cleans up any zombie processes holding ports 3001, 8001, or 5173, then
# starts the AI service, Node backend, and React frontend exactly like run_all.ps1.
# =============================================================================

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Stopping running services...          " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

function Kill-Port {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pid = $conn.OwningProcess
            if ($pid -and $pid -ne 0) {
                Write-Host "  Found process $pid on port $Port. Killing it..." -ForegroundColor Yellow
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

Kill-Port 8001
Kill-Port 3001
Kill-Port 5173

Start-Sleep -Seconds 2

# ── Resolve paths ─────────────────────────────────────────────
$AiDir   = Join-Path $Root "ai-service"
$BackDir = Join-Path $Root "backend"
$FeDir   = Join-Path $Root "frontend"
$PyExe   = Join-Path $AiDir ".venv\Scripts\python.exe"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Restarting services...                " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ── Guard: API key ────────────────────────────────────────────
$EnvFile = Join-Path $AiDir ".env"
$EnvText = Get-Content $EnvFile -Raw
if ($EnvText -match "sk-your-key-here") {
    Write-Host ""
    Write-Host "  *** ERROR: OPENAI_API_KEY is still the placeholder value! ***" -ForegroundColor Red
    Write-Host "  Please edit ai-service\.env and set your real key before trying to review code." -ForegroundColor Yellow
    Write-Host ""
}

# ── Window 1 — AI Service (FastAPI on :8001) ──────────────────
$aiCmd = "Write-Host '=== AI SERVICE [:8001] ===' -ForegroundColor Cyan; " +
         "& '$PyExe' main.py"
Start-Process powershell `
    -ArgumentList "-NoExit", "-Command", $aiCmd `
    -WorkingDirectory $AiDir

Start-Sleep -Milliseconds 800

# ── Window 2 — Backend (Node.js WS+REST on :3001) ────────────
$backCmd = "Write-Host '=== BACKEND [:3001] ===' -ForegroundColor Yellow; " +
           "npx tsx watch src\server.ts"
Start-Process powershell `
    -ArgumentList "-NoExit", "-Command", $backCmd `
    -WorkingDirectory $BackDir

Start-Sleep -Milliseconds 500

# ── Window 3 — Frontend (Vite on :5173) ──────────────────────
$feCmd = "Write-Host '=== FRONTEND [:5173] ===' -ForegroundColor Green; " +
         "npm run dev"
Start-Process powershell `
    -ArgumentList "-NoExit", "-Command", $feCmd `
    -WorkingDirectory $FeDir

Write-Host ""
Write-Host "  Done! Three windows launched." -ForegroundColor Green
Write-Host "    AI Service  → http://localhost:8001/health" -ForegroundColor DarkGray
Write-Host "    Backend     → http://localhost:3001/health" -ForegroundColor DarkGray
Write-Host "    Frontend    → http://localhost:5173" -ForegroundColor DarkGray
Write-Host ""
