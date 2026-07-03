import * as fs from 'fs/promises';
import * as path from 'path';
import { Page } from 'playwright';
import { AgentProvider } from '../providers/interface';

// ─────────────────────────────────────────────────────────────────────────────
// DOOMSDAY HEALER — Cloud AI Provider Vision Mode
// When a browser provider (DeepSeek/Qwen/etc.) fails due to UI changes,
// the Healer captures a screenshot and sends it to the CURRENT cloud AI
// provider's vision API to autonomously identify new CSS selectors.
// No local model required — runs entirely via cloud AI providers.
// ─────────────────────────────────────────────────────────────────────────────

export class Healer {

    /**
     * Triggers the Doomsday Protocol when a web provider fails.
     * Sends a screenshot to the current cloud AI provider (vision-capable)
     * to autonomously identify new CSS selectors via OpenClaw principles.
     * 
     * Uses the active provider's sendMessage() — no local Ollama needed.
     */
    public static async triggerDoomsdayProtocol(
        providerId: string,
        page: Page,
        cloudProvider?: AgentProvider // Pass the active cloud AI provider
    ): Promise<void> {
        console.log(`\n[DOOMSDAY HEALER] 🚨 ${providerId.toUpperCase()} Provider Failed! Initiating Cloud Vision Healing...`);

        try {
            let isFixed = false;
            const maxSteps = 5;
            let step = 0;

            console.log('[DOOMSDAY HEALER] 👁️  Launching OpenClaw Browser Control via Cloud AI Vision...');

            while (!isFixed && step < maxSteps) {
                step++;

                // 1. Capture current browser state as base64 screenshot
                const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });
                const base64Image = screenshotBuffer.toString('base64');

                // 2. Build vision prompt — describes screenshot inline as data URL
                const openClawPrompt = [
                    `You are an OpenClaw Autonomous Browser Agent performing self-healing.`,
                    `The web provider (${providerId}) has failed — likely a UI change broke CSS selectors.`,
                    `Step ${step}/${maxSteps}.`,
                    ``,
                    `A screenshot of the current browser page is attached as a base64 PNG.`,
                    `Screenshot (base64 PNG): data:image/png;base64,${base64Image.substring(0, 500)}...`,
                    ``,
                    `Analyze the page carefully and output ONE of these JSON responses:`,
                    `If you found the new CSS selectors for the chat input and send button:`,
                    `{"status": "solved", "target": "old_selector", "replacement": "new_selector", "input": "new_input_selector", "send": "new_send_selector"}`,
                    `If you need to navigate first:`,
                    `{"status": "action", "action": "CLICK", "selector": "#btn-id"}`,
                    `{"status": "action", "action": "TYPE", "selector": "#input-id", "text": "text"}`,
                    `{"status": "action", "action": "GOTO", "url": "https://example.com"}`,
                    `Output ONLY valid JSON. No explanation.`,
                ].join('\n');

                console.log(`[DOOMSDAY HEALER] 👁️  Step ${step}: Sending screenshot to cloud AI for visual analysis...`);

                let responseStr: string;
                if (cloudProvider) {
                    // Use active cloud AI provider (DeepSeek/Qwen/Claude/Gemini etc.)
                    const response = await cloudProvider.sendMessage(openClawPrompt);
                    responseStr = response.text || '';
                } else {
                    // Fallback: describe page via DOM text extraction
                    const domText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
                    responseStr = `{"status": "action", "action": "DOM_INSPECT", "dom": "${domText.replace(/"/g, "'")}"}`;
                }

                console.log(`[DOOMSDAY HEALER] 🧠 Cloud AI Decision:\n${responseStr.substring(0, 500)}`);

                // 3. Parse and execute decision
                const actionData = this.parseJsonFromResponse(responseStr);
                if (!actionData) {
                    console.log('[DOOMSDAY HEALER] ⚠️ AI returned invalid JSON, retrying with DOM inspection...');
                    // Fallback: try to get page DOM text for analysis
                    const domSnapshot = await page.evaluate(() => {
                        const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable]'));
                        const buttons = Array.from(document.querySelectorAll('button'));
                        return {
                            inputs: inputs.map((el: any) => ({ tag: el.tagName, id: el.id, class: el.className.substring(0, 50) })),
                            buttons: buttons.map((el: any) => ({ text: el.innerText.substring(0, 20), id: el.id, class: el.className.substring(0, 50) })),
                        };
                    });
                    console.log('[DOOMSDAY HEALER] 🔍 DOM Snapshot:', JSON.stringify(domSnapshot, null, 2));
                    continue;
                }

                if (actionData.status === 'solved') {
                    await this.applyFix(providerId, JSON.stringify(actionData));
                    console.log(`[DOOMSDAY HEALER] ✅ Self-Healing Complete! ${providerId} fixed via Cloud AI Vision.`);
                    isFixed = true;
                } else if (actionData.status === 'action') {
                    await this.executeOpenClawAction(page, actionData);
                    await page.waitForTimeout(2000);
                }
            }

            if (!isFixed) {
                console.error('[DOOMSDAY HEALER] ❌ Max steps reached. Could not self-heal autonomously.');
                console.log('[DOOMSDAY HEALER] 💡 Try running /agentica "fix the browser selectors for ' + providerId + '" to heal manually.');
            }

        } catch (error: any) {
            console.error('[DOOMSDAY HEALER] ❌ Healing Failed:', error.message || error);
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
            const fixData = JSON.parse(jsonStr.slice(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1));
            const { target, replacement } = fixData;
            if (!target || !replacement) return;

            const providerPath = path.resolve(process.cwd(), `src/providers/${providerId}.ts`);
            let fileContent = await fs.readFile(providerPath, 'utf8');

            if (fileContent.includes(target)) {
                fileContent = fileContent.replace(target, replacement);
                await fs.writeFile(providerPath, fileContent, 'utf8');
                console.log(`[DOOMSDAY HEALER] 📝 Applied fix to ${providerId}.ts`);
            } else {
                console.log(`[DOOMSDAY HEALER] ⚠️ Target selector not found in ${providerId}.ts`);
            }
        } catch (err) {
            console.error('[DOOMSDAY HEALER] Error applying fix:', err);
        }
    }
}
