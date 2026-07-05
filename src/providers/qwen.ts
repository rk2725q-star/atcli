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

                // Qwen sometimes splits a single response into MULTIPLE .markdown-body elements 
                // (e.g., separate blocks for 'Thinking' and the actual response).
                // To get the full text of the LAST turn without truncating, we find the last message container.
                const messageContainers = document.querySelectorAll('[class*="message"], [class*="chat-content"], [class*="msg"]');
                if (messageContainers.length > 0) {
                    // Filter to only containers that HAVE a markdown block inside them (identifies them as AI messages)
                    const aiContainers = Array.from(messageContainers).filter(el => {
                        return el.querySelector('.markdown-body, .markdown, [class*="markdown"]') !== null;
                    });
                    
                    if (aiContainers.length > 0) {
                        // The last one in document order will be the innermost container of the LAST AI turn.
                        const lastAiTurn = aiContainers[aiContainers.length - 1] as HTMLElement;
                        const text = lastAiTurn.innerText.trim();
                        if (text.length > 0) return text;
                    }
                }

                // Fallback if the container strategy fails
                const blocks = document.querySelectorAll('.markdown-body, .markdown, [class*="markdown"]');
                if (blocks.length > 0) {
                    const validBlocks = Array.from(blocks).filter(el => (el as HTMLElement).innerText.trim().length > 0);
                    if (validBlocks.length > 0) {
                        return (validBlocks[validBlocks.length - 1] as HTMLElement).innerText;
                    }
                }

                return "";
            }, 300, 3, previousTextToIgnore, async () => {
                // Check if Qwen is still generating (e.g. Stop button exists or Send is disabled)
                return await this.page!.evaluate(() => {
                    // 🚨 Auto-resolve A/B Test blocking popup intelligently
                    const preferBtns = Array.from(document.querySelectorAll('button, div[role="button"]')).filter(b => 
                        (b as HTMLElement).innerText.includes('I prefer this response')
                    );
                    if (preferBtns.length > 0) {
                        let bestBtn = preferBtns[0]; // Default to first
                        
                        // Check which response actually followed the rules (contains <tool_call>)
                        for (const btn of preferBtns) {
                            let parent = btn.parentElement;
                            let hasTool = false;
                            // Traverse up to find the container holding the response text
                            for (let i = 0; i < 6; i++) {
                                if (parent) {
                                    const text = parent.innerText;
                                    if (text.includes('<tool_call>') || text.includes('```xml')) {
                                        hasTool = true;
                                        break;
                                    }
                                    parent = parent.parentElement;
                                }
                            }
                            if (hasTool) {
                                bestBtn = btn;
                                break;
                            }
                        }
                        
                        (bestBtn as HTMLElement).click();
                        return true; // Consider it 'generating' while it processes the click
                    }

                    const buttons = Array.from(document.querySelectorAll('button'));
                    const stopBtn = buttons.find(b => b.innerText.toLowerCase().includes('stop') || b.innerHTML.includes('stop'));
                    if (stopBtn) return true;
                    return false;
                });
            });

            // Intercept Qwen-specific server/network UI error messages
            if (responseText.includes('The current content is empty, please regenerate.')) {
                throw new Error('Qwen UI Error: "The current content is empty, please regenerate." - The server dropped the response. Please manually click regenerate or refresh the page.');
            }

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
