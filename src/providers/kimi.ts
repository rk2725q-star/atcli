import { BaseBrowserAdapter, ProviderResponse } from './baseBrowser';

export class KimiAdapter extends BaseBrowserAdapter {
    constructor() {
        // We use the URL provided by the user
        super('kimi', 'https://www.kimi.com/en');
    }

    public async init(): Promise<void> {
        await this.ensurePage();
        console.log(`\n[Kimi] Adapter initialized. Please ensure you are logged in.`);
    }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        await this.ensurePage();
        
        try {
            // Wait for textarea or contenteditable
            const inputSelector = 'textarea, [contenteditable="true"]';
            await this.page!.waitForSelector(inputSelector);
            
            // Capture the current last response so we can ignore it during polling
            const previousTextToIgnore = await this.page!.evaluate(() => {
                const blocks = document.querySelectorAll('.markdown-body, .markdown, [class*="markdown"], .prose');
                if (blocks.length > 0) {
                    const validBlocks = Array.from(blocks).filter(el => (el as HTMLElement).innerText.trim().length > 0);
                    if (validBlocks.length > 0) {
                        return (validBlocks[validBlocks.length - 1] as HTMLElement).innerText;
                    }
                }
                return "";
            });

            // Focus and clear input just to be safe. Use force: true to bypass any overlays/masks
            await this.page!.click(inputSelector, { force: true });
            await this.page!.waitForTimeout(200);
            await this.page!.keyboard.press('Control+A');
            await this.page!.keyboard.press('Backspace');
            
            // Insert the message text directly
            await this.page!.keyboard.insertText(message);
            await this.page!.waitForTimeout(500); // Wait for send button to become active

            // Try to click the send button if it exists, otherwise fallback to Enter
            try {
                // Kimi's send button usually has a send icon or specific label
                // Let's look for common send button selectors
                const sendBtn = this.page!.locator('button[aria-label*="Send"], button[aria-label*="send"], button[type="submit"], svg[viewBox="0 0 24 24"]').last();
                if (await sendBtn.isVisible({ timeout: 1000 })) {
                    await sendBtn.click();
                } else {
                    await this.page!.keyboard.press('Enter');
                }
            } catch {
                await this.page!.keyboard.press('Enter');
            }

            await this.page!.waitForTimeout(1000);

            // Poll for the response to finish generating
            const responseText = await this.pollForResponse(() => {
                const blocks = document.querySelectorAll('.markdown-body, .markdown, [class*="markdown"], .prose');
                if (blocks.length > 0) {
                    const validBlocks = Array.from(blocks).filter(el => (el as HTMLElement).innerText.trim().length > 0);
                    if (validBlocks.length > 0) {
                        return (validBlocks[validBlocks.length - 1] as HTMLElement).innerText;
                    }
                }
                return "";
            }, 60, 3, previousTextToIgnore);
            
            return { text: responseText.trim() };
        } catch (error: any) {
            return { text: '', error: error.message };
        }
    }
}
