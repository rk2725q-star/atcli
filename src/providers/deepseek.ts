import { BaseBrowserAdapter, ProviderResponse } from './baseBrowser';

export class DeepSeekAdapter extends BaseBrowserAdapter {
    constructor() {
        super('deepseek', 'https://chat.deepseek.com');
    }

    public async init(): Promise<void> {
        await this.ensurePage();
        console.log(`\n[DeepSeek] Adapter initialized. Please ensure you are logged in on the browser window.`);
    }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        await this.ensurePage();
        
        try {
            const inputSelector = '#chat-input, textarea, [contenteditable="true"]';
            console.log(`[DeepSeek] Waiting for input field to appear...`);
            await this.page!.waitForSelector(inputSelector, { timeout: 15000 }).catch(e => {
                throw new Error("Could not find DeepSeek input field. Are you logged in or is the page stuck?");
            });
            console.log(`[DeepSeek] Input field found!`);

            const previousTextToIgnore = await this.page!.evaluate(() => {
                const elements = document.querySelectorAll('.ds-markdown, .markdown-body, div[class*="markdown"]');
                if (elements.length > 0) {
                    const lastEl = elements[elements.length - 1] as HTMLElement;
                    return lastEl.innerText;
                }
                return "";
            });

            console.log(`[DeepSeek] Attempting to click input field...`);
            // Focus the input safely to trigger event listeners
            const inputLocator = this.page!.locator(inputSelector).first();
            await inputLocator.click({ force: true });
            await this.page!.waitForTimeout(200);
            
            console.log(`[DeepSeek] Typing message...`);
            // Clear existing text if any
            await this.page!.keyboard.press('Control+A');
            await this.page!.keyboard.press('Backspace');
            
            // Insert the message text directly
            await this.page!.keyboard.insertText(message);
            await this.page!.waitForTimeout(500);

            console.log(`[DeepSeek] Sending message...`);
            // Wait for and click send button
            await this.page!.keyboard.press('Enter');

            // 3. Wait for response generation
            // Deepseek's text generation takes time. We wait for the specific AI response element to appear.
            // Wait a brief moment for the generation to start
            await this.page!.waitForTimeout(1000);
            
            const responseText = await this.pollForResponse(() => {
                const elements = document.querySelectorAll('.ds-markdown, .markdown-body, div[class*="markdown"]');
                if (elements.length > 0) {
                    const lastEl = elements[elements.length - 1] as HTMLElement;
                    return lastEl.innerText;
                }
                return "";
            }, 60, 3, previousTextToIgnore);
            
            return { text: responseText.trim() };
        } catch (error: any) {
            return { text: '', error: error.message };
        }
    }
}
