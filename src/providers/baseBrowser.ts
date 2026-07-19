import { Page } from 'playwright';
import { AgentProvider, ProviderResponse } from './interface';

export { ProviderResponse };

export abstract class BaseBrowserAdapter implements AgentProvider {
    protected page: Page | null = null;
    
    constructor(public readonly id: string, public readonly url: string) {}

    public abstract init(): Promise<void>;
    public abstract sendMessage(message: string): Promise<ProviderResponse>;
    
    public reset(): void {
        this.page = null;
    }

    public abort(): void {
        if (this.page) {
            console.log(`\n[${this.id.toUpperCase()}] 🛑 Abort requested. Reloading page to instantly kill generation...`);
            this.page.reload().catch(() => {});
        }
    }

    public async sendImageAndMessage(imageSource: string, message: string): Promise<ProviderResponse> {
        await this.ensurePage();

        // ── Resolve base64 from in-memory or file ──────────────────────────────
        // imageSource is either:
        //   "__BASE64__<base64data>" — in-memory, NEVER from disk (the new default)
        //   "/path/to/file.png"      — legacy fallback (user-uploaded file, not screenshots)
        let base64: string;
        let isInMemory = false;

        if (imageSource.startsWith('__BASE64__')) {
            // ✅ In-memory path: extract base64 directly — zero disk I/O
            base64 = imageSource.slice('__BASE64__'.length);
            isInMemory = true;
            console.log(`[${this.id.toUpperCase()}] 📸 Vision: using in-memory base64 (no disk) — sending to AI...`);
        } else {
            // Legacy: user uploaded a real file (not a screenshot) — read from disk
            const fs = require('fs');
            base64 = fs.readFileSync(imageSource).toString('base64');
            console.log(`[${this.id.toUpperCase()}] 📎 Vision: reading uploaded file from disk...`);
        }

        try {
            // Strategy 1: file input injection
            const fileInputs = this.page!.locator('input[type="file"]');
            const count = await fileInputs.count();

            if (count > 0 && !isInMemory) {
                // File inputs only work with real disk paths — only use for user-uploaded files
                console.log(`[${this.id.toUpperCase()}] Found ${count} file input(s). Injecting file...`);
                let uploaded = false;
                for (let i = 0; i < count; i++) {
                    try {
                        await fileInputs.nth(i).setInputFiles(imageSource);
                        uploaded = true;
                    } catch (_) {}
                }
                if (uploaded) {
                    console.log(`[${this.id.toUpperCase()}] ✅ File injected. Waiting for UI...`);
                    await this.page!.waitForTimeout(5000);
                }
            } else {
                // Strategy 2: DataTransfer Drag-and-Drop using in-memory base64
                // ✅ No disk read — base64 already in RAM
                console.log(`[${this.id.toUpperCase()}] Using DataTransfer injection with in-memory base64...`);
                const mime = 'image/png';
                const filename = `screenshot_${Date.now()}.png`; // name only, no file created

                await this.page!.evaluate(
                    async ({ b64, mimeType, name }) => {
                        const res = await fetch(`data:${mimeType};base64,${b64}`);
                        const blob = await res.blob();
                        const file = new File([blob], name, { type: mimeType });
                        const dt = new DataTransfer();

                        dt.items.add(file);
                        
                        // Find the chat textarea to drop the file onto
                        const target = document.querySelector('textarea, [contenteditable="true"]') || document.body;
                        
                        // Dispatch drag events
                        target.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
                        target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
                        target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
                    },
                    { b64: base64, mimeType: mime, name: filename }
                );
                
                console.log(`[${this.id.toUpperCase()}] Drag-and-Drop fallback executed. Waiting 2 seconds...`);
                await this.page!.waitForTimeout(2000);
            }
        } catch (e: any) {
            console.log(`[${this.id.toUpperCase()}] Error uploading image: ${e.message}`);
        }
        
        // After upload, just send the message normally using the child class's sendMessage implementation
        return this.sendMessage(message);
    }
    protected async ensurePage(): Promise<void> {
        if (!this.page) {
            const { BrowserManager } = await import('../browser/manager');
            const manager = BrowserManager.getInstance();
            this.page = await manager.getOrCreatePage(this.id, this.url);
        }
    }

