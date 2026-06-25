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
            const inputSelector = 'rich-textarea p, rich-textarea, .ql-editor, textarea, [contenteditable="true"]';
            console.log(`[Gemini] Waiting for input field to appear...`);
            const inputLocator = this.page!.locator(inputSelector).filter({ visible: true }).last();
            await inputLocator.waitFor({ state: 'visible', timeout: 15000 }).catch(e => {
                throw new Error("Could not find Gemini input field. Are you logged in?");
            });
            
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

            console.log(`[Gemini] Typing message...`);
            
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

            await this.page!.waitForTimeout(500); // Wait for send button to become active

            console.log(`[Gemini] Sending message...`);
            // Try to find and click the exact Send button. 
            // If we can't find it, fallback to Enter.
            try {
                const sendBtn = this.page!.locator('button[aria-label="Send message"], button[aria-label="Send prompt"]').first();
                if (await sendBtn.isVisible({ timeout: 1000 })) {
                    // Check if it's not disabled
                    const isDisabled = await sendBtn.isDisabled();
                    if (!isDisabled) {
                        await sendBtn.click({ force: true });
                    } else {
                        await this.page!.keyboard.press('Enter');
                    }
                } else {
                    await this.page!.keyboard.press('Enter');
                }
            } catch (e) {
                await this.page!.evaluate(() => {
                    const sendBtn = document.querySelector('button[aria-label="Send message"], button[aria-label="Send prompt"]') as HTMLElement;
                    if (sendBtn) sendBtn.click();
                });
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
