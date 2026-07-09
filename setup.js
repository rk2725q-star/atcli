#!/usr/bin/env node
/**
 * ATCLI One-Command Setup Script
 * ────────────────────────────────
 * Works on Windows, macOS, Linux.
 * Run: node setup.js
 *
 * What it does:
 *  1. Checks Node.js version (18+ required)
 *  2. Installs npm dependencies
 *  3. Builds TypeScript → dist/
 *  4. npm link (makes atcli / aecl available globally)
 *  5. Installs Playwright browsers (Chromium)
 *  6. Prints next steps
 */

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
    reset : '\x1b[0m',
    bold  : '\x1b[1m',
    green : '\x1b[32m',
    cyan  : '\x1b[36m',
    yellow: '\x1b[33m',
    red   : '\x1b[31m',
    blue  : '\x1b[34m',
    magenta: '\x1b[35m',
};
const ok   = (msg) => console.log(`${C.green}  ✅ ${msg}${C.reset}`);
const info = (msg) => console.log(`${C.cyan}  ℹ  ${msg}${C.reset}`);
const warn = (msg) => console.log(`${C.yellow}  ⚠  ${msg}${C.reset}`);
const err  = (msg) => console.log(`${C.red}  ❌ ${msg}${C.reset}`);
const step = (n, msg) => console.log(`\n${C.bold}${C.blue}  [${n}] ${msg}${C.reset}`);
const run  = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`
${C.bold}${C.magenta}
  ╔══════════════════════════════════════════════════════╗
  ║              ATCLI — One-Command Setup               ║
  ║     Multi-provider AI CLI + AECL Error Dashboard     ║
  ╚══════════════════════════════════════════════════════╝
${C.reset}`);

// ── Step 1: Check Node.js version ────────────────────────────────────────────
step(1, 'Checking Node.js version...');
const nodeVer = process.versions.node.split('.').map(Number);
if (nodeVer[0] < 18) {
    err(`Node.js 18+ is required. You have v${process.versions.node}`);
    console.log(`\n  Download from: ${C.cyan}https://nodejs.org${C.reset}`);
    console.log(`  Or use nvm:     ${C.cyan}nvm install 20${C.reset}\n`);
    process.exit(1);
}
ok(`Node.js v${process.versions.node} — good`);

// ── Step 2: npm install ───────────────────────────────────────────────────────
step(2, 'Installing npm dependencies...');
try {
    run('npm install');
    ok('npm install complete');
} catch (e) {
    err('npm install failed — check your internet connection and try again');
    process.exit(1);
}

// ── Step 3: Build TypeScript ──────────────────────────────────────────────────
step(3, 'Building TypeScript → dist/...');
// 'prepare' script already runs build, but run explicitly to catch errors
if (!fs.existsSync(path.join(__dirname, 'dist', 'index.js'))) {
    try {
        run('npm run build');
        ok('TypeScript build complete');
    } catch (e) {
        err('TypeScript build failed. Run "npm run build" to see full errors.');
        process.exit(1);
    }
} else {
    ok('TypeScript already built (dist/ exists)');
}

// ── Step 4: npm link ─────────────────────────────────────────────────────────
step(4, 'Linking global commands (atcli / aecl / atcli-mcp)...');
try {
    run('npm link');
    ok('Global commands linked');
} catch (e) {
    warn('npm link failed — you may need to run with sudo on macOS/Linux:');
    warn('  sudo npm link');
    warn('Or add npm global bin to PATH (see troubleshooting in README)');
}

// ── Step 5: Playwright Chromium ───────────────────────────────────────────────
step(5, 'Installing Playwright Chromium browser (for AI provider sessions)...');
try {
    // Only install chromium — we don't need firefox/webkit
    run('npx playwright install chromium');
    ok('Playwright Chromium installed');
} catch (e) {
    warn('Playwright install had issues — atcli may still work if Chromium is already on the system');
    warn('If providers fail, run: npx playwright install chromium');
}

// ── Done ──────────────────────────────────────────────────────────────────────
const isWin = os.platform() === 'win32';
console.log(`
${C.bold}${C.green}
  ╔══════════════════════════════════════════════════════╗
  ║               ✅  Setup Complete!                    ║
  ╚══════════════════════════════════════════════════════╝
${C.reset}
${C.bold}  Next steps:${C.reset}

  ${C.cyan}1. Start ATCLI (main agent):${C.reset}
     ${C.bold}atcli${C.reset}

     On first launch, browser windows open for each AI provider
     so you can log in with your own account (DeepSeek / ChatGPT /
     Gemini etc.). This is a one-time step per machine.

  ${C.cyan}2. Start AECL (live error dashboard) in a second terminal:${C.reset}
     ${C.bold}aecl${C.reset}

     AECL watches your project files and shows TypeScript/JS errors
     live — like VS Code Problems panel but in the terminal.

  ${C.cyan}3. Verify everything works inside atcli:${C.reset}
     ${C.bold}/help${C.reset}               — show all commands
     ${C.bold}/provider deepseek${C.reset}   — switch AI provider

  ${C.cyan}4. (Optional) Offline/local AI via Ollama:${C.reset}
     Install Ollama from ${C.cyan}https://ollama.com${C.reset}
     Then: ${C.bold}ollama pull qwen3-vl:2b${C.reset}
     And in atcli: ${C.bold}/provider ollama${C.reset}

  ${C.yellow}Troubleshooting:${C.reset}
  - "atcli not found" → run: ${C.bold}npm config get prefix${C.reset} and add that bin/ to PATH
  - Provider window issue → delete ${C.bold}browser_profile/${C.reset} and restart atcli
  - Build errors → run: ${C.bold}node -v${C.reset} (must be 18+), then ${C.bold}npm run build${C.reset}

  ${C.bold}GitHub:${C.reset} https://github.com/rk2725q-star/atcli
`);
