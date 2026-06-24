import { BaseBrowserAdapter, ProviderResponse } from './baseBrowser';

export class ZaiAdapter extends BaseBrowserAdapter {
    constructor() {
        super('zai', 'https://chat.z.ai');
    }

    public async init(): Promise<void> {
        await this.ensurePage();
        console.log(`\n[Z.ai] Adapter initialized. Please ensure you are logged in.`);
    }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        await this.ensurePage();
        
        try {
            // 1. Wait for textarea
            const textareaSelector = 'textarea:visible, [contenteditable="true"]:visible'; 
            await this.page!.waitForSelector(textareaSelector);
            
            const previousTextToIgnore = await this.page!.evaluate(() => {
                const markdownBlocks = document.querySelectorAll('.prose, .markdown-body, div[class*="markdown"]');
                if (markdownBlocks.length > 0) {
                    return (markdownBlocks[markdownBlocks.length - 1] as HTMLElement).innerText;
                }
                return "";
            });

            await this.page!.fill(textareaSelector, message);
            await this.page!.keyboard.press('Enter');

            await this.page!.waitForTimeout(1000);
            const responseText = await this.pollForResponse(() => {
                const markdownBlocks = document.querySelectorAll('.prose, .markdown-body, div[class*="markdown"]');
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