    /**
     * Intelligently waits for the chat input box to appear. 
     * If it times out, pauses execution and prompts the user to resolve the login/captcha.
     */
    protected async waitForChatInput(selector: string, timeout: number = 15000): Promise<void> {
        while (true) {
            try {
                // Wait for the selector to be attached and visible
                await this.page!.waitForSelector(selector, { state: 'visible', timeout });
                return;
            } catch (e) {
                console.log(`\n[${this.id.toUpperCase()}] ⚠️ Browser paused: Could not find chat input box.`);
                console.log(`[${this.id.toUpperCase()}] Action required: The AI provider might be asking for a Login, Signup, or CAPTCHA.`);
                console.log(`[${this.id.toUpperCase()}] Please complete the required action in the browser window.`);
                
                await (global as any).askQuestion(`\n[${this.id.toUpperCase()}] Press ENTER here when you are done to resume... `);
                console.log(`[${this.id.toUpperCase()}] Resuming and checking for input field again...`);
            }
        }
    }

    /**
     * Intelligently polls the DOM until the AI's response text stops changing.
     * @param evaluateFn The function to run inside the browser context to extract the text
     * @param maxWaitSeconds The maximum number of seconds to poll before giving up
     * @param stableSecondsRequired The number of seconds the text must remain unchanged to be considered complete
     * @param previousTextToIgnore If the extracted text exactly matches this, it is ignored (used to prevent grabbing previous messages)
     * @param isGeneratingFn Optional function to check if the AI is still generating
     */
    protected async pollForResponse(
        evaluateFn: any,
        maxWaitSeconds: number = 180,  // Raised from 60 → 180s for large code generation tasks (Flipkart-size)
        stableSecondsRequired: number = 3,
        previousTextToIgnore: string = "",
        isGeneratingFn?: () => Promise<boolean>
    ): Promise<string> {
        console.log(`[${this.id.toUpperCase()}] Waiting for response to complete...`);
        
        let finalResponse = "";
        let stableCount = 0;

        for (let i = 0; i < maxWaitSeconds; i++) {
            // Wait 1 second between polls
            await this.page!.waitForTimeout(1000);
            
            // Intelligent GLOBAL auto-retry if message failed to send (e.g., due to image upload lag)
            if (i > 0 && i % 8 === 0) {
                try {
                    await this.page!.evaluate(() => {
                        const sendBtn = Array.from(document.querySelectorAll('div[role="button"], button')).find(el => {
                            const html = el.innerHTML.toLowerCase();
                            const text = (el as any).innerText?.toLowerCase() || '';
                            const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
                            const dataTestId = el.getAttribute('data-testid')?.toLowerCase() || '';
                            
                            // Check for typical send button indicators
                            const isSend = html.includes('m10 21l14 3') || text.includes('send') || html.includes('send') || aria.includes('send') || dataTestId.includes('send');
                            // Ensure it's not a stop generating button
                            const isNotStop = !html.includes('stop') && !text.includes('stop') && !aria.includes('stop');
                            
                            return isSend && isNotStop;
                        }) as HTMLButtonElement | HTMLDivElement;
                        
                        if (sendBtn && !(sendBtn as any).disabled) {
                            sendBtn.click();
                        }
                    });
                } catch (e) {
                    // Ignore errors during generic retry check
                }
            }

            // Execute the provider-specific extraction logic
            let currentText = (await this.page!.evaluate(evaluateFn)) as string;

            if (!currentText || currentText === "") {
                if (i > 0 && i % 5 === 0) console.log(`\n⚠️ [${this.id.toUpperCase()}] Waiting... (No text found yet. If stuck, the website DOM may have changed).`);
                continue;
            }

            if (currentText && currentText === previousTextToIgnore) {
                // The AI hasn't started generating the new response yet, still seeing the old one.
                if (i > 0 && i % 5 === 0) console.log(`\n⏳ [${this.id.toUpperCase()}] Still waiting for AI to start generating... (Seeing old response. Did the message send?)`);
                stableCount = 0;
                continue;
            }

            if (currentText && currentText === finalResponse) {
                const lowerText = finalResponse.trim().toLowerCase();
                
                // 1. Thinking Mode Check
                if (lowerText === 'thinking' || lowerText === 'thinking...' || lowerText === 'generating' || lowerText === 'generating...') {
                    if (stableCount % 5 === 0) console.log(`\n⏳ [${this.id.toUpperCase()}] AI is in Thinking Mode... Auto-waiting.`);
                    stableCount = 0;
                    continue;
                }

                // Smart Generation Check
                let isActivelyGenerating = false;
                if (isGeneratingFn) {
                    isActivelyGenerating = await isGeneratingFn();
                }

                // 2. Unclosed Tool Call Check (Only wait if we suspect it's still generating or we lack a clear UI signal)
                const hasUnclosedTool = finalResponse.includes('<tool_call>') && 
                                        !finalResponse.includes('</tool_call>') && 
                                        !finalResponse.includes('</function>') && 
                                        !finalResponse.includes('</tool>');

                if (hasUnclosedTool) {
                    if (isGeneratingFn && !isActivelyGenerating) {
                        // Check for 'Continue generating' button in the UI
                        let clickedContinue = false;
                        try {
                            clickedContinue = await this.page!.evaluate(() => {
                                const btns = Array.from(document.querySelectorAll('div[role="button"], button')) as HTMLElement[];
                                const continueBtn = btns.find(b => b.innerText.toLowerCase().includes('continue') || b.innerHTML.toLowerCase().includes('continue'));
                                if (continueBtn) {
                                    continueBtn.click();
                                    return true;
                                }
                                return false;
                            });
                        } catch (e) { /* ignore */ }

                        if (!clickedContinue) {
                            try {
                                console.log(`\n▶️ [${this.id.toUpperCase()}] Length limit hit. No continue button found, typing "continue" manually...`);
                                const textareaSelector = '#chat-input, textarea, [contenteditable], [placeholder*="Message"]';
                                const inputLocator = this.page!.locator(textareaSelector).filter({ visible: true }).last();
                                await inputLocator.click({ force: true, timeout: 2000 });
                                await this.page!.keyboard.type('continue');
                                await this.page!.keyboard.press('Enter');
                                clickedContinue = true;
                                // Small wait to let the UI register the send
                                await this.page!.waitForTimeout(1000);
                            } catch (e) { /* ignore */ }
                        }

                        if (clickedContinue) {
                            console.log(`\n▶️ [${this.id.toUpperCase()}] Resumed generation. Auto-waiting...`);
                            stableCount = 0;
                            continue;
                        }

                        // The UI says it's completely done and no continue button was found.
                        console.log(`\n⚠️ [${this.id.toUpperCase()}] AI stopped generating, but tool call appears unclosed. Proceeding anyway...`);
                    } else {
                        if (stableCount % 5 === 0) console.log(`\n⏳ [${this.id.toUpperCase()}] AI is typing a tool call (Paused)... Auto-waiting.`);
                        stableCount = 0;
                        continue;
                    }
                }

                // INSTANT BREAK OPTIMIZATION: If we see a completed tool_call, don't wait!
                if (finalResponse.includes('</tool_call>') || finalResponse.includes('</function>') || finalResponse.includes('</tool>')) {
                    if (!isActivelyGenerating) {
                        console.log(`\n⚡ [${this.id.toUpperCase()}] Tool execution finished. Bypassing stability wait for instant action!`);
                        break;
                    }
                }
                
                // 3. UI Generation State Check (Smart Wait)
                if (isActivelyGenerating) {
                    if (stableCount % 5 === 0) console.log(`\n⏳ [${this.id.toUpperCase()}] Web UI is actively generating... Auto-waiting.`);
                    stableCount = 0; // Reset stability, do not break!
                    continue;
                }
                
                stableCount++;
                if (stableCount >= stableSecondsRequired) {
                    break; // Text hasn't changed, generation is likely done!
                }
            } else {
                // Reset stability counter if text changed
                stableCount = 0;
                finalResponse = currentText || finalResponse;
            }
        }

        if (!finalResponse) {
            console.error(`❌ Could not extract text from ${this.id}. DOM changed or still thinking. Triggering fallbacks...`);
            throw new Error(`Could not extract text from ${this.id}. Still thinking or DOM changed.`);
        }

        return finalResponse;
    }

    /**
     * Helper to trigger healing if an explicit DOM action (like click or fill) fails.
     * Tries Level 1 (SmartLocator) first. If it fails, falls back to Level 2 (Doomsday Protocol).
     * Returns true if successfully healed and message sent.
     */
    protected async handleDomFailure(error: any, messageToSend?: string): Promise<boolean> {
        console.error(`[${this.id.toUpperCase()}] DOM interaction failed:`, error.message);
        
        if (this.page && messageToSend) {
            // Level 1: Zero-AI Heuristic Locator
            const { SmartLocator } = await import('../agent/smartLocator');
            const recovered = await SmartLocator.attemptSmartAction(this.page, messageToSend);
            if (recovered) {
                console.log(`[${this.id.toUpperCase()}] 🟢 Recovered via Level 1 SmartLocator!`);
                return true;
            }
        }

        // Level 2: AI OpenClaw Healer
        const { Healer } = await import('../agent/healer');
        if (this.page) {
            await Healer.triggerDoomsdayProtocol(this.id, this.page);
        }
        return false;
    }
}
