import * as readline from 'readline';
import { handleSlashCommand } from './commands';
import { PromptRouter } from '../broker/router';
import { AgentLoop } from '../agent/loop';
import { BrowserManager } from '../browser/manager';
import * as fs from 'fs';
import * as path from 'path';

interface AppState {
    currentProvider: string;
    currentModel: string;
}

const router = new PromptRouter();
const initializedProviders = new Map<string, 'vibecoding' | 'agentica'>();

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
                                const isFirstForProvider = !initializedProviders.has(state.currentProvider);
                                if (!isFirstForProvider && initializedProviders.get(state.currentProvider) === 'agentica') {
                                    console.log(`\n❌ [SECURITY BLOCK] You cannot run Vision Mode inside an ongoing Agentica session. Please restart ATCLI.`);
                                    promptLoop();
                                    return;
                                }
                                const agent = new AgentLoop(adapter, isFirstForProvider);
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
                    
                    // All other providers (qwen, deepseek, gemini, kimi, z.ai) are allowed for Agentica
                    // because AgentLoop natively re-injects the 180k context periodically to prevent memory loss!

                    try {
                        if (initializedProviders.has(state.currentProvider)) {
                            console.log(`\n🔄 [AUTO-SWITCH] Resetting the browser session for a fresh Agentica instance...`);
                            await BrowserManager.getInstance().closeAll();
                            initializedProviders.clear();
                            const adapterToReset = router.getAdapter(state.currentProvider);
                            if (adapterToReset) adapterToReset.reset();
                        }
                        const adapter = router.getAdapter(state.currentProvider);
                        if (!adapter) {
                            console.log(`❌ Error: Provider '${state.currentProvider}' not found.`);
                        } else {
                            const isFirstForProvider = !initializedProviders.has(state.currentProvider);
                            const agent = new AgentLoop(adapter, isFirstForProvider);
                            
                            // 🛡️ LOCAL INPUT INTERCEPTOR (SECRET SCANNER)
                            const { masked: safeArgs, changed: secretMasked } = maskSecrets(result.args || '');
                            if (secretMasked) {
                                console.log(`\n⚠️  [ATCLI SHIELD] Sensitive API Key detected in your Agentica request!`);
                                console.log(`⚠️  It has been LOCALLY MASKED before sending to the Cloud AI.`);
                            }
                            
                            const continuousPrompt = `[AGENTICA OPENCLAW MODE: You are now running in continuous autonomous mode with full PC and browser control capabilities. Execute the following task continuously without stopping for user confirmation until the goal is 100% achieved:]\n\n${safeArgs}`;
                            
                            (agent as any).isAgenticaMode = true; 
                            
                            await agent.run(continuousPrompt);
                            initializedProviders.set(state.currentProvider, 'agentica');
                        }
                    } catch (error: any) {
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
                        const isFirstForProvider = !initializedProviders.has(state.currentProvider);
                        if (!isFirstForProvider && initializedProviders.get(state.currentProvider) === 'agentica') {
                            console.log(`\n❌ [SECURITY BLOCK] You cannot run normal Vibecoding commands inside an ongoing Agentica session! Please restart ATCLI.`);
                            promptLoop();
                            return;
                        }
                        const agent = new AgentLoop(adapter, isFirstForProvider);
                        await agent.run(safeInput); // Send the masked input
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
