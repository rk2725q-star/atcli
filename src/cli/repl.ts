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
const initializedProviders = new Set<string>();

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
                } else if (result.action === 'upload' && result.args) {
                    console.log(`\n[ATCLI] 🖼️  Vision Mode Initiated!`);
                    console.log(`[ATCLI] Please go to the open browser window, manually upload your files, and DO NOT hit send.`);
                    rl.question(`[ATCLI] Press ENTER here when you are done uploading... `, async () => {
                        console.log(`\n[ATCLI] Sending prompt along with your uploaded files to ${state.currentProvider}...`);
                        try {
                            const adapter = router.getAdapter(state.currentProvider);
                            if (!adapter) {
                                console.log(`❌ Error: Provider '${state.currentProvider}' not found.`);
                            } else {
                                const isFirstForProvider = !initializedProviders.has(state.currentProvider);
                                const agent = new AgentLoop(adapter, isFirstForProvider);
                                await agent.run(result.args!); // Uses the parsed prompt string
                                initializedProviders.add(state.currentProvider);
                            }
                        } catch (error: any) {
                            console.log(`\n❌ Error: ${error.message}`);
                        }
                        promptLoop();
                    });
                    return; // Prevent the default promptLoop() at the end from running immediately
                }
                
                if (result.action !== 'upload') {
                    promptLoop();
                }
            } else {
                console.log(`\n[ATCLI] Sending to ${state.currentProvider}...`);
                try {
                    const adapter = router.getAdapter(state.currentProvider);
                    if (!adapter) {
                        console.log(`❌ Error: Provider '${state.currentProvider}' not found.`);
                    } else {
                        const isFirstForProvider = !initializedProviders.has(state.currentProvider);
                        const agent = new AgentLoop(adapter, isFirstForProvider);
                        await agent.run(trimmed);
                        initializedProviders.add(state.currentProvider);
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
