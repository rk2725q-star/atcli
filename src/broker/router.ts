import { BaseBrowserAdapter } from '../providers/baseBrowser';
import { DeepSeekAdapter } from '../providers/deepseek';
import { ChatGPTAdapter } from '../providers/chatgpt';
import { GeminiAdapter } from '../providers/gemini';
import { QwenAdapter } from '../providers/qwen';
import { ZaiAdapter } from '../providers/zai';

export class PromptRouter {
    private adapters: Map<string, BaseBrowserAdapter> = new Map();

    constructor() {
        this.adapters.set('deepseek', new DeepSeekAdapter());
        this.adapters.set('chatgpt', new ChatGPTAdapter());
        this.adapters.set('gemini', new GeminiAdapter());
        this.adapters.set('qwen', new QwenAdapter());
        this.adapters.set('zai', new ZaiAdapter());
    }

    public getAdapter(providerId: string): BaseBrowserAdapter | undefined {
        return this.adapters.get(providerId);
    }

    public async route(providerId: string, message: string): Promise<string> {
        const adapter = this.adapters.get(providerId);
        if (!adapter) {
            return `❌ Error: Provider '${providerId}' is not configured or not supported yet.`;
        }

        try {
            await adapter.init();
            const response = await adapter.sendMessage(message);
            if (response.error) {
                return `❌ Provider Error: ${response.error}`;
            }
            return response.text;
        } catch (error: any) {
            return `❌ Routing Error: ${error.message}`;
        }
    }
}
