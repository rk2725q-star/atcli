import * as readline from 'readline';
import { handleSlashCommand } from './commands';
import { PromptRouter } from '../broker/router';
import { AgentLoop } from '../agent/loop';
import { BrowserManager } from '../browser/manager';

interface AppState {
    currentProvider: string;
    currentModel: string;
}

const router = new PromptRouter();
const initializedProviders = new Map<string, 'vibecoding' | 'agentica'>();

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
    console.log(`Provider: ${state.currentProvider} | Type /help for commands\n`);

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
                    try {
                        if (initializedProviders.has(state.currentProvider)) {
                            console.log(`\n❌ [SECURITY BLOCK] Agentica can ONLY be used in a fresh, new chat session! You cannot mix Agentica with an ongoing Vibecoding session. Please restart ATCLI to use Agentica.`);
                            promptLoop();
                            return;
                        }
                        const adapter = router.getAdapter(state.currentProvider);
                        if (!adapter) {
                            console.log(`❌ Error: Provider '${state.currentProvider}' not found.`);
                        } else {
                            const isFirstForProvider = !initializedProviders.has(state.currentProvider);
                            const agent = new AgentLoop(adapter, isFirstForProvider);
                            
                            const continuousPrompt = `[AGENTICA OPENCLAW MODE: You are now running in continuous autonomous mode with full PC and browser control capabilities. Execute the following task continuously without stopping for user confirmation until the goal is 100% achieved:]\n\n${result.args}`;
                            
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
                        await agent.run(trimmed);
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
