# ATCLI Windows Setup Script
# Run this in PowerShell (Run as Administrator recommended for npm link)
# Usage: iwr -useb https://raw.githubusercontent.com/rk2725q-star/atcli/main/setup.ps1 | iex
# Or: .\setup.ps1 (after cloning)

$ErrorActionPreference = "Stop"

function Write-Step($n, $msg) { Write-Host "`n  [$n] $msg" -ForegroundColor Cyan -NoNewline; Write-Host "" }
function Write-Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  WRN $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  ERR $msg" -ForegroundColor Red }

Write-Host @"

  ╔══════════════════════════════════════════════════════╗
  ║              ATCLI — Windows Setup                   ║
  ╚══════════════════════════════════════════════════════╝

"@ -ForegroundColor Magenta

# ── Step 1: Check Node.js ────────────────────────────────────────────────────
Write-Step 1 "Checking Node.js..."
$nodeInstalled = $null
try { $nodeInstalled = node --version 2>$null } catch {}

if (-not $nodeInstalled) {
    Write-Warn "Node.js not found. Installing via winget..."
    try {
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements -e
        # Refresh PATH for current session
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
        Write-Ok "Node.js installed. You may need to restart PowerShell if the next step fails."
    } catch {
        Write-Err "winget install failed. Please install Node.js manually from https://nodejs.org"
        Write-Host "  Then re-run this script." -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Ok "Node.js $nodeInstalled found"
}

# Check version is 18+
$major = [int]((node --version) -replace 'v','').Split('.')[0]
if ($major -lt 18) {
    Write-Err "Node.js 18+ required. You have $(node --version). Run: winget upgrade OpenJS.NodeJS.LTS"
    exit 1
}

# ── Step 2: Clone repo if not already cloned ─────────────────────────────────
Write-Step 2 "Checking repo..."
$repoUrl = "https://github.com/rk2725q-star/atcli.git"
if (-not (Test-Path "package.json")) {
    if (-not (Test-Path "atcli")) {
        Write-Host "  Cloning atcli repo..." -ForegroundColor Cyan
        git clone $repoUrl atcli
    }
    Set-Location atcli
    Write-Ok "Repo ready"
} else {
    Write-Ok "Already inside atcli repo"
}

# ── Step 3: npm install ───────────────────────────────────────────────────────
Write-Step 3 "Installing dependencies (npm install)..."
npm install
Write-Ok "Dependencies installed"

# ── Step 4: Build ────────────────────────────────────────────────────────────
Write-Step 4 "Building TypeScript..."
if (-not (Test-Path "dist\index.js")) {
    npm run build
}
Write-Ok "Build complete"

# ── Step 5: npm link ─────────────────────────────────────────────────────────
Write-Step 5 "Linking global commands..."
npm link
Write-Ok "atcli, aecl, atcli-mcp linked globally"

# ── Step 6: Playwright ───────────────────────────────────────────────────────
Write-Step 6 "Installing Playwright Chromium..."
npx playwright install chromium
Write-Ok "Chromium installed"

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host @"

  ╔══════════════════════════════════════════════════════╗
  ║              Setup Complete!                         ║
  ╚══════════════════════════════════════════════════════╝

  Start ATCLI:
    atcli

  Start AECL (in a second terminal):
    aecl

  First launch: browser windows will open for each AI provider
  Log in with your own account once — session is saved locally.

  GitHub: https://github.com/rk2725q-star/atcli

"@ -ForegroundColor Green
