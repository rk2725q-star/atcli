import { BaseBrowserAdapter, ProviderResponse } from './baseBrowser';

export class QwenAdapter extends BaseBrowserAdapter {
    constructor() {
        super('qwen', 'https://chat.qwen.ai');
    }

    public async init(): Promise<void> {
        await this.ensurePage();
        console.log(`\n[Qwen] Adapter initialized. Please ensure you are logged in.`);
    }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        await this.ensurePage();

        try {
            const textareaSelector = 'textarea, [contenteditable="true"]';
            console.log(`[Qwen] Waiting for input field to appear...`);
            await this.waitForChatInput(textareaSelector);
            const inputLocator = this.page!.locator(textareaSelector).filter({ visible: true }).last();

            // Capture the current last response so we can ignore it during polling
            const previousTextToIgnore = await this.page!.evaluate(() => {
                const blocks = document.querySelectorAll('.markdown-body, .markdown, [class*="markdown"]');
                if (blocks.length > 0) {
                    const validBlocks = Array.from(blocks).filter(el => (el as HTMLElement).innerText.trim().length > 0);
                    if (validBlocks.length > 0) {
                        return (validBlocks[validBlocks.length - 1] as HTMLElement).innerText;
                    }
                }
                return "";
            });

            console.log(`[Qwen] Typing message...`);

            // 1. Force click the verified visible element to ensure physical focus
            await inputLocator.click({ force: true });
            await this.page!.waitForTimeout(200);

            // 2. Select all existing text
            await this.page!.keyboard.press('Control+A');

            // 3. Inject massive text natively via Playwright. This emits TRUSTED input events
            await this.page!.keyboard.insertText(message);

            // Give the site's React state a moment to realize text was entered
            await this.page!.waitForTimeout(500);

            console.log(`[Qwen] Sending message...`);
            await this.page!.keyboard.press('Enter');
            await this.page!.waitForTimeout(1000);

            // Fallback: forcefully click the likely "Send" button ONLY if the input still contains text
            // If the input is empty, Enter worked, so do NOT click anything (might click Stop Generating!)
            await this.page!.evaluate(() => {
                const input = document.querySelector('textarea, [contenteditable="true"]') as HTMLElement;
                const hasText = input && (input.innerText?.trim().length > 0 || (input as HTMLTextAreaElement).value?.trim().length > 0);
                
                if (hasText) {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    // Send button is usually near the input or the last button
                    const sendBtn = buttons[buttons.length - 1];
                    if (sendBtn) {
                        sendBtn.click();
                    }
                }
            });

            await this.page!.waitForTimeout(1000);

            const responseText = await this.pollForResponse(() => {
                // Handle Qwen's A/B testing popup
                if (document.body.innerText.includes('Which response do you prefer?')) {
                    const allNodes = Array.from(document.querySelectorAll('*'));
                    const response1Header = allNodes.find(n => n.textContent?.trim() === 'Response 1' && n.children.length === 0);
                    if (response1Header) {
                        (response1Header as HTMLElement).click();
                        return ""; // Loop will retry and pick up the resolved markdown
                    }
                }

                // Qwen's actual answer is inside a markdown wrapper, usually separate from the "think" block
                const blocks = document.querySelectorAll('.markdown-body, .markdown, [class*="markdown"]');
                if (blocks.length > 0) {
                    const validBlocks = Array.from(blocks).filter(el => (el as HTMLElement).innerText.trim().length > 0);
                    if (validBlocks.length > 0) {
                        return (validBlocks[validBlocks.length - 1] as HTMLElement).innerText;
                    }
                }

                // Fallback to content blocks
                const contentBlocks = document.querySelectorAll('[class*="message-content"], [class*="chat-content"]');
                const validBlocks = Array.from(contentBlocks).filter(el => {
                    const t = (el as HTMLElement).innerText.trim();
                    // Ignore blocks that are just the "think" UI or user prompt
                    const hasParagraph = el.querySelector('p') !== null;
                    return t.length > 0 && hasParagraph && !t.includes("AI-generated content");
                });

                if (validBlocks.length > 0) {
                    return (validBlocks[validBlocks.length - 1] as HTMLElement).innerText;
                }
                return "";
            }, 300, 3, previousTextToIgnore, async () => {
                // Check if Qwen is still generating (e.g. Stop button exists or Send is disabled)
                return await this.page!.evaluate(() => {
                    // 🚨 Auto-resolve A/B Test blocking popup
                    const preferBtns = Array.from(document.querySelectorAll('button, div[role="button"]')).filter(b => 
                        (b as HTMLElement).innerText.includes('I prefer this response')
                    );
                    if (preferBtns.length > 0) {
                        (preferBtns[0] as HTMLElement).click();
                        return true; // Consider it 'generating' while it processes the click
                    }

                    const buttons = Array.from(document.querySelectorAll('button'));
                    const stopBtn = buttons.find(b => b.innerText.toLowerCase().includes('stop') || b.innerHTML.includes('stop'));
                    if (stopBtn) return true;
                    return false;
                });
            });

            return { text: responseText.trim() };
        } catch (error: any) {
            if ((global as any).abortRequested) {
                return { text: '', error: `Execution context was destroyed (aborted)` };
            }
            console.error(`[Qwen] 🚨 Encountered error during message send. Falling back to Doomsday Healer!`);
            await this.handleDomFailure(error);
            return { text: '', error: `Qwen provider failed: ${error.message}. Initiating autonomous healing...` };
        }
    }
}
