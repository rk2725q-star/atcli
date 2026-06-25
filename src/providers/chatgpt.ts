import { BaseBrowserAdapter, ProviderResponse } from './baseBrowser';

export class ChatGPTAdapter extends BaseBrowserAdapter {
    constructor() {
        super('chatgpt', 'https://chatgpt.com');
    }

    public async init(): Promise<void> {
        await this.ensurePage();
        console.log(`\n[ChatGPT] Adapter initialized. Please ensure you are logged in on the browser window.`);
    }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        await this.ensurePage();
        
        try {
            console.log(`[ChatGPT] Waiting for input field to appear...`);
            const textareaSelector = '#prompt-textarea, textarea, [contenteditable="true"]';
            const inputLocator = this.page!.locator(textareaSelector).filter({ visible: true }).last();
            
            await inputLocator.waitFor({ state: 'visible', timeout: 15000 }).catch(e => {
                throw new Error("Could not find ChatGPT input field. Are you logged in?");
            });

            const previousTextToIgnore = await this.page!.evaluate(() => {
                const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
                if (assistantMessages.length > 0) {
                    return (assistantMessages[assistantMessages.length - 1] as HTMLElement).innerText;
                }
                const markdownBlocks = document.querySelectorAll('.markdown');
                if (markdownBlocks.length > 0) {
                    return (markdownBlocks[markdownBlocks.length - 1] as HTMLElement).innerText;
                }
                return "";
            });

            console.log(`[ChatGPT] Typing message...`);
            
            // 1. Force click the verified visible element to ensure it has physical focus
            await inputLocator.click({ force: true });
            await this.page!.waitForTimeout(200);

            // 2. Clear existing text
            await this.page!.keyboard.press('Control+A');
            await this.page!.keyboard.press('Backspace');

            // 3. Inject massive text instantaneously using native execCommand 
            await this.page!.evaluate((msg) => {
                // Native insertion at the cursor (works perfectly on ProseMirror and avoids React crashes)
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

            console.log(`[ChatGPT] Sending message...`);
            try {
                const sendBtn = this.page!.locator('[data-testid="send-button"]').filter({ visible: true }).first();
                await sendBtn.waitFor({ state: 'visible', timeout: 3000 });
                await sendBtn.click({ force: true });
            } catch (e) {
                // Fallback
                await this.page!.evaluate(() => {
                    const btn = document.querySelector('[data-testid="send-button"]') as HTMLElement;
                    if (btn) btn.click();
                });
                await this.page!.keyboard.press('Enter');
            }

            // 3. Wait for response generation to finish
            // ChatGPT takes time to generate. We wait a bit to let it start.
            await this.page!.waitForTimeout(1000);

            const responseText = await this.pollForResponse(() => {
                // ChatGPT assistant messages usually have a specific data attribute
                const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
                if (assistantMessages.length > 0) {
                    const lastMessage = assistantMessages[assistantMessages.length - 1] as HTMLElement;
                    return lastMessage.innerText;
                }
                
                // Fallback: look for markdown blocks
                const markdownBlocks = document.querySelectorAll('.markdown');
                if (markdownBlocks.length > 0) {
                    const lastEl = markdownBlocks[markdownBlocks.length - 1] as HTMLElement;
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
