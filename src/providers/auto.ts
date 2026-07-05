import { AgentProvider, ProviderResponse } from './interface';
import { ProviderPool, TaskType } from './pool';

// ─────────────────────────────────────────────────────────────────────────────
// AUTO MODE PROVIDER — drop-in AgentProvider that routes to the best available
// provider based on task context, and enables true parallel execution.
//
// Implements AgentProvider interface so it works everywhere a provider is used:
//   ✅ Hermes planning → DeepSeek (primary, has search)
//   ✅ Vision tasks    → Gemini (vision-strong)
//   ✅ Parallel builds → All providers simultaneously via sendParallel()
// ─────────────────────────────────────────────────────────────────────────────

export interface ParallelTask {
    taskType: TaskType;
    message: string;
    providerId?: string;       // override pool routing with specific provider
}

export interface ParallelResult {
    providerId: string;
    taskType: TaskType;
    description?: string;
    response: ProviderResponse;
}

export class AutoModeProvider implements AgentProvider {
    public readonly id = 'auto';
    private pool: ProviderPool;
    private primaryProvider: AgentProvider | null = null;

    constructor() {
        this.pool = ProviderPool.getInstance();
    }

    public async init(): Promise<void> {
        console.log('\n🤖 [AUTO MODE] Initializing primary provider (DeepSeek)...');
        // Only DeepSeek is pre-warmed — others open on-demand when tasks need them
        this.primaryProvider = await this.pool.getProvider('deepseek');
        console.log('✅ [AUTO MODE] Primary provider (DeepSeek) ready. Others load on-demand.');
        console.log('💡 [AUTO MODE] Providers: DeepSeek (code/research) + Gemini (design/verify) + Qwen (config)');
    }

    // Standard single-provider path — routes to DeepSeek for Hermes planning
    public async sendMessage(message: string): Promise<ProviderResponse> {
        if (!this.primaryProvider) await this.init();
        return this.primaryProvider!.sendMessage(message);
    }

    // Vision path — always routes to Gemini (vision-strong)
    public async sendImageAndMessage(imageSource: string, message: string): Promise<ProviderResponse> {
        const gemini = await this.pool.getProvider('gemini');
        if (gemini.sendImageAndMessage) {
            return gemini.sendImageAndMessage(imageSource, message);
        }
        // Fallback: embed image in message text
        return gemini.sendMessage(`[Image provided as base64]\n${message}`);
    }

    public reset(): void {
        this.primaryProvider?.reset?.();
    }

    // ── PARALLEL SEND — the core of Auto Mode ───────────────────────────────
    // Sends different tasks to different providers SIMULTANEOUSLY via Promise.all
    // Each task goes to the best provider for that task type
    // Returns results in the same order as input tasks
    public async sendParallel(tasks: ParallelTask[]): Promise<ParallelResult[]> {
        const taskDescriptions = tasks.map(t => `[${(t.providerId || t.taskType).toUpperCase()}]`).join(', ');
        console.log(`\n⚡ [AUTO MODE] Sending ${tasks.length} tasks in PARALLEL: ${taskDescriptions}`);

        const results = await Promise.all(tasks.map(async (task): Promise<ParallelResult> => {
            let provider: AgentProvider;
            let providerId: string;

            if (task.providerId) {
                provider = await this.pool.getProvider(task.providerId);
                providerId = task.providerId;
            } else {
                provider = await this.pool.getBestProvider(task.taskType);
                providerId = provider.id;
            }

            console.log(`  → [${providerId.toUpperCase()}] handling ${task.taskType}...`);
            const response = await provider.sendMessage(task.message);
            console.log(`  ✅ [${providerId.toUpperCase()}] ${task.taskType} complete.`);

            return { providerId, taskType: task.taskType, response };
        }));

        console.log(`✅ [AUTO MODE] All ${tasks.length} parallel tasks finished.`);
        return results;
    }

    /** Get the pool for direct provider access (used by AutoModeOrchestrator) */
    public getPool(): ProviderPool { return this.pool; }
}
