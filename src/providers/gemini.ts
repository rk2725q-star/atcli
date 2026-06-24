import { BaseBrowserAdapter, ProviderResponse } from './baseBrowser';

export class GeminiAdapter extends BaseBrowserAdapter {
    constructor() {
        super('gemini', 'https://gemini.google.com/app');
    }

    public async init(): Promise<void> {
        await this.ensurePage();
        console.log(`\n[Gemini] Adapter initialized. Please ensure you are logged in.`);
    }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        await this.ensurePage();
        
        try {
            // Gemini uses a contenteditable div for input (rich-textarea)
            const inputSelector = 'rich-textarea p, rich-textarea, .ql-editor, textarea';
            await this.page!.waitForSelector(inputSelector);
            
            const previousTextToIgnore = await this.page!.evaluate(() => {
                const responseBlocks = document.querySelectorAll('.model-response-text, message-content, [data-test-id="model-message"]');
                if (responseBlocks.length > 0) {
                    return (responseBlocks[responseBlocks.length - 1] as HTMLElement).innerText;
                }
                const markdownBlocks = document.querySelectorAll('.markdown');
                if (markdownBlocks.length > 0) {
                    return (markdownBlocks[markdownBlocks.length - 1] as HTMLElement).innerText;
                }
                return "";
            });

            // Focus the input safely to trigger event listeners in contenteditable
            await this.page!.click(inputSelector);
            await this.page!.waitForTimeout(200);
            
            // Clear existing text if any
            await this.page!.keyboard.press('Control+A');
            await this.page!.keyboard.press('Backspace');
            
            // Insert the message text directly
            await this.page!.keyboard.insertText(message);
            await this.page!.waitForTimeout(500); // Wait for send button to become active

            // Try to find and click the exact Send button. 
            // If we can't find it, fallback to Enter.
            try {
                const sendBtn = this.page!.locator('button[aria-label="Send message"], button[aria-label="Send prompt"]').first();
                if (await sendBtn.isVisible({ timeout: 1000 })) {
                    // Check if it's not disabled
                    const isDisabled = await sendBtn.isDisabled();
                    if (!isDisabled) {
                        await sendBtn.click();
                    } else {
                        await this.page!.keyboard.press('Enter');
                    }
                } else {
                    await this.page!.keyboard.press('Enter');
                }
            } catch (e) {
                await this.page!.keyboard.press('Enter');
            }

            await this.page!.waitForTimeout(1000);
            const responseText = await this.pollForResponse(() => {
                const responseBlocks = document.querySelectorAll('.model-response-text, message-content, [data-test-id="model-message"]');
                if (responseBlocks.length > 0) {
                    return (responseBlocks[responseBlocks.length - 1] as HTMLElement).innerText;
                }
                
                // Fallback
                const markdownBlocks = document.querySelectorAll('.markdown');
                if (markdownBlocks.length > 0) {
                    return (markdownBlocks[markdownBlocks.length - 1] as HTMLElement).innerText;
                }

                return "";
            }, 60, 3, previousTextToIgnore);
            
            return { text: responseText.trim() };
        } catch (error: any) {
            return { text: '', error: error.message };
        }
    }
}
