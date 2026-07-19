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
        // DeepSeek throttles rapid-fire messages. We detect it in BOTH the
        // response text AND via DOM scanning for toast/popup notifications.
        const MAX_RATE_RETRIES = 6;
        const rateLimitWait = 4000; // flat 4s wait per user request

        // Pre-send delay: prevent rapid-fire message chains from triggering rate limits
        // Ensures minimum 2s gap between consecutive messages to DeepSeek
        const now = Date.now();
        const lastSend = (DeepSeekAdapter as any)._lastSendTime || 0;
        const timeSinceLast = now - lastSend;
        if (timeSinceLast < 2000) {
            const waitMs = 2000 - timeSinceLast;
            console.log(`\n⏳ [DeepSeek] Throttle guard: waiting ${waitMs}ms to prevent rate limit...`);
            await new Promise(r => setTimeout(r, waitMs));
        }
        (DeepSeekAdapter as any)._lastSendTime = Date.now();

        for (let attempt = 1; attempt <= MAX_RATE_RETRIES; attempt++) {
            const result = await this._sendMessageOnce(message);

            // Detect rate-limit in response text
            const responseLower = (result.text || '').toLowerCase();
            const errorLower = (result.error || '').toLowerCase();
            const isRateLimit =
                responseLower.includes('messages too frequent') ||
                responseLower.includes('too many requests') ||
                responseLower.includes('rate limit') ||
                responseLower.includes('please slow down') ||
                responseLower.includes('request limit') ||
                errorLower.includes('messages too frequent') ||
                errorLower.includes('rate limit') ||
                errorLower.includes('too many');

            // Also scan DOM for toast notifications containing rate-limit messages
            let domRateLimit = false;
            if (this.page && !isRateLimit) {
                try {
                    domRateLimit = await this.page.evaluate(() => {
                        const toasts = Array.from(document.querySelectorAll('[class*="toast"], [class*="alert"], [class*="message"], [class*="error"], [class*="tip"]'));
                        return toasts.some(el => {
                            const t = (el as HTMLElement).innerText?.toLowerCase() || '';
                            return t.includes('too frequent') || t.includes('too many') || t.includes('rate limit') || t.includes('slow down');
                        });
                    });
                } catch { /* ignore */ }
            }

            if (!isRateLimit && !domRateLimit) return result; // ✅ normal response

            // Rate-limited — wait and retry
            console.log(`\n⏳ [DeepSeek] Rate limited. Waiting ${rateLimitWait / 1000}s before retry ${attempt}/${MAX_RATE_RETRIES}...`);
            await this.page!.waitForTimeout(rateLimitWait);
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
            // Trigger React onChange state
            await this.page!.keyboard.press('Space');
            await this.page!.keyboard.press('Backspace');
            await this.page!.waitForTimeout(300);

            // Calculate bubble count AFTER history has loaded and right before sending
            const previousBubbleCount = await this.page!.evaluate(() => {
                const selectors = [
                    '.ds-markdown', 
                    '.markdown-body', 
                    'div[class*="markdown"]',
                    'div[class*="message"] div[class*="content"]',
                    'div[class*="chat-bubble"]'
                ];
                const count = document.querySelectorAll(selectors.join(', ')).length;
                (window as any)._previousBubbleCount = count;
                return count;
            });

            console.log(`[DeepSeek] Sending message...`);
            await this.page!.keyboard.press('Enter');
            await this.page!.waitForTimeout(300); // reduced from 500ms

            // Fallback click send button if Enter didn't work
            await this.page!.evaluate(() => {
                const sendBtn = Array.from(document.querySelectorAll('div[role="button"], button')).find(el => {
                    const html = el.innerHTML.toLowerCase();
                    const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
                    return (html.includes('send') || aria.includes('send') || html.includes('m10 21l14 3') || html.includes('circle') || html.includes('arrow')) && !html.includes('stop');
                }) as HTMLElement;
                if (sendBtn) sendBtn.click();
            });

            await this.page!.waitForTimeout(800); // brief wait for generation to start

            const responseText = await this.pollForResponse(() => {
                // Pass previousBubbleCount into the browser context
                const countThreshold = (window as any)._previousBubbleCount || 0;
                
                // Check for rate limit toasts first
                const toasts = Array.from(document.querySelectorAll('[class*="toast"], [class*="alert"], [class*="message"], [class*="error"], [class*="tip"]'));
                const isRateLimited = toasts.some(el => {
                    const t = (el as HTMLElement).innerText?.toLowerCase() || '';
                    return t.includes('too frequent') || t.includes('too many') || t.includes('rate limit') || t.includes('slow down');
                });
                if (isRateLimited) return '__RATE_LIMIT__';

                const selectors = [
                    '.ds-markdown', 
                    '.markdown-body', 
                    'div[class*="markdown"]',
                    'div[class*="message"] div[class*="content"]',
                    'div[class*="chat-bubble"]'
                ];
                const elements = document.querySelectorAll(selectors.join(', '));
                if (elements.length <= countThreshold) {
                    return ""; // Force wait until a new bubble appears!
                }
                const lastEl = elements[elements.length - 1] as HTMLElement;
                return lastEl.innerText;
            }, 300, 3, "", async () => {
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
                    const countThreshold = (window as any)._previousBubbleCount || 0;

                    const toasts = Array.from(document.querySelectorAll('[class*="toast"], [class*="alert"], [class*="message"], [class*="error"], [class*="tip"]'));
                    const isRateLimited = toasts.some(el => {
                        const t = (el as HTMLElement).innerText?.toLowerCase() || '';
                        return t.includes('too frequent') || t.includes('too many') || t.includes('rate limit') || t.includes('slow down');
                    });
                    if (isRateLimited) return '__RATE_LIMIT__';

                    const selectors = [
                        '.ds-markdown', 
                        '.markdown-body', 
                        'div[class*="markdown"]',
                        'div[class*="message"] div[class*="content"]',
                        'div[class*="chat-bubble"]'
                    ];
                    const elements = document.querySelectorAll(selectors.join(', '));
                    if (elements.length <= countThreshold) {
                        return ""; // Force wait
                    }
                    const lastEl = elements[elements.length - 1] as HTMLElement;
                    return lastEl.innerText;
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
