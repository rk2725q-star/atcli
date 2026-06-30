import * as readline from 'readline';
import { handleSlashCommand } from './commands';
import { PromptRouter } from '../broker/router';
import { AgentLoop } from '../agent/loop';
import { BrowserManager } from '../browser/manager';
import * as fs from 'fs';
import * as path from 'path';

// ────────────────────────────────────────────────────────────────────────
// PROJECT ROOT DETECTION
// Detects the currently open IDE workspace folder as the safe zone for
// ALL file deletions. AI cannot delete anything outside this boundary.
// Priority: VSCODE_CWD env var (set by VSCode/Cursor/Antigravity) > .git walk-up > process.cwd()
// ────────────────────────────────────────────────────────────────────────
function detectProjectRoot(): { root: string; method: string } {
    // 1. VSCode / Cursor / Antigravity IDE integrated terminal sets VSCODE_CWD
    //    to the workspace folder that is OPEN in the IDE — most reliable source
    const vscodeCwd = process.env.VSCODE_CWD;
    if (vscodeCwd && fs.existsSync(vscodeCwd)) {
        return { root: path.normalize(vscodeCwd), method: 'IDE workspace (VSCODE_CWD)' };
    }

    // Helper: check if a directory is atcli's OWN source package (to skip it)
    function isAtcliOwnPackage(dir: string): boolean {
        try {
            const pkgPath = path.join(dir, 'package.json');
            if (!fs.existsSync(pkgPath)) return false;
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            // Skip if this is the atcli-core package itself
            return pkg.name === 'atcli-core' || pkg.name === 'atcli';
        } catch { return false; }
    }

    // 2. Walk UP from process.cwd() looking for project root markers
    //    Skip the atcli-core package folder itself so we don't save files there
    const markers = ['.git', '.vscode', 'tsconfig.json',
                     'pyproject.toml', 'Cargo.toml', 'go.mod', '.agents', '.atcli'];
    // Also check package.json but NOT if it's atcli's own package
    let dir = process.cwd();
    const filesystemRoot = path.parse(dir).root;
    while (dir !== filesystemRoot) {
        for (const marker of markers) {
            if (fs.existsSync(path.join(dir, marker))) {
                // Extra check: if the detected root is atcli's own src, skip it
                if (isAtcliOwnPackage(dir)) break;
                return { root: dir, method: `project root (found ${marker})` };
            }
        }
        // Also check package.json separately with atcli exclusion
        if (fs.existsSync(path.join(dir, 'package.json')) && !isAtcliOwnPackage(dir)) {
            return { root: dir, method: 'project root (found package.json)' };
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    // 3. Fallback to process.cwd() — but warn if it's the atcli package itself
    const cwd = process.cwd();
    if (isAtcliOwnPackage(cwd)) {
        // Running atcli from its own source folder — use Desktop as safe output
        const desktopPath = path.join(require('os').homedir(), 'Desktop');
        const desktopExists = fs.existsSync(desktopPath);
        const fallback = desktopExists ? desktopPath : require('os').homedir();
        return { root: fallback, method: 'Desktop (run atcli from your project folder for best results)' };
    }
    return { root: cwd, method: 'terminal cwd (fallback)' };
}

interface AppState {
    currentProvider: string;
    currentModel: string;
}

const router = new PromptRouter();
const initializedProviders = new Map<string, 'vibecoding' | 'agentica'>();

// ── AGENTICA SESSION STATE ──────────────────────────────────────────────────
// Tracks whether a persistent Agentica browser session is alive for a provider.
// Once started, /agentica calls REUSE the same chat — no browser reset needed.
const agenticaSessions = new Map<string, boolean>(); // provider → hasOpenSession
let agenticaRunning = false; // true ONLY while a task is actively executing

// ── Shared Secret Masking Utility (single source of truth) ─────────────────
const SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9_-]{20,}/g,
    /sk_(live|test)_[a-zA-Z0-9_-]+/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /AKIA[0-9A-Z]{16}/g,
    /(?:api\s*key|token|secret|password)\s*[:=]\s*['"]?[a-zA-Z0-9_\-\.]{10,}['"]?/gi
];

function maskSecrets(input: string): { masked: string; changed: boolean } {
    let masked = input;
    let changed = false;
    for (const regex of SECRET_PATTERNS) {
        regex.lastIndex = 0; // Reset stateful regex
        if (regex.test(masked)) {
            regex.lastIndex = 0;
            masked = masked.replace(regex, '[REDACTED_LOCAL_SECRET]');
            changed = true;
        }
    }
    return { masked, changed };
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

(global as any).pauseRepl = () => {
    rl.pause();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
};
(global as any).resumeRepl = () => {
    rl.resume();
};
(global as any).askQuestion = (query: string): Promise<string> => {
    return new Promise(resolve => {
        rl.question(query, resolve);
    });
};

let sigintCount = 0;
rl.on('SIGINT', async () => {
    sigintCount++;
    if (sigintCount >= 2) {
        console.log('\n[ATCLI] Exiting ATCLI... Bye! 👋');
        try {
            await BrowserManager.getInstance().closeAll();
        } catch (e) {}
        process.exit(0);
    }
    console.log('\n[ATCLI] User interrupted. Press Ctrl+C again to exit, or continue typing.');
    
    // Reset the count after 3 seconds so they have to be consecutive
    setTimeout(() => { sigintCount = 0; }, 3000);
});

const state: AppState = {
    currentProvider: 'deepseek',
    currentModel: 'default'
};

export async function startRepl() {
    // ── DETECT PROJECT ROOT (safe zone) BEFORE ANYTHING ELSE ─────────────────
    const { root: projectRoot, method: rootMethod } = detectProjectRoot();
    (global as any).atcli_project_root = projectRoot;
    // ──────────────────────────────────────────────────────────────────

    console.log(`\n🚀 ATCLI Started!`);
    
    // HARDCODED STARTUP HEALTH CHECK (Tamper Protection)
    try {
        const promptsPath = path.join(__dirname, '../agent/prompts.js');
        const promptsTsPath = path.join(__dirname, '../agent/prompts.ts');
        const promptsContent = fs.existsSync(promptsPath) ? fs.readFileSync(promptsPath, 'utf-8') : fs.readFileSync(promptsTsPath, 'utf-8');
        if (promptsContent.length < 500 || !promptsContent.includes('OS PROTECTION')) {
            console.log(`\n❌ [CRITICAL ERROR] Security Prompt is corrupted or missing! The system cannot start safely.`);
            console.log(`❌ Please restore src/agent/prompts.ts before running ATCLI.`);
            process.exit(1);
        }
    } catch (err) {
        console.log(`\n❌ [CRITICAL ERROR] Failed to verify system prompt integrity! ${err}`);
        process.exit(1);
    }
    
    console.log(`Provider: ${state.currentProvider} | Type /help for commands`);
    // Show detected safe zone prominently so user always knows what's protected
    console.log(`\n\x1b[32m🔒 [Safe Zone] \x1b[1m${projectRoot}\x1b[0m\x1b[32m (detected via ${rootMethod})\x1b[0m`);
    console.log(`\x1b[90m   AI cannot delete or modify any files outside this folder.\x1b[0m`);
    console.log(`\n\x1b[36m\x1b[1m💡 TIP:\x1b[0m\x1b[36m Open a 2nd terminal and run \x1b[1maecl\x1b[0m\x1b[36m to see live TypeScript errors as AI writes code!\x1b[0m`);
    console.log(`\x1b[90m   AECL = Auto Error Checker Live — your IDE-style Problems panel for ATCLI.\x1b[0m\n`);


    const promptLoop = () => {
        rl.question(`atcli (${state.currentProvider}) > `, async (input: string) => {
            const trimmed = input.trim();
            
            if (trimmed.length === 0) {
                promptLoop();
                return;
            }

            if (trimmed.startsWith('/')) {
                const result = handleSlashCommand(trimmed, state);
                if (result.action === 'manage' && result.args) {
                    console.log(`\n[ATCLI] Spawning Tech Lead Manager on ${state.currentProvider}...`);
                    try {
                        const adapter = router.getAdapter(state.currentProvider);
                        if (!adapter) {
                            console.log(`❌ Error: Provider '${state.currentProvider}' not found.`);
                        } else {
                            const { ManagerLoop } = require('../agent/manager');
                            const manager = new ManagerLoop(adapter, true);
                            await manager.run(result.args);
                        }
                    } catch (error: any) {
                        console.log(`\n❌ Error: ${error.message}`);
                    }
                } else if (result.action === 'upload') {
                    console.log(`\n[ATCLI] 🖼️  Vision Mode Initiated!`);
                    try {
                        const adapter = router.getAdapter(state.currentProvider);
                        if (!adapter) {
                            console.log(`❌ Error: Provider '${state.currentProvider}' not found.`);
                            promptLoop();
                            return;
                        }
                        
                        console.log(`[ATCLI] 🌐 Opening browser to ${state.currentProvider}...`);
                        await adapter.init(); // Opens the browser so the user can upload!
                        
                        console.log(`[ATCLI] ✅ Browser is ready! Please manually upload your files/images in the chat box, and DO NOT hit send.`);
                        rl.question(`[ATCLI] Type your instruction for this image (or just press ENTER to analyze): `, async (userPrompt) => {
                            console.log(`\n[ATCLI] Sending prompt along with your uploaded files to ${state.currentProvider}...`);
                            
                            const finalPrompt = userPrompt.trim().length > 0 ? userPrompt : "Analyze the uploaded file(s).";
                            const prepPrompt = `[SYSTEM: The user has manually uploaded an image/document. You must use this file to build a website or app at the level of Antigravity or Claude Code. You have full agentic capabilities to write, read, fix, and run terminal commands. Analyze the file and execute the following user request:]\n\n${finalPrompt}`;

                            try {
                                // Vision mode also blocked only if agentica is currently running
                                if (agenticaRunning) {
                                    console.log(`\n❌ [BUSY] Agentica is currently executing. Wait for it to finish.`);
                                    promptLoop();
                                    return;
                                }
                                const isFirst = !initializedProviders.has(state.currentProvider);
                                const agent = new AgentLoop(adapter, isFirst);
                                await agent.run(prepPrompt);
                                initializedProviders.set(state.currentProvider, 'vibecoding');
                            } catch (error: any) {
                                console.log(`\n❌ Error: ${error.message}`);
                            }
                            promptLoop();
                        });
                        return; // Prevent the default promptLoop()
                    } catch (error: any) {
                        console.log(`\n❌ Error opening browser: ${error.message}`);
                        promptLoop();
                        return;
                    }
                } else if (result.action === 'agentica') {
                    console.log(`\n[ATCLI] 🤖 ENTERING OPENCLAW CONTINUOUS MODE! PC & BROWSER CONTROL ENABLED.`);
                    
                    // 🚨 CHATGPT AGENTICA BLOCK & AUTO-SWITCH PROTOCOL
                    if (state.currentProvider === 'chatgpt') {
                        console.log(`\n⚠️  [SECURITY BLOCK] ChatGPT does not perform well in Agentica mode. ChatGPT is blocked for Agentica (only allowed for Vibecoding).`);
                        console.log(`⚠️  Auto-switching from 'chatgpt' to 'qwen' as the default Agentica provider.`);
                        state.currentProvider = 'qwen';
                    }

                    try {
                        const adapter = router.getAdapter(state.currentProvider);
                        if (!adapter) {
                            console.log(`❌ Error: Provider '${state.currentProvider}' not found.`);
                        } else {
                            // ── SESSION MANAGEMENT ─────────────────────────────────────────────
                            // FIRST call → open fresh browser chat (isFirstForProvider = true)
                            // SUBSEQUENT calls → reuse the SAME chat session (isFirstForProvider = false)
                            // Never reset the browser between tasks in the same session!
                            const hasSession = agenticaSessions.get(state.currentProvider) === true;
                            const isFirstForProvider = !hasSession;

                            if (isFirstForProvider) {
                                console.log(`\n🌐 [Agentica] Starting fresh browser session for ${state.currentProvider}...`);
                            } else {
                                console.log(`\n♻️  [Agentica] Reusing existing session — sending next task in same chat...`);
                            }

                            // 🛡️ LOCAL INPUT INTERCEPTOR (SECRET SCANNER)
                            const { masked: safeArgs, changed: secretMasked } = maskSecrets(result.args || '');
                            if (secretMasked) {
                                console.log(`\n⚠️  [ATCLI SHIELD] Sensitive API Key detected in your Agentica request!`);
                                console.log(`⚠️  It has been LOCALLY MASKED before sending to the Cloud AI.`);
                            }

                            const continuousPrompt = `[AGENTICA OPENCLAW MODE: You are now running in continuous autonomous mode with full PC and browser control capabilities. Execute the following task continuously without stopping for user confirmation until the goal is 100% achieved:]\n\n${safeArgs}`;

                            const agent = new AgentLoop(adapter, isFirstForProvider);
                            (agent as any).isAgenticaMode = true;

                            agenticaRunning = true;
                            await agent.run(continuousPrompt);
                            agenticaRunning = false;

                            // Mark session as open — next /agentica will reuse this chat
                            agenticaSessions.set(state.currentProvider, true);
                            initializedProviders.set(state.currentProvider, 'agentica');
                            console.log(`\n✅ [Agentica] Task complete. Type /agentica <next task> to continue in same session, or chat normally.`);
                        }
                    } catch (error: any) {
                        agenticaRunning = false;
                        console.log(`\n❌ Error in Agentica Mode: ${error.message}`);
                    }
                }
                promptLoop();
            } else {
                
                // 🛡️ LOCAL INPUT INTERCEPTOR (SECRET SCANNER)
                const { masked: safeInput, changed: secretMasked } = maskSecrets(trimmed);
                
                if (secretMasked) {
                    console.log(`\n⚠️  [ATCLI SHIELD] Sensitive API Key detected in your input!`);
                    console.log(`⚠️  It has been LOCALLY MASKED before sending to the Cloud AI to protect your security.`);
                    console.log(`⚠️  The AI will receive: "[REDACTED_LOCAL_SECRET]" instead of your real key.`);
                }

                console.log(`\n[ATCLI] Sending to ${state.currentProvider}...`);
                try {
                    const adapter = router.getAdapter(state.currentProvider);
                    if (!adapter) {
                        console.log(`❌ Error: Provider '${state.currentProvider}' not found.`);
                    } else {
                        // Block vibecoding ONLY if Agentica is currently executing a task
                        // (not just because it ran before — tasks can finish and user can chat)
                        if (agenticaRunning) {
                            console.log(`\n❌ [BUSY] Agentica is currently executing a task. Wait for it to finish, then chat normally.`);
                            promptLoop();
                            return;
                        }
                        const isFirstForProvider = !initializedProviders.has(state.currentProvider);
                        const agent = new AgentLoop(adapter, isFirstForProvider);
                        await agent.run(safeInput);
                        initializedProviders.set(state.currentProvider, 'vibecoding');
                    }
                } catch (error: any) {
                    console.log(`\n❌ Error: ${error.message}`);
                }
                promptLoop();
            }
        });
    };

    promptLoop();
}
