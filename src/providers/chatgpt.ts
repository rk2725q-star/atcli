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
            // 1. Wait for textarea
            const textareaSelector = '#prompt-textarea:visible, textarea:visible, [contenteditable="true"]:visible'; 
            await this.page!.waitForSelector(textareaSelector);

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

            await this.page!.fill(textareaSelector, message);
            
            try {
                // Click the send button instead of pressing Enter (since Enter just adds a newline for multiline text)
                await this.page!.waitForSelector('[data-testid="send-button"]', { state: 'visible', timeout: 3000 });
                await this.page!.click('[data-testid="send-button"]');
            } catch (e) {
                // Fallback
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
