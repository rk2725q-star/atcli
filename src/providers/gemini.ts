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
            console.log(`[Gemini] Waiting for input field to appear...`);
            await this.page!.waitForSelector(inputSelector, { timeout: 15000 }).catch(e => {
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
            await this.page!.evaluate((msg) => {
                const el = document.querySelector('rich-textarea p, rich-textarea, .ql-editor, textarea, [contenteditable="true"]') as HTMLElement;
                if (el) {
                    el.focus();
                    
                    const dataTransfer = new DataTransfer();
                    dataTransfer.setData('text/plain', msg);
                    const pasteEvent = new ClipboardEvent('paste', {
                        clipboardData: dataTransfer,
                        bubbles: true,
                        cancelable: true
                    });
                    
                    el.dispatchEvent(pasteEvent);
                    
                    const textEvent = new Event('textInput', { bubbles: true }) as any;
                    textEvent.data = msg;
                    el.dispatchEvent(textEvent);
                    
                    el.dispatchEvent(new Event('input', { bubbles: true }));
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
