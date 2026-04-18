# =============================================================================
# start-all.ps1 — one-shot setup & launch for the AI Code Review Bot
#
# Starts three services in separate PowerShell windows:
#   Window 1 → ai-service  (FastAPI :8001)
#   Window 2 → backend     (Node.js  :3001)
#   Window 3 → frontend    (Vite     :5173)
#
# Run from the project root:
#   .\start-all.ps1
# =============================================================================

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI Code Review Bot — Full Stack Start " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# 0. Pre-flight checks
# ---------------------------------------------------------------------------

# Python
try {
    $pyVer = & py --version 2>&1
    Write-Host "[OK] Python: $pyVer" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] 'py' not found. Install Python via pymanager and try again." -ForegroundColor Red
    exit 1
}

# Node
try {
    $nodeVer = & node --version 2>&1
    Write-Host "[OK] Node.js: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# npm
try {
    $npmVer = & npm --version 2>&1
    Write-Host "[OK] npm: $npmVer" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] npm not found." -ForegroundColor Red
    exit 1
}

Write-Host ""

# ---------------------------------------------------------------------------
# 1. AI Service — Python venv + pip install
# ---------------------------------------------------------------------------

Write-Host "[1/3] Setting up AI service..." -ForegroundColor Yellow

$aiDir = Join-Path $Root "ai-service"
$venv  = Join-Path $aiDir ".venv"

if (-not (Test-Path $venv)) {
    Write-Host "      Creating virtual environment..." -ForegroundColor DarkGray
    & py -m venv $venv
}

$pip = Join-Path $venv "Scripts\pip.exe"
Write-Host "      Installing Python dependencies..." -ForegroundColor DarkGray
& $pip install -r (Join-Path $aiDir "requirements.txt") --quiet

# Create .env if it doesn't exist
$aiEnv = Join-Path $aiDir ".env"
if (-not (Test-Path $aiEnv)) {
    Copy-Item (Join-Path $aiDir ".env.example") $aiEnv
    Write-Host ""
    Write-Host "  *** ACTION REQUIRED ***" -ForegroundColor Red
    Write-Host "  Edit ai-service\.env and set your OPENAI_API_KEY, then re-run this script." -ForegroundColor Red
    Write-Host "  File: $aiEnv" -ForegroundColor Yellow
    Write-Host ""
    notepad $aiEnv
    Read-Host "  Press ENTER after saving your API key"
}

# Verify the key is set
$envContent = Get-Content $aiEnv -Raw
if ($envContent -match "sk-your-key-here" -or $envContent -notmatch "OPENAI_API_KEY=sk-") {
    Write-Host ""
    Write-Host "  *** WARNING: OPENAI_API_KEY looks unset in ai-service\.env ***" -ForegroundColor Red
    Write-Host "  The AI service will fail to start without a valid key." -ForegroundColor Red
    Write-Host ""
}

Write-Host "  [OK] AI service ready." -ForegroundColor Green

# ---------------------------------------------------------------------------
# 2. Backend — npm install
# ---------------------------------------------------------------------------

Write-Host "[2/3] Setting up backend..." -ForegroundColor Yellow

$backDir = Join-Path $Root "backend"
if (-not (Test-Path (Join-Path $backDir "node_modules"))) {
    Write-Host "      Running npm install (this may take a minute)..." -ForegroundColor DarkGray
    & npm install --prefix $backDir
}

# Create backend .env if missing
$backEnv = Join-Path $backDir ".env"
if (-not (Test-Path $backEnv)) {
    Copy-Item (Join-Path $backDir ".env.example") $backEnv
    Write-Host "      Created backend\.env (defaults are fine for local dev)" -ForegroundColor DarkGray
}

Write-Host "  [OK] Backend ready." -ForegroundColor Green

# ---------------------------------------------------------------------------
# 3. Frontend — npm install
# ---------------------------------------------------------------------------

Write-Host "[3/3] Setting up frontend..." -ForegroundColor Yellow

$feDir = Join-Path $Root "frontend"
if (-not (Test-Path (Join-Path $feDir "node_modules"))) {
    Write-Host "      Running npm install (this may take a minute)..." -ForegroundColor DarkGray
    & npm install --prefix $feDir
}

Write-Host "  [OK] Frontend ready." -ForegroundColor Green

# ---------------------------------------------------------------------------
# 4. Launch all three services in separate windows
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Launching services..." -ForegroundColor Cyan
Write-Host ""

$pyExe  = Join-Path $venv "Scripts\python.exe"
$tsxExe = Join-Path $backDir "node_modules\.bin\tsx.cmd"

# Window 1 — AI Service (FastAPI :8001)
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Write-Host 'AI SERVICE — :8001' -ForegroundColor Cyan; & '$pyExe' '$aiDir\main.py'"
) -WorkingDirectory $aiDir

# Window 2 — Backend (Node + WS :3001)
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Write-Host 'BACKEND — :3001' -ForegroundColor Yellow; & '$tsxExe' watch src/server.ts"
) -WorkingDirectory $backDir

# Window 3 — Frontend (Vite :5173)
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Write-Host 'FRONTEND — :5173' -ForegroundColor Green; npm run dev"
) -WorkingDirectory $feDir

# ---------------------------------------------------------------------------
# 5. Done
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services starting in new windows  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  AI Service  → http://localhost:8001" -ForegroundColor DarkGray
Write-Host "  Backend     → http://localhost:3001  (ws://localhost:3001)" -ForegroundColor DarkGray
Write-Host "  Frontend    → http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "  Open your browser at: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To stop: close the three terminal windows." -ForegroundColor DarkGray
Write-Host ""
