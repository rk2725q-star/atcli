import { Page } from 'playwright';

export interface ProviderResponse {
    text: string;
    error?: string;
}

export abstract class BaseBrowserAdapter {
    protected page: Page | null = null;
    
    constructor(public readonly id: string, public readonly url: string) {}

    public abstract init(): Promise<void>;
    public abstract sendMessage(message: string): Promise<ProviderResponse>;
    
    public reset(): void {
        this.page = null;
    }

    public async sendImageAndMessage(imagePath: string, message: string): Promise<ProviderResponse> {
        await this.ensurePage();
        console.log(`[${this.id.toUpperCase()}] Attempting to upload image ${imagePath}...`);
        try {
            // Universal fallback strategy for web LLMs: find the file input
            const fileInputs = this.page!.locator('input[type="file"]');
            const count = await fileInputs.count();
            if (count > 0) {
                console.log(`[${this.id.toUpperCase()}] Found ${count} file input(s). Injecting image into all...`);
                let uploaded = false;
                for (let i = 0; i < count; i++) {
                    try {
                        await fileInputs.nth(i).setInputFiles(imagePath);
                        uploaded = true;
                    } catch (err) {
                        // Ignore errors on specific inputs (some might be disabled or restricted)
                    }
                }
                if (uploaded) {
                    console.log(`[${this.id.toUpperCase()}] Image successfully injected. Waiting 5 seconds for UI processing...`);
                    await this.page!.waitForTimeout(5000);
                } else {
                    console.log(`[${this.id.toUpperCase()}] ⚠️ Found inputs but injection failed on all of them.`);
                }
            } else {
                console.log(`[${this.id.toUpperCase()}] ⚠️ No input[type="file"] found. Attempting DataTransfer Drag-and-Drop fallback...`);
                // Fallback: Inject the file using DataTransfer API directly onto the chat input area
                const fs = require('fs');
                const path = require('path');
                const mime = 'image/png';
                const buffer = fs.readFileSync(imagePath);
                const base64 = buffer.toString('base64');
                const filename = path.basename(imagePath);
                
                await this.page!.evaluate(
                    async ({ b64, mimeType, name }) => {
                        // Create a file object from base64
                        const res = await fetch(`data:${mimeType};base64,${b64}`);
                        const blob = await res.blob();
                        const file = new File([blob], name, { type: mimeType });
                        
                        // Create a DataTransfer object
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
                
                await new Promise<void>((resolve) => {
                    const readline = require('readline').createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    readline.question(`\n[${this.id.toUpperCase()}] Press ENTER here when you are done to resume... `, () => {
                        readline.close();
                        resolve();
                    });
                });
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
     */
    protected async pollForResponse(
        evaluateFn: any,
        maxWaitSeconds: number = 60,
        stableSecondsRequired: number = 3,
        previousTextToIgnore: string = ""
    ): Promise<string> {
        console.log(`[${this.id.toUpperCase()}] Waiting for response to complete...`);
        
        let finalResponse = "";
        let stableCount = 0;

        for (let i = 0; i < maxWaitSeconds; i++) {
            // Wait 1 second between polls
            await this.page!.waitForTimeout(1000);
            
            // Execute the provider-specific extraction logic
            let currentText = (await this.page!.evaluate(evaluateFn)) as string;

            if (!currentText || currentText === "") {
                continue;
            }

            if (currentText && currentText === previousTextToIgnore) {
                // The AI hasn't started generating the new response yet, still seeing the old one.
                stableCount = 0;
                continue;
            }

            if (currentText && currentText === finalResponse) {
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
