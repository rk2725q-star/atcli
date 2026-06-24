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
    
    protected async ensurePage(): Promise<void> {
        if (!this.page) {
            const { BrowserManager } = await import('../browser/manager');
            const manager = BrowserManager.getInstance();
            this.page = await manager.getOrCreatePage(this.id, this.url);
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
            const currentText = (await this.page!.evaluate(evaluateFn)) as string;

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

        return finalResponse || `❌ Could not extract text from ${this.id}. Still thinking or DOM changed.`;
    }
}
