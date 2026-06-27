import { BaseBrowserAdapter, ProviderResponse } from './baseBrowser';

export class ZaiAdapter extends BaseBrowserAdapter {
    constructor() {
        super('zai', 'https://chat.z.ai');
    }

    public async init(): Promise<void> {
        await this.ensurePage();
        console.log(`\n[Z.ai] Adapter initialized. Please ensure you are logged in.`);
    }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        await this.ensurePage();

        try {
            const textareaSelector = 'textarea, [contenteditable="true"]';
            console.log(`[Z.ai] Waiting for input field to appear...`);
            await this.waitForChatInput(textareaSelector);
            const inputLocator = this.page!.locator(textareaSelector).filter({ visible: true }).last();

            const previousTextToIgnore = await this.page!.evaluate(() => {
                const markdownBlocks = document.querySelectorAll('.prose, .markdown-body, div[class*="markdown"]');
                if (markdownBlocks.length > 0) {
                    return (markdownBlocks[markdownBlocks.length - 1] as HTMLElement).innerText;
                }
                return "";
            });

            console.log(`[Z.ai] Typing message...`);

            // 1. Force click the verified visible element to ensure physical focus
            await inputLocator.click({ force: true });
            await this.page!.waitForTimeout(200);

            // 2. Select all existing text
            await this.page!.keyboard.press('Control+A');

            // 3. Inject massive text natively via Playwright. This emits TRUSTED input events
            await this.page!.keyboard.insertText(message);

            await this.page!.waitForTimeout(500);

            console.log(`[Z.ai] Sending message...`);
            await this.page!.keyboard.press('Enter');

            // Fallback click on send button
            await this.page!.evaluate(() => {
                const sendBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerHTML.includes('send') || (el as any).innerText.includes('Send')) as HTMLElement;
                if (sendBtn) sendBtn.click();
            });

            await this.page!.waitForTimeout(1000);
            const responseText = await this.pollForResponse(() => {
                const markdownBlocks = document.querySelectorAll('.prose, .markdown-body, div[class*="markdown"]');
                if (markdownBlocks.length > 0) {
                    return (markdownBlocks[markdownBlocks.length - 1] as HTMLElement).innerText;
                }
                return "";
            }, 60, 3, previousTextToIgnore);

            return { text: responseText.trim() };
        } catch (error: any) {
            console.error(`[Zai] 🚨 Encountered error during message send. Falling back to Doomsday Healer!`);
            await this.handleDomFailure(error);
            return { text: '', error: `Zai provider failed: ${error.message}. Initiating autonomous healing...` };
        }
    }
}
