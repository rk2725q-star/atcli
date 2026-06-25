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
            const inputLocator = this.page!.locator(textareaSelector).filter({ visible: true }).last();
            await inputLocator.waitFor({ state: 'visible', timeout: 15000 }).catch(e => {
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
            
            // 1. Force click the verified visible element to ensure physical focus
            await inputLocator.click({ force: true });
            await this.page!.waitForTimeout(200);

            // 2. Clear existing text
            await this.page!.keyboard.press('Control+A');
            await this.page!.keyboard.press('Backspace');

            // 3. Inject massive text instantaneously using native execCommand
            await this.page!.evaluate((msg) => {
                const success = document.execCommand('insertText', false, msg);
                
                if (!success) {
                    const el = document.activeElement as any;
                    if (el) {
                        if (el.value !== undefined) el.value = msg;
                        else el.innerText = msg;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
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
