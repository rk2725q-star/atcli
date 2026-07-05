import { AgentProvider } from './interface';
import { DeepSeekAdapter } from './deepseek';
import { GeminiAdapter } from './gemini';
import { QwenAdapter } from './qwen';

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER POOL — Auto Mode's provider manager
// Holds DeepSeek, Gemini, Qwen — each with their own browser tab
// On-demand initialization: tabs open ONLY when first needed (lighter startup)
// Task routing: each provider assigned to tasks they're strongest at
// ─────────────────────────────────────────────────────────────────────────────

export type TaskType = 'research' | 'code' | 'design' | 'config' | 'verify' | 'general';

interface PoolEntry {
    provider: AgentProvider;
    taskTypes: TaskType[];
    initialized: boolean;
}

// Provider strength matrix
const PROVIDER_STRENGTHS: Record<string, TaskType[]> = {
    deepseek: ['research', 'code', 'general'],  // native search, strong reasoning
    gemini:   ['design', 'verify'],              // vision-strong, best for screenshots
    qwen:     ['config', 'code'],                // fast, good for secondary files
};

export class ProviderPool {
    private static instance: ProviderPool;
    private pool: Map<string, PoolEntry> = new Map();

    private constructor() {
        this.pool.set('deepseek', {
            provider: new DeepSeekAdapter(),
            taskTypes: PROVIDER_STRENGTHS.deepseek,
            initialized: false,
        });
        this.pool.set('gemini', {
            provider: new GeminiAdapter(),
            taskTypes: PROVIDER_STRENGTHS.gemini,
            initialized: false,
        });
        this.pool.set('qwen', {
            provider: new QwenAdapter(),
            taskTypes: PROVIDER_STRENGTHS.qwen,
            initialized: false,
        });
    }

    public static getInstance(): ProviderPool {
        if (!ProviderPool.instance) {
            ProviderPool.instance = new ProviderPool();
        }
        return ProviderPool.instance;
    }

    public async getBestProvider(taskType: TaskType): Promise<AgentProvider> {
        for (const [id, entry] of this.pool.entries()) {
            if (entry.taskTypes.includes(taskType)) {
                return this._ensureInit(id, entry);
            }
        }
        return this.getProvider('deepseek');
    }

    public async getProvider(id: string): Promise<AgentProvider> {
        const entry = this.pool.get(id);
        if (!entry) throw new Error(`[ProviderPool] Unknown provider: ${id}`);
        return this._ensureInit(id, entry);
    }

    public async getAllProviders(): Promise<{ id: string; provider: AgentProvider }[]> {
        const result: { id: string; provider: AgentProvider }[] = [];
        for (const [id, entry] of this.pool.entries()) {
            result.push({ id, provider: await this._ensureInit(id, entry) });
        }
        return result;
    }

    public getProviderIds(): string[] {
        return Array.from(this.pool.keys());
    }

    private async _ensureInit(id: string, entry: PoolEntry): Promise<AgentProvider> {
        if (!entry.initialized) {
            console.log(`[ProviderPool] Initializing ${id.toUpperCase()} tab (on-demand)...`);
            await entry.provider.init();
            entry.initialized = true;
            console.log(`[ProviderPool] ✅ ${id.toUpperCase()} ready.`);
        }
        return entry.provider;
    }

    public resetAll(): void {
        for (const entry of this.pool.values()) {
            if (entry.provider.reset) entry.provider.reset();
        }
    }

    public abortAll(): void {
        for (const entry of this.pool.values()) {
            if (entry.provider.abort) entry.provider.abort();
        }
    }
}
