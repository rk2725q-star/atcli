import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ApiKeyStore } from '../providers/api-key-store';
import { NvidiaApiProvider } from '../providers/nvidia';
import { OllamaApiAdapter } from '../providers/ollama';
import { ApiRouter } from '../providers/api-router';
import { execSync, spawnSync } from 'child_process';

export interface AppState {
    currentProvider: string;
    currentModel: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// /setup atcli — Intelligent OS-aware auto-setup
// ─────────────────────────────────────────────────────────────────────────────
function runSetup(): void {
    const isWin = os.platform() === 'win32';
    const isMac = os.platform() === 'darwin';

    const C = {
        reset:   '\x1b[0m',
        bold:    '\x1b[1m',
        green:   '\x1b[32m',
        cyan:    '\x1b[36m',
        yellow:  '\x1b[33m',
        red:     '\x1b[31m',
        blue:    '\x1b[34m',
        magenta: '\x1b[35m',
        dim:     '\x1b[2m',
    };

    const ok    = (msg: string) => console.log(`  ${C.green}✅ ${msg}${C.reset}`);
    const info  = (msg: string) => console.log(`  ${C.cyan}ℹ  ${msg}${C.reset}`);
    const warn  = (msg: string) => console.log(`  ${C.yellow}⚠  ${msg}${C.reset}`);
    const fail  = (msg: string) => console.log(`  ${C.red}❌ ${msg}${C.reset}`);
    const step  = (n: number, msg: string) => console.log(`\n${C.bold}${C.blue}  [${ n }] ${msg}${C.reset}`);
    const title = (msg: string) => console.log(`  ${C.bold}${C.cyan}${msg}${C.reset}`);

    const run = (cmd: string, opts: any = {}): boolean => {
        try {
            execSync(cmd, { stdio: 'inherit', ...opts });
            return true;
        } catch { return false; }
    };

    const runSilent = (cmd: string): string => {
        try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); }
        catch { return ''; }
    };

    // ── Banner ─────────────────────────────────────────────────────────────
    console.log(`
${C.bold}${C.magenta}  ╔══════════════════════════════════════════════════════╗
  ║            ATCLI — Intelligent Setup                 ║
  ║   Auto-detecting OS and installing everything...     ║
  ╚══════════════════════════════════════════════════════╝${C.reset}`);

    const platformLabel = isWin ? 'Windows' : isMac ? 'macOS' : 'Linux';
    info(`Detected OS: ${C.bold}${platformLabel}${C.reset}`);

    // ── Step 1: Node.js check / install ────────────────────────────────────
    step(1, 'Checking Node.js...');
    const nodeVer = runSilent('node --version');
    const nodeMajor = nodeVer ? parseInt(nodeVer.replace('v','').split('.')[0]) : 0;

    if (nodeMajor >= 18) {
        ok(`Node.js ${nodeVer} found — good`);
    } else {
        if (nodeVer) {
            warn(`Node.js ${nodeVer} is too old — need 18+. Installing...`);
        } else {
            warn('Node.js not found — installing automatically...');
        }

        if (isWin) {
            // Windows: try winget first, then chocolatey, then manual
            info('Trying winget install...');
            const winget = run('winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements -e --silent');
            if (winget) {
                ok('Node.js installed via winget');
                warn('⚠  Restart your terminal and run /setup atcli again to continue.');
                return;
            }
            // Try chocolatey
            info('winget failed — trying chocolatey...');
            const choco = run('choco install nodejs-lts -y');
            if (choco) {
                ok('Node.js installed via chocolatey');
                warn('Restart your terminal and run /setup atcli again.');
                return;
            }
            fail('Auto-install failed. Please install Node.js manually:');
            console.log(`  ${C.cyan}→ https://nodejs.org/en/download${C.reset}`);
            return;
        } else if (isMac) {
            // macOS: try homebrew first, then nvm
            info('Trying Homebrew...');
            const brew = run('brew install node@20 2>/dev/null || brew install node 2>/dev/null');
            if (brew) { ok('Node.js installed via Homebrew'); }
            else {
                info('Homebrew failed — installing via nvm...');
                run(`curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash`);
                run(`export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 20`);
                ok('Node.js installed via nvm — restart terminal if next steps fail');
            }
        } else {
            // Linux: try apt, dnf, then nvm
            const apt = runSilent('which apt-get');
            if (apt) {
                info('Installing via apt...');
                run('sudo apt-get update -qq && sudo apt-get install -y nodejs npm');
            } else {
                const dnf = runSilent('which dnf');
                if (dnf) {
                    info('Installing via dnf...');
                    run('sudo dnf install -y nodejs npm');
                } else {
                    info('Installing via nvm...');
                    run(`curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash`);
                }
            }
        }
    }

    // Verify node is now available
    const nodeVerAfter = runSilent('node --version');
    if (!nodeVerAfter) {
        fail('Node.js still not found after install attempt.');
        console.log(`  ${C.yellow}Please install manually: https://nodejs.org then run /setup atcli again.${C.reset}`);
        return;
    }

    // ── Step 2: Locate atcli repo root ─────────────────────────────────────
    step(2, 'Locating atcli repo...');
    // __dirname resolves to dist/cli/ — so go up 2 levels to find repo root
    const atcliRoot = path.resolve(__dirname, '..', '..');
    if (!fs.existsSync(path.join(atcliRoot, 'package.json'))) {
        fail(`Cannot find atcli package.json. Expected at: ${atcliRoot}`);
        return;
    }
    ok(`Repo root: ${atcliRoot}`);

    // ── Step 3: npm install ─────────────────────────────────────────────────
    step(3, 'Installing dependencies (npm install)...');
    const installed = run('npm install', { cwd: atcliRoot });
    if (installed) { ok('Dependencies installed'); }
    else { fail('npm install failed — check your internet connection'); return; }

    // ── Step 4: Build TypeScript ────────────────────────────────────────────
    step(4, 'Building TypeScript → dist/...');
    const distIndex = path.join(atcliRoot, 'dist', 'index.js');
    if (fs.existsSync(distIndex)) {
        ok('Already built (dist/ exists) — skipping');
    } else {
        const built = run('npm run build', { cwd: atcliRoot });
        if (built) { ok('TypeScript build complete'); }
        else { fail('Build failed — run: npm run build to see errors'); return; }
    }

    // ── Step 5: npm link ────────────────────────────────────────────────────
    step(5, `Linking global commands (atcli / aecl / atcli-mcp)...`);
    let linked = run('npm link', { cwd: atcliRoot });
    if (!linked && !isWin) {
        warn('npm link failed — trying with sudo...');
        linked = run('sudo npm link', { cwd: atcliRoot });
    }
    if (linked) { ok('atcli, aecl, atcli-mcp linked globally'); }
    else {
        warn('npm link failed — you can still use: npx atcli from the repo folder');
        if (isWin) warn('Try running PowerShell as Administrator and run: npm link');
    }

    // ── Step 6: Playwright Chromium ─────────────────────────────────────────
    step(6, 'Installing Playwright Chromium (for AI provider sessions)...');
    const pwInstalled = run('npx playwright install chromium', { cwd: atcliRoot });
    if (pwInstalled) { ok('Playwright Chromium installed'); }
    else { warn('Playwright install had issues — run: npx playwright install chromium manually if providers fail'); }

    // ── Done ─────────────────────────────────────────────────────────────────
    console.log(`
${C.bold}${C.green}  ╔══════════════════════════════════════════════════════╗
  ║              ✅  Setup Complete!                     ║
  ╚══════════════════════════════════════════════════════╝${C.reset}

${C.bold}  What to do next:${C.reset}

  ${C.cyan}1. Open a NEW terminal and type:${C.reset}
     ${C.bold}atcli${C.reset}

     First launch — browser windows open for each AI provider.
     Log in once with your own account. Sessions saved locally.

  ${C.cyan}2. Open a SECOND terminal for live error checking:${C.reset}
     ${C.bold}aecl${C.reset}

  ${C.cyan}3. Inside atcli, verify with:${C.reset}
     ${C.bold}/help${C.reset}               — all commands
     ${C.bold}/provider deepseek${C.reset}   — switch provider

  ${C.yellow}  Troubleshooting:${C.reset}
  ${C.dim}  - "atcli not found" → run: npm config get prefix, add bin/ to PATH${C.reset}
  ${C.dim}  - Browser issues → delete browser_profile/ and restart atcli${C.reset}
  ${C.dim}  - Build errors → node -v (needs 18+), then npm run build${C.reset}
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Model list cache — allows /model <number> shortcut after /models listing
// ─────────────────────────────────────────────────────────────────────────────
let _lastModelList: string[] = [];
let _lastLocalModelList: string[] = [];
let _lastModelListSource: 'nvidia' | 'local' | null = null;
let _lastLocalProviderUsed: 'local' | 'ollama' | 'qwen-local' = 'local';

function printModelList(models: string[], currentModel: string): void {
    // Group models by family prefix
    const families: Record<string, string[]> = {};
    const familyOrder = ['meta', 'nvidia', 'mistralai', 'deepseek', 'qwen', 'microsoft', 'google', 'cohere', 'ibm', 'writer', 'other'];

    for (const m of models) {
        const prefix = m.split('/')[0]?.toLowerCase() || 'other';
        const family = familyOrder.includes(prefix) ? prefix : 'other';
        if (!families[family]) families[family] = [];
        families[family].push(m);
    }

    const RECOMMENDED = ['minimaxai/minimax-m3', 'nvidia/llama-3.1-nemotron-70b-instruct', 'deepseek-ai/deepseek-r1'];
    const familyLabels: Record<string, string> = {
        meta: '🦙 Meta Llama', nvidia: '🟢 NVIDIA', mistralai: '🌬  Mistral',
        deepseek: '🔵 DeepSeek', qwen: '🟡 Qwen', microsoft: '🔷 Microsoft',
        google: '🔴 Google', cohere: '⚡ Cohere', ibm: '🔶 IBM', writer: '✍  Writer', other: '📦 Other'
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════╗`);
    console.log(`  ║        NVIDIA NIM — Available Models (${String(models.length).padEnd(3)})              ║`);
    console.log(`  ╚══════════════════════════════════════════════════════════╝`);
    console.log(`  \x1b[2m  ★ = active  |  ⭐ = recommended for free tier  |  # = pick number\x1b[0m\n`);

    // Reset the cache and rebuild it in the EXACT order we print it
    _lastModelList = [];
    _lastModelListSource = 'nvidia';
    let idx = 1;
    
    for (const family of familyOrder) {
        const fModels = families[family];
        if (!fModels || fModels.length === 0) continue;
        console.log(`  \x1b[1m${familyLabels[family] || family}\x1b[0m`);
        for (const m of fModels) {
            _lastModelList.push(m);
            const isActive      = m === currentModel ? ' \x1b[33m★ active\x1b[0m' : '';
            const isRecommended = RECOMMENDED.includes(m) ? ' \x1b[32m⭐\x1b[0m' : '';
            console.log(`  \x1b[2m${String(idx).padStart(4)}.\x1b[0m \x1b[36m${m}\x1b[0m${isActive}${isRecommended}`);
            idx++;
        }
        console.log('');
    }

    console.log(`  \x1b[1mQuick-switch:\x1b[0m`);
    console.log(`    /model <number>                   e.g. /model 3`);
    console.log(`    /model <full-id>                  e.g. /model minimaxai/minimax-m3`);
    console.log(`\n  \x1b[2mCurrent: \x1b[36m${currentModel}\x1b[0m\n`);
}

