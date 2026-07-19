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
                        const toasts = Array.from(document.querySelectorAll('[class*="toast"], [class*="alert"], [class*="notice"], [class*="notification"], .ant-message, .el-message'));
                        return toasts.some(el => {
                            const t = (el as HTMLElement).innerText?.toLowerCase() || '';
                            return t.includes('too frequent') || t.includes('too many requests') || t.includes('rate limit') || t.includes('slow down');
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

            // Calculate bubble count AND capture previous text for ignore-filter
            const previousCountAndText = await this.page!.evaluate(() => {
                const selectors = [
                    '.ds-markdown', 
                    '.ds-markdown--answer',
                    '.markdown-body', 
                    '.message-content',
                    'div[class*="markdown"]',
                    'div[class*="response"]',
                    'div[class*="message"]',
                    'div[class*="answer"]'
                ];
                const elements = document.querySelectorAll(selectors.join(', '));
                const validElements = Array.from(elements).filter(el => (el as HTMLElement).innerText.trim().length > 10);
                
                let lastText = '';
                if (validElements.length > 0) {
                    lastText = (validElements[validElements.length - 1] as HTMLElement).innerText.trim();
                }
                
                (window as any)._previousBubbleCount = validElements.length;
                (window as any)._previousLastText = lastText;
                
                return { count: validElements.length, lastText };
            });

            const previousTextToIgnore = previousCountAndText.lastText;

            console.log(`[DeepSeek] Sending message...`);
            await this.page!.keyboard.press('Enter');
            await this.page!.waitForTimeout(300);

            // Fallback click send button if Enter didn't work
            await this.page!.evaluate(() => {
                const sendBtn = Array.from(document.querySelectorAll('div[role="button"], button')).find(el => {
                    const html = el.innerHTML.toLowerCase();
                    const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
                    return (html.includes('send') || aria.includes('send') || html.includes('m10 21l14 3') || html.includes('circle') || html.includes('arrow')) && !html.includes('stop');
                }) as HTMLElement;
                if (sendBtn) sendBtn.click();
            });

            await this.page!.waitForTimeout(800);

            const responseText = await this.pollForResponse(() => {
                const countThreshold = (window as any)._previousBubbleCount || 0;
                const previousText = (window as any)._previousLastText || '';
                
                // Check for rate limit toasts first
                const toasts = Array.from(document.querySelectorAll('[class*="toast"], [class*="alert"], [class*="notice"], [class*="notification"], .ant-message, .el-message'));
                const isRateLimited = toasts.some(el => {
                    const t = (el as HTMLElement).innerText?.toLowerCase() || '';
                    return t.includes('too frequent') || t.includes('too many requests') || t.includes('rate limit') || t.includes('slow down');
                });
                if (isRateLimited) return '__RATE_LIMIT__';

                // ── TIER 1: Known DeepSeek selectors (primary) ─────────────────
                const knownSelectors = [
                    '.ds-markdown', 
                    '.ds-markdown--answer',
                    '.markdown-body', 
                    '.message-content',
                    'div[class*="markdown"]',
                    'div[class*="response"]',
                    'div[class*="message"]',
                    'div[class*="answer"]',
                    'div[class*="chat"]',
                    'div[class*="conversation"]',
                    'div[class*="bubble"]'
                ];
                let allElements = Array.from(document.querySelectorAll(knownSelectors.join(', ')));
                let validElements = allElements.filter(el => (el as HTMLElement).innerText.trim().length > 10);
                
                // ── TIER 2: DOM-agnostic fallback — scan ALL divs for AI response patterns ─
                if (validElements.length === 0) {
                    // Get all divs on the page with substantial text content
                    const divs = document.querySelectorAll('div');
                    const textRichDivs = Array.from(divs).filter(div => {
                        const t = (div as HTMLElement).innerText.trim();
                        // AI responses are typically long, have paragraphs/code blocks, and are NOT the textarea
                        const hasCode = div.querySelector('pre, code, .hljs, [class*="code"]') !== null;
                        const hasParagraphs = div.querySelectorAll('p').length > 0;
                        const length = t.length;
                        // Heuristic: AI response divs have >100 chars OR contain code/paragraphs
                        return length > 100 || (length > 30 && (hasCode || hasParagraphs));
                    });
                    // Find the LAST text-rich div — this is usually the most recent response
                    if (textRichDivs.length > 0) {
                        // Sort by DOM position (later elements = lower in the page)
                        const last = textRichDivs[textRichDivs.length - 1] as HTMLElement;
                        validElements = [last];
                        allElements = [last];
                    }
                }
                
                // ── TIER 3: Sibling-diff approach — find new text since last capture ─
                if (validElements.length === 0 || validElements.length <= countThreshold) {
                    // Try getting the entire page text and diff against cached
                    const fullText = document.body.innerText || '';
                    const cachedFullText = (window as any)._cachedFullPageText || '';
                    
                    if (fullText.length > cachedFullText.length && fullText !== cachedFullText) {
                        // New text appeared on page — extract the NEW portion only
                        const newText = fullText.substring(cachedFullText.length).trim();
                        (window as any)._cachedFullPageText = fullText;
                        
                        if (newText.length > 5 && newText !== previousText) {
                            return newText;
                        }
                    }
                    // Cache for next check
                    if (!(window as any)._cachedFullPageText || fullText.length > (window as any)._cachedFullPageText.length) {
                        (window as any)._cachedFullPageText = fullText;
                    }
                }
                
                if (validElements.length === 0 || validElements.length <= countThreshold) {
                    // If countThreshold is 0 (fresh page) and we have elements, read them
                    if (countThreshold === 0 && validElements.length > 0) {
                        const lastEl = validElements[validElements.length - 1] as HTMLElement;
                        const text = lastEl.innerText.trim();
                        if (text === previousText) return '';
                        return text;
                    }
                    return ''; // Force wait
                }
                
                const lastEl = validElements[validElements.length - 1] as HTMLElement;
                return lastEl.innerText;
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
            if (error.message === 'RATE_LIMIT_DETECTED') {
                return { text: '', error: 'RATE_LIMIT_DETECTED' };
            }
            console.error(`[DeepSeek] 🚨 DOM error. Falling back to Dual-Layer Safety Net!`);
            const recovered = await this.handleDomFailure(error, message);
            if (recovered) {
                const responseText = await this.pollForResponse(() => {
                    const countThreshold = (window as any)._previousBubbleCount || 0;

                    const toasts = Array.from(document.querySelectorAll('[class*="toast"], [class*="alert"], [class*="notice"], [class*="notification"], .ant-message, .el-message'));
                    const isRateLimited = toasts.some(el => {
                        const t = (el as HTMLElement).innerText?.toLowerCase() || '';
                        return t.includes('too frequent') || t.includes('too many requests') || t.includes('rate limit') || t.includes('slow down');
                    });
                    if (isRateLimited) return '__RATE_LIMIT__';

                    // Extended selectors for robustness
                    const selectors = [
                        '.ds-markdown', 
                        '.ds-markdown--answer',
                        '.markdown-body', 
                        '.message-content',
                        'div[class*="markdown"]',
                        'div[class*="response"]',
                        'div[class*="message"]',
                        'div[class*="answer"]'
                    ];
                    const elements = document.querySelectorAll(selectors.join(', '));
                    const validElements = Array.from(elements).filter(el => (el as HTMLElement).innerText.trim().length > 10);
                    
                    if (validElements.length <= countThreshold) {
                        if (countThreshold === 0 && validElements.length > 0) {
                            return (validElements[validElements.length - 1] as HTMLElement).innerText;
                        }
                        return '';
                    }
                    return (validElements[validElements.length - 1] as HTMLElement).innerText;
                }, 300, 3, '', async () => {
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