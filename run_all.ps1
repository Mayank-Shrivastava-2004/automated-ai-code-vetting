# =============================================================================
# run_all.ps1 — Launch all three services in separate terminal windows
#
# Prerequisites (run once if you haven't already):
#   cd ai-service ; py -m venv .venv ; .\.venv\Scripts\python.exe -m pip install -r requirements.txt
#   cd backend    ; npm install
#   cd frontend   ; npm install
#
# Usage:
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
#   .\run_all.ps1
# =============================================================================

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── Resolve paths ─────────────────────────────────────────────
$AiDir   = Join-Path $Root "ai-service"
$BackDir = Join-Path $Root "backend"
$FeDir   = Join-Path $Root "frontend"
$PyExe   = Join-Path $AiDir ".venv\Scripts\python.exe"

# ── Guard: API key must be real ───────────────────────────────
$EnvFile = Join-Path $AiDir ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "[ERROR] ai-service\.env not found. Copy .env.example and set OPENAI_API_KEY." -ForegroundColor Red
    exit 1
}
$EnvText = Get-Content $EnvFile -Raw
if ($EnvText -match "sk-your-key-here") {
    Write-Host ""
    Write-Host "  *** OPENAI_API_KEY is still the placeholder value! ***" -ForegroundColor Red
    Write-Host "  Edit ai-service\.env and replace 'sk-your-key-here' with your real key." -ForegroundColor Yellow
    Write-Host "  Get a key at: https://platform.openai.com/api-keys" -ForegroundColor Cyan
    Write-Host ""
    notepad $EnvFile
    Read-Host "  Press ENTER after saving your API key to continue"
}

# ── Window 1 — AI Service (FastAPI on :8001) ──────────────────
$aiCmd = "Write-Host '=== AI SERVICE [:8001] ===' -ForegroundColor Cyan; " +
         "& '$PyExe' '$AiDir\main.py'"
Start-Process powershell `
    -ArgumentList "-NoExit", "-Command", $aiCmd `
    -WorkingDirectory $AiDir

Start-Sleep -Milliseconds 800   # give Python a moment to bind the port

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

# ── Done ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Three windows launched:" -ForegroundColor Cyan
Write-Host "    AI Service  → http://localhost:8001/health" -ForegroundColor DarkGray
Write-Host "    Backend     → http://localhost:3001/health" -ForegroundColor DarkGray
Write-Host "    Frontend    → http://localhost:5173  (open this in your browser)" -ForegroundColor Green
Write-Host ""
Write-Host "  To stop: close all three terminal windows." -ForegroundColor DarkGray

# Auto-open the browser after 4 s (enough time for Vite to start)
Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"