function printLocalModelList(models: string[], currentModel: string): void {
    _lastModelListSource = 'local';
    console.log(`\n  ╔══════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║         Ollama Local Models (${String(models.length).padEnd(3)})                           ║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════╝`);
    console.log(`  \x1b[2m  ★ = active  |  # = pick number  |  /local pull model_name to download\x1b[0m\n`);

    _lastLocalModelList = [];
    let idx = 1;
    for (const model of models) {
        _lastLocalModelList.push(model);
        const isActive = model === currentModel ? ' \x1b[33m★ active\x1b[0m' : '';
        console.log(`  \x1b[2m${String(idx).padStart(4)}.\x1b[0m \x1b[36m${model}\x1b[0m${isActive}`);
        idx++;
    }

    if (models.length === 0) {
        console.log(`  \x1b[90mNo local models found. Use /local pull model_name to download one.\x1b[0m`);
    }

    console.log(`  \x1b[90mCustom model: type /local use any-ollama-model to try a model name that is not in the list yet.\x1b[0m`);

    console.log(`\n  \x1b[1mQuick-switch:\x1b[0m`);
    console.log(`    /local use model_name             e.g. /local use qwen2.5-coder:3b`);
    console.log(`    /local pull model_name            e.g. /local pull llama3.1:8b`);
    console.log(`    /local custom model_name          alias for /local use model_name`);
    console.log(`    /model <number or id>             works after /local models too`);
    console.log(`\n  \x1b[2mCurrent: \x1b[36m${currentModel}\x1b[0m\n`);
}

