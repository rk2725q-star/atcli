import * as readline from 'readline';
import { handleSlashCommand } from './commands';
import { PromptRouter } from '../broker/router';
import { AgentLoop } from '../agent/loop';
import { HermesAgent } from '../agent/hermes';
import { BrowserManager } from '../browser/manager';
import { maskSecretsString } from '../utils/secrets';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

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

export let isExecutingTask = false;
export let savedPromptForEsc = '';
let escPressCount = 0;
let lastEscTime = 0;

readline.emitKeypressEvents(process.stdin);
process.stdin.on('keypress', (str, key) => {
    if (key && key.name === 'escape' && isExecutingTask) {
        const now = Date.now();
        if (now - lastEscTime < 500) {
            escPressCount++;
        } else {
            escPressCount = 1;
        }
        lastEscTime = now;

        (global as any).abortRequested = true;

        const adapter = router.getAdapter(state.currentProvider);
        if (adapter && (adapter as any).abort) {
            (adapter as any).abort();
        }

        if (escPressCount >= 2) {
            savedPromptForEsc = '';
            console.log('\n\n[ATCLI] 🛑 Request CANCELLED (Double Esc) - Prompt Cleared.');
        } else {
            console.log('\n\n[ATCLI] 🛑 Request CANCELLED - Prompt Restored.');
        }
    }
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

            // ── UNIVERSAL MODEL & TOOL INTERCEPTOR ───────────────────────────────
            // Catches any local model or CLI tool typed inside ATCLI and bridges it.
            
            // Pattern 1: "ollama run <model>" — existing exact command
            if (trimmed.startsWith('ollama run ')) {
                const modelName = trimmed.replace('ollama run ', '').replace(/^<|>$/g, '').trim();
                console.log(`\n[ATCLI] 🔌 Intercepted 'ollama run'. Connecting ATCLI to your local model...`);
                state.currentProvider = 'local';
                state.currentModel = modelName;
                router?.setLocalModel?.('local', modelName);
                (global as any).__atcli_senior_plan = undefined;
                console.log(`\n  ✅ SUCCESS: ATCLI is now powered by local model \x1b[36m${modelName}\x1b[0m`);
                console.log(`  🔥 Pre-warming model in background — first response will be fast!`);
                console.log(`  🤖 You can now type your tasks directly below\n`);
                // Background pre-warm: load model into VRAM NOW while user reads this message
                const { OllamaApiAdapter } = await import('../providers/ollama');
                new OllamaApiAdapter('local-prewarm', modelName).preWarm().catch(() => {});
                promptLoop();
                return;
            }
            
            // Pattern 2: Just a bare Ollama model name typed directly (e.g., "qwen2.5-coder:3b")
            // Matches format: "name:tag" or "namespace/name:tag"
            if (/^[\w][\w.\-]*(\/[\w][\w.\-]*)?:[\w][\w.\-]*$/.test(trimmed)) {
                const modelName = trimmed;
                console.log(`\n[ATCLI] 🔌 Detected Ollama model shorthand. Connecting ATCLI to: \x1b[36m${modelName}\x1b[0m...`);
                state.currentProvider = 'local';
                state.currentModel = modelName;
                router?.setLocalModel?.('local', modelName);
                (global as any).__atcli_senior_plan = undefined;
                console.log(`\n  ✅ SUCCESS: ATCLI is now powered by local model \x1b[36m${modelName}\x1b[0m`);
                console.log(`  🔥 Pre-warming model in background — first response will be fast!`);
                console.log(`  🤖 You can now type your tasks directly below\n`);
                // Background pre-warm: load model into VRAM NOW while user reads this message
                const { OllamaApiAdapter } = await import('../providers/ollama');
                new OllamaApiAdapter('local-prewarm', modelName).preWarm().catch(() => {});
                promptLoop();
                return;
            }

            // Pattern 3: Known CLI AI tools — ACTUALLY SPAWN THEM with ATCLI context injected
            // These tools run autonomously (read/write/fix) — ATCLI just gives them project context
            // and file upload capability that these tools normally lack.
            const PASSTHROUGH_CLI_TOOLS = [
                { cmd: 'opencode',  name: 'OpenCode',  configDir: '.opencode',  instructionsFile: 'instructions.md' },
                { cmd: 'aider',     name: 'Aider',     configDir: null,         instructionsFile: null },
                { cmd: 'claude',    name: 'Claude CLI', configDir: null,        instructionsFile: null },
            ];
            const matchedTool = PASSTHROUGH_CLI_TOOLS.find(t => trimmed === t.cmd || trimmed.startsWith(t.cmd + ' '));
            if (matchedTool) {
                const passthroughArgs = trimmed.slice(matchedTool.cmd.length).trim();
                const cwd = process.cwd();
                const memoryPath = path.join(cwd, 'ATCLI_MEMORY.md');
                const stagedFiles = (global as any).__atcli_staged_files as string | undefined;

                console.log(`\n[ATCLI] 🔌 Launching ${matchedTool.name} with ATCLI context...`);

                // ── STEP 1: Build context block to inject ─────────────────────────
                let contextBlock = '';

                // Inject ATCLI_MEMORY.md (project context — tech stack, status, files)
                if (fs.existsSync(memoryPath)) {
                    const memContent = fs.readFileSync(memoryPath, 'utf-8');
                    // Only send the essentials — not the full memory (keep it under 3k chars)
                    const compressed = memContent
                        .replace(/\n{3,}/g, '\n\n')
                        .substring(0, 3000);
                    contextBlock += `## Project Context (from ATCLI_MEMORY.md)\n\n${compressed}\n\n`;
                    console.log(`  📖 Injected ATCLI_MEMORY.md (${memContent.length} chars compressed to 3k)`);
                }

                // Inject any files staged via /file or /paste
                if (stagedFiles) {
                    contextBlock += `## Staged Files (uploaded via ATCLI /file)\n\n${stagedFiles}\n\n`;
                    (global as any).__atcli_staged_files = undefined;
                    console.log(`  📎 Injected staged file(s)`);
                }

                // ── STEP 2: Write context to tool's instructions file ─────────────
                if (matchedTool.configDir && matchedTool.instructionsFile && contextBlock) {
                    const configDir = path.join(cwd, matchedTool.configDir);
                    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
                    const instrPath = path.join(configDir, matchedTool.instructionsFile);
                    
                    // Preserve any existing custom instructions, prepend ATCLI context
                    let existingInstr = '';
                    if (fs.existsSync(instrPath)) {
                        existingInstr = fs.readFileSync(instrPath, 'utf-8');
                        // Remove old auto-injected block if present
                        existingInstr = existingInstr.replace(/<!-- ATCLI_CONTEXT_START -->[\s\S]*?<!-- ATCLI_CONTEXT_END -->/g, '').trim();
                    }
                    
                    const atcliBlock = `<!-- ATCLI_CONTEXT_START -->\n${contextBlock}<!-- ATCLI_CONTEXT_END -->`;
                    fs.writeFileSync(instrPath, `${atcliBlock}\n\n${existingInstr}`, 'utf-8');
                    console.log(`  ✅ Context written to ${matchedTool.configDir}/${matchedTool.instructionsFile}`);
                }

                // ── STEP 3: Start file upload bridge server (OpenCode only) ──────
                let bridgeServer: { stop: () => void; port: number } | null = null;
                if (matchedTool.cmd === 'opencode') {
                    try {
                        const { startOpenCodeBridge } = await import('../bridge/opencode_bridge');
                        bridgeServer = startOpenCodeBridge(cwd);
                    } catch (e: any) {
                        console.log(`  ⚠️  Bridge server skipped: ${e.message}`);
                    }
                }

                // ── STEP 4: Spawn the real tool process (inherit stdio fully) ─────
                console.log(`  🚀 Starting ${matchedTool.name}...`);
                if (bridgeServer) {
                    console.log(`  📎 File upload: \x1b[36mhttp://localhost:${bridgeServer.port}\x1b[0m (open in browser)\n`);
                }
                
                // Pause the readline so the tool gets full terminal control
                rl.pause();
                
                const toolProcess = spawn(
                    matchedTool.cmd,
                    passthroughArgs ? passthroughArgs.split(' ').filter(Boolean) : [],
                    {
                        stdio: 'inherit',  // full terminal passthrough — user types directly into opencode
                        shell: true,
                        cwd,
                        env: process.env,
                    }
                );

                toolProcess.on('close', (code) => {
                    // ── STEP 5: Stop bridge server ─────────────────────────────────
                    if (bridgeServer) bridgeServer.stop();
                    
                    // ── STEP 6: Clean up injected context after tool exits ─────────
                    if (matchedTool.configDir && matchedTool.instructionsFile) {
                        const instrPath = path.join(cwd, matchedTool.configDir, matchedTool.instructionsFile);
                        if (fs.existsSync(instrPath)) {
                            let content = fs.readFileSync(instrPath, 'utf-8');
                            // Clean both context and uploads injections
                            content = content
                                .replace(/<!-- ATCLI_CONTEXT_START -->[\s\S]*?<!-- ATCLI_CONTEXT_END -->/g, '')
                                .replace(/<!-- ATCLI_UPLOADS_START -->[\s\S]*?<!-- ATCLI_UPLOADS_END -->/g, '')
                                .trim();
                            if (content) {
                                fs.writeFileSync(instrPath, content + '\n', 'utf-8');
                            } else {
                                fs.unlinkSync(instrPath);
                            }
                        }
                    }
                    console.log(`\n[ATCLI] ${matchedTool.name} exited (code ${code}). Back in ATCLI.\n`);
                    
                    // Resume ATCLI readline
                    rl.resume();
                    promptLoop();
                });

                toolProcess.on('error', (err: any) => {
                    if (bridgeServer) bridgeServer.stop();
                    if (err.code === 'ENOENT') {
                        console.log(`\n❌ '${matchedTool.cmd}' not found. Install it first:`);
                        if (matchedTool.cmd === 'opencode') {
                            console.log(`   npm install -g @opencode-ai/opencode   (or check opencode.ai for install)`);
                        }
                    } else {
                        console.log(`\n❌ Error launching ${matchedTool.name}: ${err.message}`);
                    }
                    rl.resume();
                    promptLoop();
                });

                return; // Don't call promptLoop here — it's called in close/error handlers
            }

            if (trimmed.startsWith('/')) {
                const result = handleSlashCommand(trimmed, state, router);
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
                } else if (result.action === 'session') {
                    console.log(`\n[ATCLI] 🕒 Session Switch Mode Initiated!`);
                    try {
                        const adapter = router.getAdapter(state.currentProvider);
                        if (!adapter) {
                            console.log(`❌ Error: Provider '${state.currentProvider}' not found.`);
                            promptLoop();
                            return;
                        }
                        
                        console.log(`[ATCLI] 🌐 Opening browser to ${state.currentProvider}...`);
                        await adapter.init();
                        
                        console.log(`[ATCLI] ✅ Browser is ready! Please manually click on your PREVIOUS CHAT HISTORY in the provider's sidebar.`);
                        rl.question(`[ATCLI] Type the task you want to continue with (or press ENTER to just resume): `, async (userPrompt) => {
                            // Mark provider as initialized so it doesn't trigger 'New Chat' on next run
                            initializedProviders.set(state.currentProvider, 'vibecoding');
                            
                            if (userPrompt.trim().length > 0) {
                                console.log(`\n[ATCLI] Sending continuation prompt to ${state.currentProvider}...`);
                                try {
                                    if (agenticaRunning) {
                                        console.log(`\n❌ [BUSY] Agentica is currently executing. Wait for it to finish.`);
                                        promptLoop();
                                        return;
                                    }
                                    const agent = new AgentLoop(adapter, false); // isFirstMessage=false to avoid resending full system prompt needlessly
                                    await agent.run(userPrompt.trim());
                                } catch (error: any) {
                                    console.log(`\n❌ Error: ${error.message}`);
                                }
                            } else {
                                console.log(`\n✅ Session switched successfully. You can now type your next prompt normally.`);
                            }
                            promptLoop();
                        });
                        return; // Prevent the default promptLoop()
                    } catch (error: any) {
                        console.log(`\n❌ Error opening browser: ${error.message}`);
                        promptLoop();
                        return;
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
                        console.log(`\n⚠️  [SECURITY BLOCK] ChatGPT does not perform well in Agentica mode. Auto-switching to 'qwen'.`);
                        state.currentProvider = 'qwen';
                    }

                    try {
                        const adapter = router.getAdapter(state.currentProvider);
                        if (!adapter) {
                            console.log(`❌ Error: Provider '${state.currentProvider}' not found.`);
                        } else {
                            // ── SESSION MANAGEMENT ─────────────────────────────────────────────
                            const hasSession = agenticaSessions.get(state.currentProvider) === true;
                            const isFirstForProvider = !hasSession;

                            if (isFirstForProvider) {
                                console.log(`\n🌐 [Agentica] Starting fresh browser session for ${state.currentProvider}...`);
                            } else {
                                console.log(`\n♻️  [Agentica] Reusing existing session — sending next task in same chat...`);
                            }

                            // 🛡️ SECRET SCANNER
                            const { masked: safeArgs, changed: secretMasked } = maskSecretsString(result.args || '');
                            if (secretMasked) {
                                console.log(`\n⚠️  [ATCLI SHIELD] Sensitive API Key detected in your Agentica request! Masked before sending.`);
                            }

                            // ── HERMES NESTED AGENT MODE ──────────────────────────────────────
                            // /agentica now routes through: Hermes → Orchestrator → 15 Sub-Agents
                            // This gives task decomposition, specialist focus, and self-learning.
                            console.log(`\n👑 [HERMES] Master Brain + 15 Nested Agents activated.`);
                            
                            // Initialize browser/provider session first if needed
                            if (isFirstForProvider) {
                                await adapter.init();
                            }

                            const hermes = new HermesAgent(adapter);
                            hermes.isAgenticaMode = true;

                            agenticaRunning = true;
                            isExecutingTask = true;
                            savedPromptForEsc = safeArgs || '';
                            try {
                                await hermes.run(safeArgs || '');
                            } finally {
                                isExecutingTask = false;
                                agenticaRunning = false;
                            }

                            agenticaSessions.set(state.currentProvider, true);
                            initializedProviders.set(state.currentProvider, 'agentica');
                            console.log(`\n✅ [Agentica] Task complete. Hermes has updated AGENTICA_MEMORY.md with lessons learned.`);
                        }
                    } catch (error: any) {
                        agenticaRunning = false;
                        isExecutingTask = false;
                        if (error.name === 'UserInterruptError') {
                            if (savedPromptForEsc) rl.write(savedPromptForEsc);
                        } else {
                            console.log(`\n❌ Error in Agentica Mode: ${error.message}`);
                        }
                    }
                }
                promptLoop();
            } else {
                
                // 🛡️ LOCAL INPUT INTERCEPTOR (SECRET SCANNER)
                const { masked: maskedInput, changed: secretMasked } = maskSecretsString(trimmed);
                
                if (secretMasked) {
                    console.log(`\n⚠️  [ATCLI SHIELD] Sensitive API Key detected in your input!`);
                    console.log(`⚠️  It has been LOCALLY MASKED before sending to the Cloud AI to protect your security.`);
                    console.log(`⚠️  The AI will receive: "[REDACTED_LOCAL_SECRET]" instead of your real key.`);
                }
                
                // ── FILE/PASTE BRIDGE: Prepend staged file content ───────────────
                // If user ran /file or /paste before this message, inject the file
                // content into the message automatically and then clear the stage.
                let safeInput = maskedInput;
                const stagedFiles = (global as any).__atcli_staged_files as string | undefined;
                if (stagedFiles) {
                    safeInput = `${safeInput}\n\n${stagedFiles}`;
                    (global as any).__atcli_staged_files = undefined;
                    console.log(`\n📎 [ATCLI] Injecting staged file(s) into your message...`);
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
                        if (isFirstForProvider && typeof (adapter as any).clearConversation === 'function') {
                            const isResume = process.argv.includes('--resume') || process.argv.includes('-r');
                            const keepPersistentLocalConversation = ['local', 'ollama', 'qwen-local', 'nvidia'].includes(state.currentProvider);
                            if (!isResume && !keepPersistentLocalConversation) {
                                (adapter as any).clearConversation();
                            }
                        }
                        const agent = new AgentLoop(adapter, isFirstForProvider);

                        // ── SENIOR-JUNIOR ORCHESTRATION ──────────────────────────────────────
                        // For local models: Senior API generates a plan ONCE per task.
                        // Plan is injected into the first message → local model follows steps.
                        // No browser needed — pure API call (1-3s latency, not 30s).
                        const isLocalProvider = ['local', 'ollama', 'qwen-local'].includes(state.currentProvider);
                        let orchestratedInput = safeInput;

                        if (isLocalProvider && isFirstForProvider) {
                            try {
                                const { orchestratePlan, loadCachedPlan, formatOrchestratorPlan } = await import('../agent/senior_orchestrator');

                                // Try cached plan first (resume mid-project)
                                let plan = loadCachedPlan();
                                if (!plan) {
                                    plan = await orchestratePlan(safeInput);
                                }

                                if (plan) {
                                    const planText = formatOrchestratorPlan(plan);
                                    // Inject plan into the first message — local model reads it as the task
                                    orchestratedInput = `${safeInput}\n\n${planText}`;
                                    console.log(`\n🎯 [ORCHESTRATOR] Plan injected — local model will execute ${plan.steps.length} steps`);
                                }
                            } catch (planErr: any) {
                                // Never block on planning failure — local model continues alone
                                console.log(`\x1b[90m[ORCHESTRATOR] Planning skipped: ${planErr.message}\x1b[0m`);
                            }
                        }

                        isExecutingTask = true;
                        savedPromptForEsc = safeInput;
                        try {
                            await agent.run(orchestratedInput);
                        } finally {
                            isExecutingTask = false;
                        }

                        initializedProviders.set(state.currentProvider, 'vibecoding');
                    }
                } catch (error: any) {
                    if (error.name === 'UserInterruptError') {
                        // The user pressed Esc, don't log a scary error, just restore prompt if needed
                        if (savedPromptForEsc) {
                            rl.write(savedPromptForEsc);
                        }
                    } else {
                        console.log(`\n❌ Error: ${error.message}`);
                    }
                }
                promptLoop();
            }
        });
    };

    promptLoop();
}
