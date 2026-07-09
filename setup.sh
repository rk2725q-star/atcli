#!/bin/bash
# ATCLI macOS / Linux Setup Script
# Usage (one-liner from anywhere):
#   curl -fsSL https://raw.githubusercontent.com/rk2725q-star/atcli/main/setup.sh | bash
# Or after cloning:
#   chmod +x setup.sh && ./setup.sh

set -e

REPO_URL="https://github.com/rk2725q-star/atcli.git"
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "\n${BOLD}${CYAN}  [$1] $2${NC}"; }
ok()    { echo -e "  ${GREEN}✅ $1${NC}"; }
warn()  { echo -e "  ${YELLOW}⚠  $1${NC}"; }
err()   { echo -e "  ${RED}❌ $1${NC}"; exit 1; }

echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║           ATCLI — macOS / Linux Setup                ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Step 1: Check / install Node.js ─────────────────────────────────────────
step 1 "Checking Node.js..."
if ! command -v node &>/dev/null; then
    warn "Node.js not found — installing via nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    # Source nvm for current session
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
    err "Node.js 18+ required. You have $(node -v). Run: nvm install 20"
fi
ok "Node.js $(node -v) — good"

# ── Step 2: Clone if not inside the repo ────────────────────────────────────
step 2 "Checking repo..."
if [ ! -f "package.json" ]; then
    if [ ! -d "atcli" ]; then
        echo "  Cloning atcli repo..."
        git clone "$REPO_URL" atcli
    fi
    cd atcli
fi
ok "Repo ready"

# ── Step 3: npm install ──────────────────────────────────────────────────────
step 3 "Installing dependencies..."
npm install
ok "Dependencies installed"

# ── Step 4: Build TypeScript ─────────────────────────────────────────────────
step 4 "Building TypeScript..."
if [ ! -f "dist/index.js" ]; then
    npm run build
fi
ok "Build complete"

# ── Step 5: npm link ─────────────────────────────────────────────────────────
step 5 "Linking global commands..."
# Try without sudo first; fall back to sudo if permission denied
if npm link 2>/dev/null; then
    ok "atcli / aecl / atcli-mcp linked globally"
else
    warn "Trying with sudo (enter your password if prompted)..."
    sudo npm link
    ok "atcli / aecl / atcli-mcp linked globally (via sudo)"
fi

# ── Step 6: Playwright Chromium ──────────────────────────────────────────────
step 6 "Installing Playwright Chromium..."
npx playwright install chromium
ok "Chromium installed"

# ── Done ─────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║              ✅  Setup Complete!                     ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${BOLD}Start ATCLI:${NC}  atcli"
echo -e "  ${BOLD}Start AECL:${NC}   aecl   (in a second terminal)"
echo ""
echo "  First launch: browser windows open so you can log in to"
echo "  each AI provider once. Sessions are saved locally."
echo ""
echo -e "  GitHub: ${CYAN}https://github.com/rk2725q-star/atcli${NC}"
echo ""