export function handleSlashCommand(input: string, state: AppState, router?: any): { handled: boolean, action?: 'manage' | 'upload' | 'agentica' | 'session' | 'file_staged', args?: string } {

    const parts = input.trim().split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    switch (command) {
        // ── /api — Unified API provider management ───────────────────────────────
        case '/api': {
            const apiRouter = ApiRouter.getInstance();

            // /api list  OR  bare /api
            if (!args[0] || args[0].toLowerCase() === 'list') {
                apiRouter.list();
                return { handled: true };
            }

            const sub = args[0].toLowerCase();

            // /api models <provider>  — list models for a provider (Ollama)
            if (sub === 'models') {
                const pId = (args[1] || '').toLowerCase();
                if (pId === 'ollama') {
                    const { OllamaApiRouterProvider } = require('../providers/ollama-router');
                    const prov = new OllamaApiRouterProvider();
                    prov.listModels().then((models: string[]) => {
                        if (models.length === 0) {
                            console.log(`\n  ⚠️  No models found. Make sure Ollama is running: ollama serve`);
                            console.log(`  Pull a model: ollama pull qwen2.5-coder:7b`);
                        } else {
                            console.log(`\n  ╔══════════════════════════════════════════╗`);
                            console.log(`  ║  Ollama Installed Models (${models.length})            ║`);
                            console.log(`  ╚══════════════════════════════════════════╝`);
                            models.forEach((m, i) => console.log(`    ${String(i + 1).padStart(3)}. \x1b[36m${m}\x1b[0m`));
                            console.log(`\n  Switch: /api set-model ollama <model-name>\n`);
                        }
                    }).catch((e: Error) => console.log(`\n  ❌ ${e.message}`));
                } else {
                    console.log(`\n  /api models ollama  — list installed Ollama models`);
                    console.log(`  /api nvidia models  — list NVIDIA NIM models`);
                }
                return { handled: true };
            }

            // /api add <provider> <key>
            if (sub === 'add') {
                const pId = (args[1] || '').toLowerCase();
                const key = args.slice(2).join(' ').replace(/^[<"']|[>"']$/g, '').trim();
                // Ollama: URL can be as short as "localhost:11434" (15 chars) but relax for http://
                const minLen = pId === 'ollama' ? 4 : 8;
                if (!pId || !key || key.length < minLen) {
                    console.log(`\n  Usage: /api add <provider> <key-or-url>`);
                    if (pId === 'ollama') {
                        console.log(`  Example: /api add ollama http://localhost:11434`);
                        console.log(`  Then:    /api set-model ollama qwen2.5-coder:7b`);
                    } else {
                        console.log(`  Example: /api add nvidia nvapi-xxxx`);
                        console.log(`  Run /api list to see all providers.`);
                    }
                    return { handled: true };
                }
                apiRouter.add(pId, key);
                // Also switch provider to nvidia if it was nvidia
                if (pId === 'nvidia') {
                    state.currentProvider = 'nvidia';
                    console.log(`  ✅ Provider switched to: \x1b[36mnvidia\x1b[0m`);
                }
                return { handled: true };
            }

            // /api remove <provider>
            if (sub === 'remove' || sub === 'delete' || sub === 'clear') {
                const pId = (args[1] || '').toLowerCase();
                if (!pId) { console.log(`\n  Usage: /api remove <provider>`); return { handled: true }; }
                apiRouter.remove(pId);
                return { handled: true };
            }

            // /api set-model <provider> <model>
            if (sub === 'set-model' || sub === 'model') {
                const pId = (args[1] || '').toLowerCase();
                const model = args.slice(2).join(' ').trim();
                if (!pId || !model) {
                    console.log(`\n  Usage: /api set-model <provider> <model>`);
                    console.log(`  Example: /api set-model nvidia qwen/qwq-32b`);
                    return { handled: true };
                }
                apiRouter.setProviderModel(pId, model);
                return { handled: true };
            }

            // /api priority <provider> <number>
            if (sub === 'priority') {
                const pId = (args[1] || '').toLowerCase();
                const n = parseInt(args[2] || '');
                if (!pId || isNaN(n)) {
                    console.log(`\n  Usage: /api priority <provider> <number>  (lower = tried first)`);
                    return { handled: true };
                }
                apiRouter.setPriority(pId, n);
                return { handled: true };
            }

            // ── Legacy compatibility: /api nvidia <key>  / /api nvidia models ─────
            const provider  = sub;
            const subAction = (args[1] || '').toLowerCase();
            const keyValue  = args[1] || '';

            if (provider === 'local' || provider === 'ollama' || provider === 'qwen-local') {
                const sub = subAction;
                _lastLocalProviderUsed = provider as 'local' | 'ollama' | 'qwen-local';
                const currentLocalModel = router?.getLocalProvider?.(provider)?.getModel?.() || state.currentModel || 'qwen3-vl:2b';
                if (sub === 'models' || sub === 'list' || sub === 'status' || !sub || (sub === 'model' && args.slice(2).join(' ').trim().length === 0)) {
                    state.currentProvider = provider;
                    state.currentModel = currentLocalModel;
                }

                if (sub === 'models' || sub === 'list' || sub === 'status' || !sub || (sub === 'model' && args.slice(2).join(' ').trim().length === 0)) {
                    console.log(`\n  🔄 Fetching local Ollama models...`);
                    OllamaApiAdapter.fetchInstalledModels().then(models => {
                        printLocalModelList(models, currentLocalModel);
                    }).catch((e: Error) => console.log(`\n  ❌ ${e.message}`));
                    return { handled: true };
                }

                if (sub === 'pull' || sub === 'download') {
                    const modelName = args.slice(2).join(' ').replace(/^<|>$/g, '').trim();
                    if (!modelName) {
                        console.log(`\n  Usage: /local pull model_name`);
                        return { handled: true };
                    }
                    console.log(`\n  ⬇️  Pulling Ollama model: ${modelName}...`);
                    OllamaApiAdapter.pullModel(modelName).then(result => {
                        console.log(`\n  ✅ Pull complete for ${modelName}`);
                        console.log(result.substring(0, 2000));
                        state.currentProvider = provider;
                        state.currentModel = modelName;
                        router?.setLocalModel?.(provider, modelName);
                        return OllamaApiAdapter.fetchInstalledModels();
                    }).then(models => {
                        if (models) {
                            printLocalModelList(models, modelName);
                        }
                    }).catch((e: Error) => console.log(`\n  ❌ ${e.message}`));
                    return { handled: true };
                }

                if (sub === 'use' || sub === 'custom' || sub === 'model') {
                    const modelName = args.slice(2).join(' ').replace(/^<|>$/g, '').trim();
                    if (!modelName) {
                        console.log(`\n  Usage: /local use model_name`);
                        return { handled: true };
                    }
                    state.currentProvider = provider;
                    state.currentModel = modelName;
                    router?.setLocalModel?.(provider, modelName);
                    console.log(`\n  ✅ SUCCESS: ATCLI is now powered by local model \x1b[36m${modelName}\x1b[0m`);
                    console.log(`  🤖 You can now type your tasks directly below.`);
                    return { handled: true };
                }

                console.log(`\n  Supported local actions: models, list, status, use, custom, pull`);
                return { handled: true };
            }

            if (provider === 'nvidia' || provider === 'nvidia2') {
                if (subAction === 'models') {
                    // ── List all available NVIDIA models with grouped numbered picker ──
                    const key = ApiKeyStore.get(provider);
                    if (!key) {
                        console.log(`\n  ❌ No ${provider.toUpperCase()} API key stored. Run: /api ${provider} <your-api-key>`);
                        return { handled: true };
                    }
                    console.log(`\n  🔄 Fetching NVIDIA NIM models from API...`);
                    NvidiaApiProvider.fetchAvailableModels(key).then(models => {
                        const currentModel = router?.getNvidiaProvider?.()?.getModel?.() || 'minimaxai/minimax-m3';
                        printModelList(models, currentModel);
                    }).catch((e: Error) => console.log(`\n  ❌ ${e.message}`));
                    return { handled: true };
                }

                if (subAction === 'clear') {
                    ApiKeyStore.remove(provider);
                    console.log(`\n  ✅ ${provider.toUpperCase()} API key removed.`);
                    return { handled: true };
                }

                if (subAction === 'status') {
                    const key = ApiKeyStore.get(provider);
                    const model = router?.getNvidiaProvider?.()?.getModel?.() || 'minimaxai/minimax-m3';
                    console.log(`\n  🔑 ${provider.toUpperCase()} Status:`);
                    console.log(`     Key:   ${key ? '✅ Stored (****' + key.slice(-6) + ')' : '❌ Not set'}`);
                    console.log(`     Model: \x1b[36m${model}\x1b[0m`);
                    console.log(`     Rate:  40 RPM free tier (sequential queue active)`);
                    console.log(`     Memory: persistent conversation (saved to .atcli-tmp/)`);
                    return { handled: true };
                }

                // ── Store API key or Auto-Switch ───────────────────────────────
                if (!keyValue && ApiKeyStore.get(provider)) {
                    state.currentProvider = 'nvidia'; // Always route to standard nvidia loop
                    console.log(`\n  ✅ Switched to provider: \x1b[36mnvidia\x1b[0m (Using stored ${provider} key)`);
                    return { handled: true };
                }

                if (keyValue && keyValue.length > 10) {
                    const cleanKey = keyValue.replace(/^<|>$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
                    ApiKeyStore.set(provider, cleanKey);
                    if (provider === 'nvidia') {
                        state.currentProvider = 'nvidia';
                    }
                    console.log(`\n  ✅ ${provider.toUpperCase()} API key saved securely (encrypted at ~/.atcli/api_keys.json)`);
                    if (provider === 'nvidia') {
                        console.log(`  ✅ Provider switched to: \x1b[36mnvidia\x1b[0m`);
                        console.log(`  💡 Default model: \x1b[1mminimaxai/minimax-m3\x1b[0m`);
                        console.log(`  💡 See all models: /api nvidia models`);
                        console.log(`  💡 Switch model:   /model <model-id>`);
                    } else {
                        console.log(`  ✅ Secondary fallback key registered.`);
                    }
                } else {
                    console.log(`\n  ❌ Invalid API key. Usage: /api ${provider} nvapi-xxxxxxxxxxxx`);
                    console.log(`  Get a free key at: \x1b[36mhttps://build.nvidia.com\x1b[0m`);
                }
                return { handled: true };
            }

            // ── Generic API key providers (deepseek, etc.) ────────────────
            if (['deepseek', 'deepseek-api'].includes(provider)) {
                if (subAction === 'clear') {
                    ApiKeyStore.remove('deepseek');
                    ApiKeyStore.remove('deepseek-api');
                    console.log(`\n  ✅ DeepSeek API key removed. Restart ATCLI to switch back to browser mode.`);
                    return { handled: true };
                }
                if (subAction === 'status') {
                    const key = ApiKeyStore.get('deepseek') || ApiKeyStore.get('deepseek-api');
                    console.log(`\n  🤖 DeepSeek Status:`);
                    console.log(`     Key:   ${key ? '✅ Stored (****' + key.slice(-6) + ')' : '❌ Not set (using browser mode)'}`);
                    console.log(`     Mode:  ${key ? '⚡ API (api.deepseek.com) — fast & reliable' : '🌐 Browser scraping (slow, error-prone)'}`);
                    console.log(`     Models: deepseek-chat (V3), deepseek-reasoner (R1)`);
                    return { handled: true };
                }
                if (keyValue && keyValue.length > 10) {
                    const cleanKey = keyValue.replace(/^<|>$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
                    ApiKeyStore.set('deepseek', cleanKey);
                    state.currentProvider = 'deepseek';
                    console.log(`\n  ✅ DeepSeek API key saved (encrypted at ~/.atcli/api_keys.json)`);
                    console.log(`  ✅ Provider: \x1b[36mdeepseek\x1b[0m — now using API mode (no browser needed)`);
                    console.log(`  💡 Restart ATCLI for API adapter to activate, or type: deepseek`);
                    console.log(`  💡 Switch to R1 reasoning: /model deepseek-reasoner`);
                    console.log(`  💡 Get key at: \x1b[36mhttps://platform.deepseek.com/api-keys\x1b[0m`);
                } else {
                    console.log(`\n  ❌ Invalid key. Usage: /api deepseek sk-xxxxxxxxxxxx`);
                    console.log(`  Get a free key at: \x1b[36mhttps://platform.deepseek.com/api-keys\x1b[0m`);
                }
                return { handled: true };
            }

            // Fallback: show the new /api list
            console.log(`\n  ❓ Unknown sub-command '${provider}'. Showing /api status:`);
            apiRouter.list();
            return { handled: true };
        }
        // ── /models — list models for current API provider ──────────────────────
        case '/models': {
            if (state.currentProvider === 'nvidia') {
                const key = ApiKeyStore.get('nvidia');
                if (!key) {
                    console.log(`\n  ❌ No NVIDIA API key. Run: /api nvidia <your-api-key>`);
                    return { handled: true };
                }
                console.log(`\n  🔄 Fetching NVIDIA NIM models...`);
                NvidiaApiProvider.fetchAvailableModels(key).then(models => {
                    const currentModel = router?.getNvidiaProvider?.()?.getModel?.() || 'minimaxai/minimax-m3';
                    printModelList(models, currentModel);
                }).catch((e: Error) => console.log(`  ❌ ${e.message}`));
            } else if (['local', 'ollama', 'qwen-local'].includes(state.currentProvider)) {
                OllamaApiAdapter.fetchInstalledModels().then(models => {
                    const currentModel = router?.getLocalProvider?.(state.currentProvider)?.getModel?.() || state.currentModel;
                    printLocalModelList(models, currentModel);
                }).catch((e: Error) => console.log(`  ❌ ${e.message}`));
            } else {
                console.log(`\n  ℹ  /models is supported for API providers (nvidia).`);
                console.log(`  Current provider '${state.currentProvider}' uses browser sessions — no model list needed.`);
            }
            return { handled: true };
        }

        // ── /setup atcli ─────────────────────────────────────────────────────
        case '/local':
            return handleSlashCommand(`/api local ${args.join(' ')}`.trim(), state, router);

        case '/setup':
            if (args[0]?.toLowerCase() === 'atcli' || args.length === 0) {
                runSetup();
            } else {
                console.log(`\n  Usage: /setup atcli\n  Automatically installs Node.js (if needed), builds, links, and sets up Playwright.`);
            }
            return { handled: true };

        case '/agentica':
            return { handled: true, action: 'agentica', args: args.length > 0 ? args.join(' ') : 'Activate OpenClaw continuous autonomous mode and execute tasks.' };

        case '/upload':
            return { handled: true, action: 'upload', args: args.length > 0 ? args.join(' ') : 'Analyze the uploaded file(s).' };
            
        case '/session':
            return { handled: true, action: 'session' };

            
        case '/audit':
            return { handled: true, action: 'manage', args: args.length > 0 ? args.join(' ') : 'Perform a full deep architectural and bug audit on the entire codebase using all your available auditing skills.' };

        case '/loop': {
            // Manual Loop Engineering trigger
            const loopUrl = args[0] || 'http://localhost:3000';
            const projectCtx = args.slice(1).join(' ') || 'Web application';
            console.log(`\n🔁 [LOOP ENGINEER] Starting manual visual review loop on: ${loopUrl}`);
            import('../agent/loop_engineer').then(async ({ runLoopEngineerRound, formatLoopEngineerInjection, resetLoopEngineer }) => {
                resetLoopEngineer();
                const result = await runLoopEngineerRound(loopUrl, projectCtx);
                if (result) {
                    console.log(formatLoopEngineerInjection(result));
                }
            }).catch((e: any) => console.log(`\n❌ Loop engineer error: ${e.message}`));
            return { handled: true };
        }

        case '/file': {
            // ── FILE UPLOAD BRIDGE ────────────────────────────────────────────
            // Reads one or more local files and stages them for the next AI message.
            // Usage: /file src/App.tsx
            //        /file src/App.tsx src/api.ts src/types.ts
            if (args.length === 0) {
                console.log(`\n❌ Usage: /file <path> [path2] [path3]`);
                console.log(`   Example: /file src/App.tsx`);
                console.log(`   Example: /file src/App.tsx src/api.ts`);
                return { handled: true };
            }
            const fileBuffers: string[] = [];
            let totalLines = 0;
            for (const filePath of args) {
                const absPath = path.resolve(process.cwd(), filePath);
                if (!fs.existsSync(absPath)) {
                    console.log(`\n⚠️  File not found: ${filePath}`);
                    continue;
                }
                const content = fs.readFileSync(absPath, 'utf-8');
                const lines = content.split('\n');
                totalLines += lines.length;
                const lang = path.extname(filePath).replace('.', '') || 'text';
                fileBuffers.push(`--- FILE: ${filePath} (${lines.length} lines) ---\n\`\`\`${lang}\n${content}\n\`\`\``);
                console.log(`\n✅ Loaded: ${filePath} (${lines.length} lines)`);
            }
            if (fileBuffers.length === 0) {
                return { handled: true };
            }
            // Stage file content in global for next run
            (global as any).__atcli_staged_files = fileBuffers.join('\n\n');
            console.log(`\n📎 ${fileBuffers.length} file(s) staged (${totalLines} total lines). Type your instruction and press ENTER to send.\n`);
            return { handled: true, action: 'file_staged' };
        }

        case '/paste': {
            // ── PASTE BRIDGE ─────────────────────────────────────────────────
            // Opens multi-line input mode — user pastes code/config, Ctrl+D submits.
            // Perfect for pasting error logs, API responses, or code snippets.
            console.log(`\n📋 [PASTE MODE] Paste your content below.`);
            console.log(`   Press \x1b[1mCtrl+D\x1b[0m (Linux/Mac) or \x1b[1mCtrl+Z then Enter\x1b[0m (Windows) to finish.\n`);
            
            // Collect multi-line input via stdin
            const chunks: string[] = [];
            process.stdin.setEncoding('utf-8');
            process.stdin.resume();
            process.stdin.on('data', (chunk: string) => chunks.push(chunk));
            process.stdin.once('end', () => {
                const pastedContent = chunks.join('');
                if (pastedContent.trim().length === 0) {
                    console.log(`\n⚠️  Nothing pasted. Cancelling.`);
                    process.stdin.pause();
                    return;
                }
                const lineCount = pastedContent.split('\n').length;
                (global as any).__atcli_staged_files = `--- PASTED CONTENT (${lineCount} lines) ---\n${pastedContent}`;
                console.log(`\n✅ Content captured (${lineCount} lines). Type your instruction and press ENTER to send.\n`);
                process.stdin.pause();
            });
            return { handled: true };
        }


        case '/manage':
        case '/review':
            if (args.length === 0) {
                console.log(`\n❌ Error: Please provide a task for the Tech Lead (e.g. /manage review the latest changes)`);
                return { handled: true };
            }
            return { handled: true, action: 'manage', args: args.join(' ') };

        case '/provider':
            if (args.length > 0) {
                state.currentProvider = args[0];
                if (['local', 'ollama', 'qwen-local'].includes(state.currentProvider)) {
                    state.currentModel = router?.getLocalProvider?.(state.currentProvider)?.getModel?.() || state.currentModel || 'qwen3-vl:2b';
                }
                console.log(`\n✅ Provider switched to: ${state.currentProvider}`);
            } else {
                console.log(`\nℹ️ Current provider is: ${state.currentProvider}`);
            }
            return { handled: true };
        
        case '/model':
            if (args.length > 0) {
                let modelArg = args[0].replace(/^<|>$/g, '').trim();

                // Support /model <number> — pick from last /models listing
                const numPick = parseInt(modelArg);
                const activeList = ['local', 'ollama', 'qwen-local'].includes(state.currentProvider) ? _lastLocalModelList : _lastModelList;
                if (!isNaN(numPick) && numPick > 0 && activeList.length > 0) {
                    if (numPick <= activeList.length) {
                        modelArg = activeList[numPick - 1];
                        console.log(`\n  Picked #${numPick}: \x1b[36m${modelArg}\x1b[0m`);
                    } else {
                        console.log(`\n  ❌ Number ${numPick} out of range (1–${activeList.length}). Run /models first.`);
                        return { handled: true };
                    }
                }

                state.currentModel = modelArg;
                // If on nvidia provider, also update the provider's model live
                if (state.currentProvider === 'nvidia' && router) {
                    router.setNvidiaModel(modelArg);
                    console.log(`\n  ✅ NVIDIA model → \x1b[36m${modelArg}\x1b[0m`);
                    console.log(`  \x1b[2m  Sequential queue active — 1 request at a time (40 RPM safe)\x1b[0m`);
                } else if (['local', 'ollama', 'qwen-local'].includes(state.currentProvider) && router) {
                    router.setLocalModel(state.currentProvider, modelArg);
                    console.log(`\n  ✅ SUCCESS: ATCLI is now powered by local model \x1b[36m${modelArg}\x1b[0m`);
                    console.log(`  🤖 You can now type your tasks directly below.`);
                } else {
                    console.log(`\n✅ Model switched to: ${state.currentModel}`);
                }
            } else {
                if (state.currentProvider === 'nvidia' && router) {
                    const m = router.getNvidiaProvider().getModel();
                    console.log(`\n  \x1b[36m★ Active NVIDIA model:\x1b[0m \x1b[1m${m}\x1b[0m`);
                    console.log(`  \x1b[2m  /models to browse all  |  /model <number or id> to switch\x1b[0m`);
                } else if (['local', 'ollama', 'qwen-local'].includes(state.currentProvider) && router) {
                    const m = router.getLocalProvider(state.currentProvider)?.getModel?.() || state.currentModel;
                    console.log(`\n  \x1b[36m★ Active local model:\x1b[0m \x1b[1m${m}\x1b[0m`);
                    console.log(`  \x1b[2m  /local models to browse installed Ollama models  |  /local pull model_name to download\x1b[0m`);
                } else {
                    console.log(`\nℹ️ Current model is: ${state.currentModel}`);
                }
            }
            return { handled: true };

            
        case '/rename':
            if (args.length < 3) {
                console.log(`\n❌ Error: Usage: /rename <file_path> <old_string> <new_string>`);
                console.log(`Example: /rename src/algo.js Var_A accountBalance`);
                return { handled: true };
            }
            try {
                const targetFile = args[0];
                const oldStr = args[1];
                const newStr = args[2];
                const filePath = path.resolve(process.cwd(), targetFile);
                
                if (!fs.existsSync(filePath)) {
                    console.log(`\n❌ Error: File not found: ${filePath}`);
                    return { handled: true };
                }
                
                let content = fs.readFileSync(filePath, 'utf-8');
                if (!content.includes(oldStr)) {
                    console.log(`\n⚠️ Warning: '${oldStr}' not found in ${targetFile}`);
                    return { handled: true };
                }
                
                const regex = new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                content = content.replace(regex, newStr);
                fs.writeFileSync(filePath, content, 'utf-8');
                console.log(`\n✅ Success: Renamed all occurrences of '${oldStr}' to '${newStr}' in ${targetFile}`);
                console.log(`🔒 The AI provider has NO knowledge of this rename operation.`);
            } catch (err: any) {
                console.log(`\n❌ Error renaming: ${err.message}`);
            }
            return { handled: true };
            
        case '/exit':
            console.log('\nExiting ATCLI. Goodbye!');
            process.exit(0);
            return { handled: true };
            
        case '/help':
            console.log('\nAvailable commands:');
            console.log('  /setup atcli               - Auto-install Node.js, build, link — full setup in one command');
            console.log('  /api list                  - Show all API providers: status, model, RPM (run this first!)');
            console.log('  /api add <provider> <key>  - Register a provider key (nvidia, groq, openrouter, gemini-api, mistral, deepseek-api)');
            console.log('  /api remove <provider>     - Remove a provider key');
            console.log('  /api set-model <p> <model> - Change default model for a provider');
            console.log('  /api priority <p> <n>      - Set failover priority (1=first tried)');
            console.log('  /api nvidia models         - List all available NVIDIA NIM models dynamically');
            console.log('  /api nvidia status         - Show key status, current model, rate limit info');
            console.log('  /models               - List models for current API provider');
            console.log('  /provider <name>      - Switch AI provider: deepseek, chatgpt, gemini, qwen, kimi, zai, ollama, local, nvidia');
            console.log('  /local models         - List installed Ollama models');
            console.log('  /local use <model>    - Switch to a local Ollama model');
            console.log('  /local pull <model>   - Download a local Ollama model');
            console.log('  /model <name>         - Switch model (nvidia: applies live; others: sent to browser session)');
            console.log('  /rename <file> <old> <new> - Locally rename variables to protect IP from the AI');
            console.log('  /manage <task>   - Spawn the Tech Lead Agent to manage/review code');
            console.log('  /review <task>   - Alias for /manage');
            console.log('  /agentica <task> - Enter OpenClaw autonomous continuous execution mode (Whole PC + Browser Control)');
            console.log('  /upload <prompt> - Pause terminal so you can manually upload an image in the browser');
            console.log('  /session         - Pause terminal so you can manually select a past chat history to resume');
            console.log('  /audit           - Perform a full codebase scaling and bug audit');
            console.log('  /loop [url]      - 🔁 Loop Engineering: screenshot → vision review → inject bugs → repeat');
            console.log('  /file <path>     - 📎 Stage file(s) and inject into next AI message (multi-file supported)');
            console.log('  /paste           - 📋 Open paste mode — paste code/errors/logs, then type your instruction');
            console.log('  /exit            - Exit ATCLI');
            console.log('  /help            - Show this help message');
            console.log('');
            console.log('\x1b[36m\x1b[1m⚡ UNIVERSAL INTERCEPTOR:\x1b[0m');
            console.log('\x1b[90m  Type an Ollama model name directly to connect:  qwen2.5-coder:3b\x1b[0m');
            console.log('\x1b[90m  Type opencode, aider, or other CLI tools to bridge them through ATCLI.\x1b[0m');
            console.log('');
            console.log('\x1b[36m\x1b[1m🔍 AECL — Auto Error Checker Live:\x1b[0m');
            console.log('\x1b[90m  AECL is a separate command that shows live TypeScript/JS errors');
            console.log('  as the AI writes code — like VSCode\'s Problems panel, but in your terminal.\x1b[0m');
            console.log('');
            console.log('\x1b[97m  HOW TO USE:\x1b[0m');
            console.log('\x1b[90m  1. Open a SECOND terminal window (split terminal recommended)\x1b[0m');
            console.log('\x1b[36m     > aecl\x1b[0m');
            console.log('\x1b[90m  2. In THIS terminal, ask ATCLI to build a project as normal.\x1b[0m');
            console.log('\x1b[90m  3. Every 5 files the AI writes, AECL auto-checks for errors and updates the panel!\x1b[0m');
            console.log('');
            console.log('\x1b[90m  AECL memory is stored as .aecl_memory.json in your current project folder.\x1b[0m');
            console.log('\x1b[90m  Each project folder gets its own error history. ✅\x1b[0m');
            return { handled: true };
            
        default:
            console.log(`\n❌ Unknown command: ${command}. Type /help for available commands.`);
            return { handled: true };
    }
}
