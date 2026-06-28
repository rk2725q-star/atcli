import { AgentProvider } from '../providers/interface';
import { ChatGPTAdapter } from '../providers/chatgpt';
import { DeepSeekAdapter } from '../providers/deepseek';
import { GeminiAdapter } from '../providers/gemini';
import { QwenAdapter } from '../providers/qwen';
import { KimiAdapter } from '../providers/kimi';
import { ZaiAdapter } from '../providers/zai';
import { OllamaApiAdapter } from '../providers/ollama';

export class PromptRouter {
    private adapters: Map<string, AgentProvider> = new Map();

    constructor() {
        // Register available providers
        this.adapters.set('chatgpt', new ChatGPTAdapter());
        this.adapters.set('deepseek', new DeepSeekAdapter());
        this.adapters.set('gemini', new GeminiAdapter());
        this.adapters.set('qwen', new QwenAdapter());
        this.adapters.set('kimi', new KimiAdapter());
        this.adapters.set('zai', new ZaiAdapter());
        this.adapters.set('z.ai', new ZaiAdapter());
        
        // Local Models via Ollama API
        this.adapters.set('ollama', new OllamaApiAdapter('ollama', 'qwen3-vl:2b'));
        this.adapters.set('local', new OllamaApiAdapter('local', 'qwen3-vl:2b'));
        this.adapters.set('qwen-local', new OllamaApiAdapter('qwen-local', 'qwen3-vl:2b'));
    }

    public getAdapter(providerId: string): AgentProvider | undefined {
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
