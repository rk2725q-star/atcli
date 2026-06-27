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
            await this.waitForChatInput(inputSelector);
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

            // 1. Intelligently find the real visible input field
            const textareaSelector = '#chat-input, textarea, [contenteditable="true"]';
            const inputLocator = this.page!.locator(textareaSelector).filter({ visible: true }).last();

            try {
                // Force click to ensure it has physical focus
                await inputLocator.click({ force: true, timeout: 5000 });
            } catch (e) {
                console.log(`[DeepSeek] Click timeout. Forcing focus via evaluate...`);
            }

            console.log(`[DeepSeek] Typing message...`);

            // 2. Select all existing text
            await this.page!.keyboard.press('Control+A');

            // 3. Inject massive text natively via Playwright. This emits TRUSTED input events 
            // that React accepts perfectly, replacing the selection.
            await this.page!.keyboard.insertText(message);

            await this.page!.waitForTimeout(500);

            console.log(`[DeepSeek] Sending message...`);
            // DeepSeek usually sends on Enter
            await this.page!.keyboard.press('Enter');
            await this.page!.waitForTimeout(500);

            // Fallback click on send button if Enter didn't work
            await this.page!.evaluate(() => {
                const sendBtn = Array.from(document.querySelectorAll('div[role="button"], button')).find(el => el.innerHTML.includes('M10 21L14 3') || el.innerHTML.includes('send') || (el as any).innerText.includes('Send')) as HTMLElement;
                if (sendBtn) sendBtn.click();
            });

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
            }, 300, 3, previousTextToIgnore, async () => {
                return await this.page!.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
                    const stopBtn = buttons.find(b => b.innerText.toLowerCase().includes('stop') || b.innerHTML.includes('stop'));
                    if (stopBtn) return true;
                    return false;
                });
            });

            return { text: responseText.trim() };
        } catch (error: any) {
            console.error(`[DeepSeek] 🚨 Encountered error during message send. Falling back to Dual-Layer Safety Net!`);
            const recovered = await this.handleDomFailure(error, message);
            if (recovered) {
                // If Level 1 SmartLocator worked, it already typed and pressed send. We just need to poll for response!
                const responseText = await this.pollForResponse(() => {
                    const elements = document.querySelectorAll('.ds-markdown, .markdown-body, div[class*="markdown"]');
                    if (elements.length > 0) {
                        const lastEl = elements[elements.length - 1] as HTMLElement;
                        return lastEl.innerText;
                    }
                    return "";
                }, 300, 3, "", async () => {
                    return await this.page!.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
                        const stopBtn = buttons.find(b => b.innerText.toLowerCase().includes('stop') || b.innerHTML.includes('stop'));
                        if (stopBtn) return true;
                        return false;
                    });
                });
                return { text: responseText.trim() };
            }
            return { text: '', error: `DeepSeek provider failed: ${error.message}. Initiating Doomsday protocol...` };
        }
    }
}
