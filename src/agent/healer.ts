import * as fs from 'fs/promises';
import * as path from 'path';
import { Page } from 'playwright';
import { OllamaFallbackProvider } from '../providers/ollama';

export class Healer {
    
    /**
     * Triggers the Doomsday Protocol when a web provider fails.
     * Starts by trying to autonomously control the browser via OpenClaw principles using Qwen3-VL.
     */
    public static async triggerDoomsdayProtocol(providerId: string, page: Page): Promise<void> {
        console.log(`\n[DOOMSDAY HEALER] 🚨 ${providerId.toUpperCase()} Provider Failed! Initiating Unified Local Healing...`);
        
        try {
            let isFixed = false;
            let maxSteps = 5;
            let step = 0;

            console.log('[DOOMSDAY HEALER] 🦾 Launching OpenClaw Autonomous Browser Control via Local Qwen3-VL (2B)...');

            while (!isFixed && step < maxSteps) {
                step++;
                // 1. Capture Current State
                const screenshotBuffer = await page.screenshot({ type: 'png' });
                const base64Image = screenshotBuffer.toString('base64');
                
                // 2. Query Qwen3-VL
                const openClawPrompt = `You are an OpenClaw Autonomous Browser Agent.
The web provider (${providerId}) failed due to a UI change. Step ${step}/${maxSteps}.
Task: Analyze the screenshot. 
If you found the new CSS selector for the chat input and send button, output:
{"status": "solved", "target": "old_selector", "replacement": "new_selector"}
If you need to navigate the browser to find the answer (e.g. searching Google), output ONE action:
{"status": "action", "action": "CLICK", "selector": "#btn-id"}
{"status": "action", "action": "TYPE", "selector": "#input-id", "text": "search query"}
{"status": "action", "action": "GOTO", "url": "https://google.com"}
Output ONLY valid JSON.`;
                
                console.log(`[DOOMSDAY HEALER] 👁️  Step ${step}: Qwen3-VL analyzing screen...`);
                const responseStr = await OllamaFallbackProvider.callUnifiedHealer(openClawPrompt, base64Image);
                console.log(`[DOOMSDAY HEALER] 🧠 OpenClaw Decision:\n${responseStr}`);

                // 3. Execute Decision
                const actionData = this.parseJsonFromResponse(responseStr);
                if (!actionData) {
                    console.log('[DOOMSDAY HEALER] ⚠️ Qwen3-VL returned invalid JSON, retrying...');
                    continue;
                }

                if (actionData.status === 'solved') {
                    // 4. Apply the Fix
                    await this.applyFix(providerId, JSON.stringify(actionData));
                    console.log(`[DOOMSDAY HEALER] ✅ Self-Healing Complete! ${providerId} has been autonomously fixed via OpenClaw.`);
                    isFixed = true;
                } else if (actionData.status === 'action') {
                    await this.executeOpenClawAction(page, actionData);
                    await page.waitForTimeout(2000); // Wait for page to react
                }
            }

            if (!isFixed) {
                console.error('[DOOMSDAY HEALER] ❌ Max steps reached. Could not heal autonomously.');
            }
            
        } catch (error: any) {
            if (error.message && error.message.includes('Not Found')) {
                console.error('[DOOMSDAY HEALER] ❌ Healing Failed! Local Ollama not found or not running.');
            } else {
                console.error('[DOOMSDAY HEALER] ❌ Healing Failed! Total Brain Death.', error.message || error);
            }
        }
    }

    private static parseJsonFromResponse(responseStr: string): any {
        try {
            const jsonStart = responseStr.indexOf('{');
            const jsonEnd = responseStr.lastIndexOf('}') + 1;
            if (jsonStart === -1 || jsonEnd === 0) return null;
            return JSON.parse(responseStr.slice(jsonStart, jsonEnd));
        } catch (e) {
            return null;
        }
    }

    private static async executeOpenClawAction(page: Page, actionData: any): Promise<void> {
        try {
            if (actionData.action === 'CLICK' && actionData.selector) {
                console.log(`[OPENCLAW] 🖱️ Clicking ${actionData.selector}`);
                await page.click(actionData.selector);
            } else if (actionData.action === 'TYPE' && actionData.selector && actionData.text) {
                console.log(`[OPENCLAW] ⌨️ Typing "${actionData.text}" into ${actionData.selector}`);
                await page.fill(actionData.selector, actionData.text);
            } else if (actionData.action === 'GOTO' && actionData.url) {
                console.log(`[OPENCLAW] 🌐 Navigating to ${actionData.url}`);
                await page.goto(actionData.url);
            }
        } catch (e: any) {
            console.error(`[OPENCLAW] ⚠️ Action failed: ${e.message}`);
        }
    }

    private static async applyFix(providerId: string, jsonStr: string): Promise<void> {
        try {
            const jsonStart = jsonStr.indexOf('{');
            const jsonEnd = jsonStr.lastIndexOf('}') + 1;
            const cleanJson = jsonStr.slice(jsonStart, jsonEnd);
            
            const fixData = JSON.parse(cleanJson);
            const target = fixData.target;
            const replacement = fixData.replacement;
            
            if (!target || !replacement) return;

            const providerPath = path.resolve(process.cwd(), `src/providers/${providerId}.ts`);
            let fileContent = await fs.readFile(providerPath, 'utf8');
            
            if (fileContent.includes(target)) {
                fileContent = fileContent.replace(target, replacement);
                await fs.writeFile(providerPath, fileContent, 'utf8');
                console.log(`[DOOMSDAY HEALER] 📝 Wrote OpenClaw fix to ${providerId}.ts!`);
            } else {
                console.log(`[DOOMSDAY HEALER] ⚠️ Could not find target text in ${providerId}.ts to replace.`);
            }
        } catch (err) {
            console.error('[DOOMSDAY HEALER] Error applying fix to file:', err);
        }
    }
}
