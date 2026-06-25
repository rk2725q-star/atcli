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
            const textareaSelector = '#prompt-textarea, textarea, [contenteditable="true"]'; 
            
            console.log(`[ChatGPT] Waiting for input field to appear...`);
            await this.page!.waitForSelector(textareaSelector, { timeout: 15000 }).catch(e => {
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
            
            // Use evaluate to guarantee the value is set. ChatGPT uses ProseMirror which ignores direct .value mutations.
            // Dispatching a synthetic 'paste' event is the most robust way to insert massive prompts into rich-text editors.
            await this.page!.evaluate((msg) => {
                const el = document.querySelector('#prompt-textarea, [contenteditable="true"]') as HTMLElement;
                if (el) {
                    el.focus();
                    
                    // Create synthetic paste event
                    const dataTransfer = new DataTransfer();
                    dataTransfer.setData('text/plain', msg);
                    const pasteEvent = new ClipboardEvent('paste', {
                        clipboardData: dataTransfer,
                        bubbles: true,
                        cancelable: true
                    });
                    
                    // Dispatch paste
                    el.dispatchEvent(pasteEvent);
                    
                    // Fallback to textInput event if paste was ignored
                    const textEvent = new Event('textInput', { bubbles: true }) as any;
                    textEvent.data = msg;
                    el.dispatchEvent(textEvent);
                    
                    // Trigger input event to be safe
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, message);

            await this.page!.waitForTimeout(500);

            console.log(`[ChatGPT] Sending message...`);
            try {
                // Click the send button instead of pressing Enter
                await this.page!.waitForSelector('[data-testid="send-button"]', { state: 'visible', timeout: 3000 });
                await this.page!.click('[data-testid="send-button"]', { force: true });
            } catch (e) {
                // Fallback
                await this.page!.evaluate(() => {
                    const sendBtn = document.querySelector('[data-testid="send-button"]') as HTMLElement;
                    if (sendBtn) sendBtn.click();
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
