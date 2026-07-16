import { AgentProvider } from '../providers/interface';
import { ChatGPTAdapter } from '../providers/chatgpt';
import { DeepSeekAdapter } from '../providers/deepseek';
import { DeepSeekApiAdapter } from '../providers/deepseek-api';
import { GeminiAdapter } from '../providers/gemini';
import { QwenAdapter } from '../providers/qwen';
import { KimiAdapter } from '../providers/kimi';
import { ZaiAdapter } from '../providers/zai';
import { OllamaApiAdapter } from '../providers/ollama';
import { AutoModeProvider } from '../providers/auto';
import { NvidiaApiProvider } from '../providers/nvidia';
import { ApiKeyStore } from '../providers/api-key-store';

export class PromptRouter {
    private adapters: Map<string, AgentProvider> = new Map();
    private nvidiaProvider: NvidiaApiProvider;

    constructor() {
        // ── DeepSeek: API adapter if key set, browser scraper as fallback ──
        const dsKey = ApiKeyStore.get('deepseek') || ApiKeyStore.get('deepseek-api');
        if (dsKey) {
            const dsApi = new DeepSeekApiAdapter('deepseek', 'deepseek-chat');
            this.adapters.set('deepseek', dsApi);
            this.adapters.set('deepseek-api', dsApi);
            this.adapters.set('deepseek-chat', dsApi);
            // deepseek-reasoner (R1 model)
            const dsR1 = new DeepSeekApiAdapter('deepseek-r1', 'deepseek-reasoner');
            this.adapters.set('deepseek-r1', dsR1);
            this.adapters.set('deepseek-reasoner', dsR1);
            console.log(`\x1b[90m[Router] DeepSeek: using API adapter (deepseek-chat + deepseek-reasoner)\x1b[0m`);
        } else {
            // No API key — fall back to browser scraper
            this.adapters.set('deepseek', new DeepSeekAdapter());
            console.log(`\x1b[90m[Router] DeepSeek: using browser (run /api deepseek <key> for faster API mode)\x1b[0m`);
        }

        // ── Other browser-session providers ───────────────────────────────
        this.adapters.set('chatgpt',  new ChatGPTAdapter());
        this.adapters.set('gemini',   new GeminiAdapter());
        this.adapters.set('qwen',     new QwenAdapter());
        this.adapters.set('kimi',     new KimiAdapter());
        this.adapters.set('zai',      new ZaiAdapter());
        this.adapters.set('z.ai',     new ZaiAdapter());

        // ── Auto Mode — parallel multi-provider ───────────────────────────
        this.adapters.set('auto', new AutoModeProvider());

        // ── Local Ollama API ──────────────────────────────────────────────
        this.adapters.set('ollama',      new OllamaApiAdapter('ollama',      'qwen3-vl:2b'));
        this.adapters.set('local',       new OllamaApiAdapter('local',       'qwen3-vl:2b'));
        this.adapters.set('qwen-local',  new OllamaApiAdapter('qwen-local',  'qwen3-vl:2b'));

        // ── NVIDIA NIM API ─────────────────────────────────────────────────
        this.nvidiaProvider = new NvidiaApiProvider('nvidia');
        this.adapters.set('nvidia', this.nvidiaProvider);
    }

    public getAdapter(providerId: string): AgentProvider | undefined {
        return this.adapters.get(providerId.toLowerCase());
    }

    /** Dynamically update the NVIDIA model without recreating the provider */
    public setNvidiaModel(model: string): void {
        this.nvidiaProvider.setModel(model);
    }

    public getNvidiaProvider(): NvidiaApiProvider {
        return this.nvidiaProvider;
    }

    public setLocalModel(providerId: string, model: string): void {
        const adapter = this.adapters.get(providerId.toLowerCase());
        if (!adapter) return;
        if (typeof (adapter as any).setModel === 'function') {
            (adapter as any).setModel(model);
        }
    }

    public getLocalProvider(providerId: string): AgentProvider | undefined {
        return this.adapters.get(providerId.toLowerCase());
    }

    public async route(providerId: string, message: string): Promise<string> {
        const adapter = this.adapters.get(providerId.toLowerCase());
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
