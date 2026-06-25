import { Page } from 'playwright';

export class SmartLocator {
    
    /**
     * Attempts to heuristically find the chat input box and send the message,
     * without relying on any hardcoded CSS selectors or AI.
     */
    public static async attemptSmartAction(page: Page, message: string): Promise<boolean> {
        console.log('[SMART LOCATOR] 🔍 Scanning DOM heuristically for chat interfaces...');

        try {
            // 1. Locate the Input Field
            const inputFound = await this.findAndFillInput(page, message);
            if (!inputFound) {
                console.log('[SMART LOCATOR] ⚠️ Could not heuristically identify the chat input field.');
                return false;
            }

            // Wait a moment for React/Vue to process the input
            await page.waitForTimeout(500);

            // 2. Try to submit via Enter key first (most common)
            console.log('[SMART LOCATOR] ⌨️ Attempting to send via Enter key...');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1000);

            // 3. Optional: Look for a Send Button if Enter didn't trigger a change
            // This can be enhanced by checking if the input field is still focused or contains text.
            const inputStillHasText = await page.evaluate(() => {
                const activeEl = document.activeElement as any;
                if (!activeEl) return false;
                return (activeEl.value && activeEl.value.length > 0) || (activeEl.innerText && activeEl.innerText.length > 0);
            });

            if (inputStillHasText) {
                console.log('[SMART LOCATOR] 🖱️ Enter key failed. Searching for Send Button heuristically...');
                const buttonClicked = await this.findAndClickSendButton(page);
                if (!buttonClicked) {
                    console.log('[SMART LOCATOR] ⚠️ Could not heuristically identify the send button.');
                    return false;
                }
            }

            console.log('[SMART LOCATOR] ✅ Successfully injected message using heuristics!');
            return true;

        } catch (e: any) {
            console.log(`[SMART LOCATOR] ❌ Smart fallback failed: ${e.message}`);
            return false;
        }
    }

    private static async findAndFillInput(page: Page, message: string): Promise<boolean> {
        // Execute heuristic logic inside the browser
        const targetHandle = await page.evaluateHandle(() => {
            // Priority 1: contenteditable="true" (often used by ChatGPT, Notion, etc.)
            const editableElements = Array.from(document.querySelectorAll('[contenteditable="true"]'))
                .filter((el: any) => el.offsetParent !== null); // must be visible
            
            if (editableElements.length > 0) {
                // If multiple, pick the lowest one on the screen (chat boxes are usually at bottom)
                return editableElements.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
            }

            // Priority 2: Textareas with chat-related hints
            const textareas = Array.from(document.querySelectorAll('textarea'))
                .filter((el: any) => el.offsetParent !== null);
            
            if (textareas.length > 0) {
                const hintTextareas = textareas.filter(el => {
                    const id = el.id.toLowerCase();
                    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                    const ph = (el.getAttribute('placeholder') || '').toLowerCase();
                    return id.includes('chat') || id.includes('prompt') || 
                           aria.includes('message') || aria.includes('prompt') ||
                           ph.includes('message') || ph.includes('ask');
                });

                if (hintTextareas.length > 0) {
                    return hintTextareas.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
                }
                
                // Fallback: just return the bottom-most visible textarea
                return textareas.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
            }

            return null;
        });

        if (!targetHandle || await targetHandle.jsonValue() === null) {
            return false;
        }

        // We found an element heuristically!
        console.log('[SMART LOCATOR] 🎯 Heuristic input match found. Focusing...');
        await targetHandle.asElement()?.click({ force: true });
        await page.waitForTimeout(200);

        await page.keyboard.press('Control+A');
        await page.keyboard.insertText(message);
        
        await targetHandle.dispose();
        return true;
    }

    private static async findAndClickSendButton(page: Page): Promise<boolean> {
        const buttonHandle = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button, [role="button"], div[role="button"]'))
                .filter((el: any) => el.offsetParent !== null); // visible
            
            // Priority 1: SVG Path containing "M10 21L14 3" (the standard paper plane SVG)
            for (const btn of buttons) {
                if (btn.innerHTML.includes('M10 21L14 3') || btn.innerHTML.includes('M2 21l21-9L2 3v7l15 2-15 2v7z')) {
                    return btn;
                }
            }

            // Priority 2: Keyword match in ARIA or innerText
            for (const btn of buttons) {
                const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
                if (aria.includes('send') || aria.includes('submit') || 
                    text.includes('send') || text.includes('submit')) {
                    return btn;
                }
            }

            return null;
        });

        if (!buttonHandle || await buttonHandle.jsonValue() === null) {
            return false;
        }

        console.log('[SMART LOCATOR] 🎯 Heuristic send button found. Clicking...');
        await buttonHandle.asElement()?.click({ force: true });
        await buttonHandle.dispose();
        return true;
    }
}
