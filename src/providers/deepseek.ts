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
        // ── Rate-limit retry loop (Fix: "Messages too frequent") ─────────────
        // DeepSeek throttles rapid fire messages. On detection, wait and retry.
        const MAX_RATE_RETRIES = 4;
        let rateLimitWait = 6000; // start at 6s, double each retry

        for (let attempt = 1; attempt <= MAX_RATE_RETRIES; attempt++) {
            const result = await this._sendMessageOnce(message);

            // Detect rate-limit in response text
            const isRateLimit = result.text?.toLowerCase().includes('messages too frequent') ||
                                result.text?.toLowerCase().includes('too many requests') ||
                                result.error?.toLowerCase().includes('messages too frequent');

            if (!isRateLimit) return result; // ✅ normal response — return immediately

            // Rate-limited — wait and retry
            console.log(`\n⏳ [DeepSeek] Rate limited ("Messages too frequent"). Waiting ${rateLimitWait / 1000}s before retry ${attempt}/${MAX_RATE_RETRIES}...`);
            await this.page!.waitForTimeout(rateLimitWait);
            rateLimitWait = Math.min(rateLimitWait * 2, 30000); // cap at 30s
        }

        return { text: '', error: 'DeepSeek: Rate limit persists after retries. Try again in a minute.' };
    }

    private async _sendMessageOnce(message: string): Promise<ProviderResponse> {
        await this.ensurePage();

        try {
            const inputSelector = '#chat-input, textarea, [contenteditable], [placeholder*="Message"]';
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

            const textareaSelector = '#chat-input, textarea, [contenteditable], [placeholder*="Message"]';
            const inputLocator = this.page!.locator(textareaSelector).filter({ visible: true }).last();

            try {
                await inputLocator.click({ force: true, timeout: 5000 });
            } catch (e) {
                console.log(`[DeepSeek] Click timeout. Forcing focus via evaluate...`);
            }

            console.log(`[DeepSeek] Typing message...`);
            await this.page!.keyboard.press('Control+A');
            await this.page!.keyboard.insertText(message);
            await this.page!.waitForTimeout(300); // reduced from 500ms

            console.log(`[DeepSeek] Sending message...`);
            await this.page!.keyboard.press('Enter');
            await this.page!.waitForTimeout(300); // reduced from 500ms

            // Fallback click send button if Enter didn't work
            await this.page!.evaluate(() => {
                const sendBtn = Array.from(document.querySelectorAll('div[role="button"], button')).find(el =>
                    el.innerHTML.includes('M10 21L14 3') || el.innerHTML.includes('send') || (el as any).innerText.includes('Send')
                ) as HTMLElement;
                if (sendBtn) sendBtn.click();
            });

            await this.page!.waitForTimeout(800); // brief wait for generation to start

            const responseText = await this.pollForResponse(() => {
                const elements = document.querySelectorAll('.ds-markdown, .markdown-body, div[class*="markdown"]');
                if (elements.length > 0) {
                    const lastEl = elements[elements.length - 1] as HTMLElement;
                    return lastEl.innerText;
                }
                return "";
            }, 300, 3, previousTextToIgnore, async () => {
                return await this.page!.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('div[role="button"], button')) as HTMLElement[];
                    const stopBtn = buttons.find(b => b.innerText.toLowerCase().includes('stop') || b.innerHTML.includes('stop'));
                    return !!stopBtn;
                });
            });

            return { text: responseText.trim() };
        } catch (error: any) {
            if ((global as any).abortRequested) {
                return { text: '', error: `Execution context was destroyed (aborted)` };
            }
            console.error(`[DeepSeek] 🚨 DOM error. Falling back to Dual-Layer Safety Net!`);
            const recovered = await this.handleDomFailure(error, message);
            if (recovered) {
                const responseText = await this.pollForResponse(() => {
                    const elements = document.querySelectorAll('.ds-markdown, .markdown-body, div[class*="markdown"]');
                    if (elements.length > 0) {
                        const lastEl = elements[elements.length - 1] as HTMLElement;
                        return lastEl.innerText;
                    }
                    return "";
                }, 300, 3, "", async () => {
                    return await this.page!.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('div[role="button"], button')) as HTMLElement[];
                        const stopBtn = buttons.find(b => b.innerText.toLowerCase().includes('stop') || b.innerHTML.includes('stop'));
                        return !!stopBtn;
                    });
                });
                return { text: responseText.trim() };
            }
            return { text: '', error: `DeepSeek provider failed: ${error.message}` };
        }
    }
}
