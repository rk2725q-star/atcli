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
            const textareaSelector = 'textarea, [contenteditable="true"]'; 
            console.log(`[Z.ai] Waiting for input field to appear...`);
            await this.page!.waitForSelector(textareaSelector, { timeout: 15000 }).catch(e => {
                throw new Error("Could not find Z.ai input field. Are you logged in?");
            });
            
            const previousTextToIgnore = await this.page!.evaluate(() => {
                const markdownBlocks = document.querySelectorAll('.prose, .markdown-body, div[class*="markdown"]');
                if (markdownBlocks.length > 0) {
                    return (markdownBlocks[markdownBlocks.length - 1] as HTMLElement).innerText;
                }
                return "";
            });

            console.log(`[Z.ai] Typing message...`);
            await this.page!.evaluate((msg) => {
                const el = document.querySelector('textarea, [contenteditable="true"]') as any;
                if (el) {
                    el.focus();
                    if (el.value !== undefined) {
                        el.value = msg;
                    } else {
                        el.innerText = msg;
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, message);
            
            await this.page!.waitForTimeout(500);

            console.log(`[Z.ai] Sending message...`);
            await this.page!.keyboard.press('Enter');
            
            // Fallback click on send button
            await this.page!.evaluate(() => {
                const sendBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerHTML.includes('send') || (el as any).innerText.includes('Send')) as HTMLElement;
                if (sendBtn) sendBtn.click();
            });

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
