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
            // 1. Wait for textarea (using a highly robust selector for chat inputs)
            const textareaSelector = '#chat-input:visible, textarea:visible, [contenteditable="true"]:visible, .ant-input:visible'; 
            await this.page!.waitForSelector(textareaSelector);

            const previousTextToIgnore = await this.page!.evaluate(() => {
                const elements = document.querySelectorAll('.ds-markdown, .markdown-body, div[class*="markdown"]');
                if (elements.length > 0) {
                    const lastEl = elements[elements.length - 1] as HTMLElement;
                    return lastEl.innerText;
                }
                return "";
            });

            await this.page!.fill(textareaSelector, message);

            // 2. Wait for and click send button
            // Usually it's a div/button adjacent to textarea, or we can just press Enter
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
