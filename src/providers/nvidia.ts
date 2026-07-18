import { AgentProvider, ProviderResponse } from './interface';
import { ApiKeyStore } from './api-key-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { maskSecretsString } from '../utils/secrets';
import { SkillManager } from '../agent/skillManager';
import { Agent } from 'undici';

// ── HTTP Keep-Alive Connection Pool ──────────────────────────────────────────
// Reuses TLS connections to NVIDIA servers, saving 300-500ms TTFT per request.
const keepAliveAgent = new Agent({
    keepAliveTimeout: 60_000, // Keep connection alive for 60s
    keepAliveMaxTimeout: 300_000,
    connections: 10
});

// ─────────────────────────────────────────────────────────────────────────────
// NVIDIA NIM Provider — v2 Smart Architecture
// API: https://integrate.api.nvidia.com/v1  (OpenAI-compatible)
// Docs: https://docs.api.nvidia.com
//
// Features:
//  - Dynamic model list from GET /v1/models
//  - Sliding-window RPM scheduler (true 60s rolling window per key)
//  - Dual-key rotation: warm at 38 RPM, swap at 40 RPM, 429 → instant swap
//  - Persistent conversation memory (messages[] never cleared between turns)
//  - 180k token context window: auto-trims oldest messages to stay under limit
//  - Full system prompt (same as browser providers — Gatekeeper, skills, etc.)
//  - Secret masking before any request leaves the machine
//  - Secret masking before any request leaves the machine
// ─────────────────────────────────────────────────────────────────────────────

const NVIDIA_BASE_URL    = 'https://integrate.api.nvidia.com/v1';
const CHAT_ENDPOINT      = `${NVIDIA_BASE_URL}/chat/completions`;
const MODELS_ENDPOINT    = `${NVIDIA_BASE_URL}/models`;
const DEFAULT_MODEL      = 'minimaxai/minimax-m3';
const DEFAULT_MAX_OUTPUT = 4096;   // Default max output tokens
const CONTEXT_HEADROOM   = 0.85;   // Use 85% of context window, reserve 15% for response

// ── Per-Model Context Window Registry ────────────────────────────────────────
// NVIDIA NIM models each have different context limits.
// Source: https://docs.api.nvidia.com + https://build.nvidia.com/explore/reasoning
// Format: 'model-id': context_tokens
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    // MiniMax
    'minimaxai/minimax-m3':                         1_000_000,
    // Meta Llama
    'meta/llama-3.1-405b-instruct':                   128_000,
    'meta/llama-3.3-70b-instruct':                    128_000,
    'meta/llama-3.1-70b-instruct':                    128_000,
    'meta/llama-3.1-8b-instruct':                     128_000,
    'meta/llama-3.2-90b-vision-instruct':             128_000,
    'meta/llama-3.2-11b-vision-instruct':             128_000,
    'meta/llama-4-scout-17b-16e-instruct':          1_048_576,
    'meta/llama-4-maverick-17b-128e-instruct':      1_048_576,
    // DeepSeek
    'deepseek-ai/deepseek-r1':                         64_000,
    'deepseek-ai/deepseek-r1-distill-qwen-32b':        32_000,
    'deepseek-ai/deepseek-r1-distill-llama-8b':         8_000,
    'deepseek-ai/deepseek-r1-0528':                    64_000,
    // NVIDIA
    'nvidia/llama-3.1-nemotron-70b-instruct':          128_000,
    'nvidia/nemotron-4-340b-instruct':                  4_096,
    // Qwen
    'qwen/qwen3-coder-480b-a35b-instruct':              32_000,
    'qwen/qwen3-235b-a22b-instruct':                    32_000,
    'qwen/qwq-32b':                                     32_000,
    'qwen/qwen2.5-72b-instruct':                       128_000,
    'qwen/qwen2.5-coder-32b-instruct':                 128_000,
    // Moonshot / Kimi
    'moonshotai/kimi-k2-instruct':                   1_000_000,
    // Google
    'google/gemma-3-27b-it':                           128_000,
    'google/gemma-3-12b-it':                           128_000,
    // Mistral
    'mistralai/mistral-large-2-instruct':              128_000,
    'mistralai/mixtral-8x22b-instruct-v0.1':            64_000,
    'mistralai/mistral-7b-instruct-v0.3':               32_000,
    // Microsoft
    'microsoft/phi-4-multimodal-instruct':             128_000,
    'microsoft/phi-3-medium-128k-instruct':            128_000,
    // IBM Granite
    'ibm/granite-3.3-8b-instruct':                     128_000,
    'ibm/granite-3.3-2b-instruct':                     128_000,
    // Writer
    'writer/palmyra-x5':                               128_000,
    // THUDM
    'thudm/glm-4-9b-chat':                             128_000,
    'thudm/glm-z1-rumination-32b':                     128_000,
};

/** Get context window for a model. Falls back to 128k if unknown. */
function getModelContextWindow(modelId: string): number {
    // Exact match first
    if (MODEL_CONTEXT_WINDOWS[modelId]) return MODEL_CONTEXT_WINDOWS[modelId];
    // Partial match (handles future model versions like 'meta/llama-3.1-70b-instruct-v2')
    for (const [key, val] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
        if (modelId.startsWith(key.split(':')[0])) return val;
    }
    console.log(`[NVIDIA] ⚠️  Unknown model '${modelId}' — assuming 128k context window.`);
    return 128_000; // Safe default for most NVIDIA models
}
const RPM_WINDOW_MS      = 60_000;   // Sliding window = 60 seconds
const RPM_WARN_THRESHOLD = 35;       // Log warning at 35 RPM
const RPM_HARD_LIMIT     = 40;       // Emergency swap at 40 RPM (NVIDIA free tier limit)
const KEY_COOLDOWN_MS    = 62_000;   // After a 429, rest key for 62s (slightly over 60s for safety)
const SWAP_AFTER_N       = 20;       // Round-robin: swap key every N completed requests

// Models that support reasoning (emit reasoning_content in stream deltas)
// We use partial matching, so 'deepseek-r1' matches all its distill versions.
const REASONING_MODELS = [
    'deepseek-r1',
    'deepseek-v4',
    'nemotron',
    'qwen3',
    'qwq',
    'minimax-m3',
    'kimi',
    'glm-z1-rumination',
    'glm-5'
];

// Conversation memory file: one per project dir, per provider
function getMemoryPath(projectDir: string): string {
    const dir = path.join(projectDir, '.atcli-tmp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'nvidia_conversation.json');
}

interface ConversationMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// ── Sliding-Window RPM Tracker ────────────────────────────────────────────────
// Tracks real timestamps in a 60-second rolling window per API key.
// No fixed counters — counts actual requests in the last 60 seconds.
export class SlidingWindowRPM {
    private timestamps: number[] = [];

    /** Record one request now */
    record(): void {
        const now = Date.now();
        this.timestamps.push(now);
        this.evict();
    }

    /** Count requests in the last 60s */
    count(): number {
        this.evict();
        return this.timestamps.length;
    }

    /** How many ms until the oldest request leaves the 60s window (= next free slot) */
    msUntilSlot(): number {
        this.evict();
        if (this.timestamps.length === 0) return 0;
        const oldest = this.timestamps[0];
        return Math.max(0, oldest + RPM_WINDOW_MS - Date.now());
    }

    /** Compact visual bar for terminal status display */
    bar(): string {
        const used = this.count();
        const total = RPM_HARD_LIMIT;
        const filled = Math.round((used / total) * 20);
        return '█'.repeat(filled) + '░'.repeat(20 - filled);
    }

    private evict(): void {
        const cutoff = Date.now() - RPM_WINDOW_MS;
        while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
            this.timestamps.shift();
        }
    }
}

// ── Dual-Key Round-Robin Scheduler ──────────────────────────────────────────
// Primary swap mode: round-robin every SWAP_AFTER_N (20) completed requests.
// Emergency swaps: HTTP 429 → instant swap + 62s cooldown on that key.
//                  RPM >= 40 → emergency swap regardless of count.
// Each key rests while the other key is active → full 60s cooldown between bursts.
export class NvidiaKeyScheduler {
    private keyRPM: Record<string, SlidingWindowRPM> = {
        nvidia:  new SlidingWindowRPM(),
        nvidia2: new SlidingWindowRPM(),
    };
    private restUntil: Record<string, number> = { nvidia: 0, nvidia2: 0 };
    private activeKeyId: 'nvidia' | 'nvidia2' = 'nvidia';
    private queue: Array<() => Promise<void>> = [];
    private running = false;
    // Round-robin counter — how many requests completed on the current key
    private requestsOnCurrentKey = 0;

    getActiveKeyId(): 'nvidia' | 'nvidia2' { return this.activeKeyId; }

    /** Called when a 429 is received — immediately rest this key, swap now */
    on429(keyId: string): void {
        this.restUntil[keyId] = Date.now() + KEY_COOLDOWN_MS;
        console.log(`\n[NVIDIA] ⚡ ${keyId} rate-limited (429). Resting ${KEY_COOLDOWN_MS/1000}s.`);
        this.swapKey();
    }

    /** Get the resolved API key string for the current active key */
    resolveApiKey(): string | null {
        return ApiKeyStore.get(this.activeKeyId);
    }

    /**
     * Pre-flight check before every request:
     * 1. If active key is resting → try to swap
     * 2. If active key RPM >= 40 → swap
     * 3. If active key RPM >= 38 → warn, continue (next request may trigger swap)
     */
    async preflightCheck(): Promise<void> {
        // Check if active key is resting (from a previous 429)
        if (Date.now() < this.restUntil[this.activeKeyId]) {
            const ms = this.restUntil[this.activeKeyId] - Date.now();
            const other = this.activeKeyId === 'nvidia' ? 'nvidia2' : 'nvidia';
            const otherKey = ApiKeyStore.get(other);
            if (otherKey && Date.now() >= this.restUntil[other]) {
                console.log(`\n[NVIDIA] Resting key detected. Swapping to ${other}.`);
                this.swapKey();
            } else {
                // Both keys resting — wait for the one with the shortest remaining rest
                const wait = Math.min(
                    Math.max(0, this.restUntil['nvidia'] - Date.now()),
                    Math.max(0, this.restUntil['nvidia2'] - Date.now())
                );
                console.log(`\n[NVIDIA] ⏳ Both keys resting. Waiting ${Math.ceil(wait/1000)}s for quota reset...`);
                await new Promise(r => setTimeout(r, wait + 1000));
                // After wait, pick whichever key is not resting
                const nowReady = (['nvidia', 'nvidia2'] as const).find(k => Date.now() >= this.restUntil[k] && ApiKeyStore.get(k));
                if (nowReady) this.activeKeyId = nowReady;
            }
        }

        const rpm = this.keyRPM[this.activeKeyId].count();
        const other = this.activeKeyId === 'nvidia' ? 'nvidia2' : 'nvidia';
        const otherKey = ApiKeyStore.get(other);

        if (rpm >= RPM_HARD_LIMIT) {
            // Hard limit reached — swap now
            if (otherKey && Date.now() >= this.restUntil[other]) {
                console.log(`\n[NVIDIA] 🔄 Key ${this.activeKeyId} at ${rpm}/${RPM_HARD_LIMIT} RPM. Swapping to ${other}.`);
                this.swapKey();
            } else {
                // Other key not available — wait for the next slot
                const wait = this.keyRPM[this.activeKeyId].msUntilSlot();
                console.log(`\n[NVIDIA] ⏳ At ${rpm} RPM. Waiting ${Math.ceil(wait/1000)}s for slot...`);
                await new Promise(r => setTimeout(r, wait + 500));
            }
        } else if (rpm >= RPM_WARN_THRESHOLD && otherKey) {
            // Warm warning — log but continue, next request may swap
            const bar  = this.keyRPM[this.activeKeyId].bar();
            const bar2 = this.keyRPM[other]?.bar() ?? '░'.repeat(20);
            console.log(`\n[NVIDIA] Key Status:`);
            console.log(`  ${this.activeKeyId}:  ${rpm}/${RPM_HARD_LIMIT} RPM  ${bar} ACTIVE (warming ${other})`);
            console.log(`  ${other}: ${this.keyRPM[other]?.count() ?? 0}/${RPM_HARD_LIMIT} RPM  ${bar2}`);
        }
    }

    /** Record a completed request on the active key. Swap after every SWAP_AFTER_N requests. */
    recordRequest(): void {
        this.keyRPM[this.activeKeyId].record();
        this.requestsOnCurrentKey++;

        const hasSecondKey = !!ApiKeyStore.get(this.activeKeyId === 'nvidia' ? 'nvidia2' : 'nvidia');

        if (hasSecondKey && this.requestsOnCurrentKey >= SWAP_AFTER_N) {
            const next = this.activeKeyId === 'nvidia' ? 'nvidia2' : 'nvidia';
            console.log(`\n[NVIDIA] ⚖️  Round-robin: ${this.activeKeyId} completed ${SWAP_AFTER_N} requests → swapping to ${next} (${this.activeKeyId} now resting)`);
            // Mark the key we just finished using as resting so it gets a full 60s break
            this.restUntil[this.activeKeyId] = Date.now() + KEY_COOLDOWN_MS;
            this.activeKeyId = next;
            this.requestsOnCurrentKey = 0;
        }
    }

    /** Print full key status to terminal */
    printStatus(): void {
        const k1 = 'nvidia', k2 = 'nvidia2';
        const rpm1 = this.keyRPM[k1].count();
        const rpm2 = this.keyRPM[k2].count();
        const rest1 = Math.max(0, this.restUntil[k1] - Date.now());
        const rest2 = Math.max(0, this.restUntil[k2] - Date.now());
        const active = this.activeKeyId;
        console.log(`\n[NVIDIA] Key Status:`);
        console.log(`  Key 1 (nvidia):  ${rpm1}/${RPM_HARD_LIMIT} RPM  ${this.keyRPM[k1].bar()} ${rest1 > 0 ? `RESTING ${Math.ceil(rest1/1000)}s` : active === k1 ? 'ACTIVE' : 'STANDBY'}`);
        console.log(`  Key 2 (nvidia2): ${rpm2}/${RPM_HARD_LIMIT} RPM  ${this.keyRPM[k2].bar()} ${rest2 > 0 ? `RESTING ${Math.ceil(rest2/1000)}s` : active === k2 ? 'ACTIVE' : 'STANDBY (ready)'}`);
        if (!ApiKeyStore.get(k2)) console.log(`  ⚠️  nvidia2 not set. Run /api nvidia2 <key> to enable dual-key rotation.`);
    }

    /** Enqueue a request through the sequential queue (1-at-a-time) */
    enqueue<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    await this.preflightCheck();
                    const result = await fn();      // ← run first
                    this.recordRequest();            // ← count AFTER success (round-robin swap happens here)
                    resolve(result);
                } catch (e) { reject(e); }
            });
            this.drain();
        });
    }

    private swapKey(): void {
        const next = this.activeKeyId === 'nvidia' ? 'nvidia2' : 'nvidia';
        if (ApiKeyStore.get(next)) {
            this.activeKeyId = next;
        }
    }

    private async drain(): Promise<void> {
        if (this.running) return;
        this.running = true;
        while (this.queue.length > 0) {
            const task = this.queue.shift()!;
            await task();
        }
        this.running = false;
    }
}

// Single shared scheduler — all NvidiaApiProvider instances share one RPM state
export const nvidiaScheduler = new NvidiaKeyScheduler();

export class NvidiaApiProvider implements AgentProvider {
    public readonly id: string;
    private model: string;
    private apiKey: string | null = null;
    private messages: ConversationMessage[] = [];
    private maxContextTokens: number;  // Set dynamically based on selected model
    private systemPrompt: string = '';
    private abortController: AbortController | null = null;
    private projectDir: string;
    private memoryPath: string;

    // Reasoning mode — when true, extracts reasoning_content from stream (R1-style models)
    private static reasoningEnabled: boolean = true;

    constructor(id = 'nvidia', model = DEFAULT_MODEL) {
        this.id = id;
        this.model = model || DEFAULT_MODEL;
        this.maxContextTokens = Math.floor(getModelContextWindow(this.model) * CONTEXT_HEADROOM);
        this.projectDir = process.cwd();
        this.memoryPath = getMemoryPath(this.projectDir);
    }

    // ── Model Management ───────────────────────────────────────────────────
    public setModel(model: string): void {
        this.model = model;
        this.maxContextTokens = Math.floor(getModelContextWindow(this.model) * CONTEXT_HEADROOM);
        console.log(`[NVIDIA] Model set to: ${model}`);
    }

    public getModel(): string { return this.model; }

    public static async fetchAvailableModels(apiKey: string): Promise<string[]> {
        try {
            const res = await fetch(MODELS_ENDPOINT, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const data = await res.json() as { data: Array<{ id: string }> };
            return data.data.map((m: any) => m.id).sort();
        } catch (e: any) {
            throw new Error(`Failed to fetch NVIDIA models: ${e.message}`);
        }
    }

    // ── Persistent Conversation Memory ─────────────────────────────────────
    private loadConversation(): void {
        try {
            if (fs.existsSync(this.memoryPath)) {
                const saved = JSON.parse(fs.readFileSync(this.memoryPath, 'utf8'));
                this.messages = saved.messages || [];
                // Do NOT overwrite this.model with saved.model. The user might have just switched models!
                // this.model    = saved.model || this.model;
            }
        } catch { this.messages = []; }
    }

    private saveConversation(): void {
        try {
            fs.writeFileSync(this.memoryPath, JSON.stringify({
                model: this.model,
                messages: this.messages,
                savedAt: new Date().toISOString()
            }, null, 2), 'utf8');
        } catch {}
    }

    public clearConversation(): void {
        this.messages = [];
        try { if (fs.existsSync(this.memoryPath)) fs.unlinkSync(this.memoryPath); } catch {}
        console.log('[NVIDIA] Conversation history cleared.');
    }

    // ── Context Window Management ──────────────────────────────────────────
    // Token estimate: ~4 chars per token.
    // Uses model-specific context window dynamically (e.g. 128k for Llama, 1M for MiniMax)
    private trimContext(): void {
        const estimateTokens = (msgs: ConversationMessage[]) =>
            msgs.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

        let trimmed = 0;
        // Trim if we exceed 70% of the maximum allowed window for this specific model
        const hardLimit = this.maxContextTokens * 0.70;
        while (estimateTokens(this.messages) > hardLimit && this.messages.length > 2) {
            const firstUserIdx = this.messages.findIndex(m => m.role !== 'system');
            if (firstUserIdx === -1) break;
            this.messages.splice(firstUserIdx, 1);
            trimmed++;
        }
        if (trimmed > 0) {
            console.log(`[NVIDIA] ✂️  Trimmed ${trimmed} old messages to stay under dynamic ${Math.round(hardLimit / 1000)}k token limit (70% of ${this.model} max)`);
        }
    }

    // ── Context Auto-Summarization ──────────────────────────────────────────
    // When context is near-full (60% of model's limit), force the AI to compress
    private injectContextRefresh(): void {
        const tokenEstimate = this.messages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0);
        const usedPct = Math.round((tokenEstimate / this.maxContextTokens) * 100);

        // Warn at 60% so they can compress before the 70% hard trim hits
        if (usedPct > 60 && this.messages.length > 4) {
            const lastMsg = this.messages[this.messages.length - 1];
            if (lastMsg && lastMsg.content.includes('[MEMORY CHECKPOINT]')) return;

            console.log(`\n[NVIDIA] 🧠 Context at ${usedPct}% of ${Math.round(this.maxContextTokens / 1000)}k limit (${this.model}) — forcing memory save...`);
            this.messages.push({
                role: 'system',
                content: `[MEMORY CHECKPOINT] Context at ${usedPct}%. Save ALL current progress, file paths, decisions, and next steps to ATCLI_MEMORY.md NOW before trimming begins.`
            });
        }
    }

    // ── Init ───────────────────────────────────────────────────────────────
    public async init(): Promise<void> {
        this.apiKey = nvidiaScheduler.resolveApiKey();
        if (!this.apiKey) {
            // Try fallback to plain 'nvidia' key if scheduler has none
            this.apiKey = ApiKeyStore.get('nvidia');
        }
        if (!this.apiKey) {
            throw new Error('NVIDIA API key not set. Run: /api nvidia <your-api-key>');
        }

        // Load persistent conversation from disk
        this.loadConversation();

        // Get system prompt from ATCLI (same full prompt as browser providers)
        try {
            const { generateSystemPrompt } = require('../agent/prompts');
            const skillManager = new SkillManager();
            await skillManager.loadAllSkills();
            this.systemPrompt = await generateSystemPrompt(skillManager, false, 'nvidia');
        } catch {
            this.systemPrompt = 'You are ATCLI, an expert AI coding assistant. Use all available tools to complete tasks autonomously.';
        }

        // Inject system prompt if not already present
        if (this.messages.length === 0 || this.messages[0]?.role !== 'system') {
            const promptParts = this.systemPrompt.split('---PROMPT_SECTION---').filter(Boolean);
            // Reverse so we unshift in the correct order (part N, then part N-1, ... part 0)
            for (let i = promptParts.length - 1; i >= 0; i--) {
                this.messages.unshift({ role: 'system', content: promptParts[i].trim() });
            }
        }

        console.log(`[NVIDIA] ✅ Provider ready | Model: ${this.model} | History: ${this.messages.length - this.promptPartsCount(this.systemPrompt)} messages`);
    }

    // Helper to count system messages
    private promptPartsCount(prompt: string): number {
        return prompt.split('---PROMPT_SECTION---').filter(Boolean).length;
    }

    // ── Core Request ───────────────────────────────────────────────────────
    private async callAPI(userMessage: string, onToolCall?: (toolCall: any) => Promise<string>): Promise<string> {
        // Sync apiKey with scheduler's active key (set by round-robin swap or 429 handler)
        const schedulerKey = nvidiaScheduler.resolveApiKey();
        if (schedulerKey && schedulerKey !== this.apiKey) {
            this.apiKey = schedulerKey; // Only update if scheduler changed the key
        }

        // Add user message to history
        this.messages.push({ role: 'user', content: userMessage });

        // Check if context refresh needed
        this.injectContextRefresh();

        // Trim to stay within context window
        this.trimContext();

        let attempt = 0;
        let swapsThisRequest = 0;
        const MAX_RETRIES = 3;

        while (attempt < MAX_RETRIES) {
            attempt++;
            const controller = new AbortController();
            this.abortController = controller;
            const timeoutId = setTimeout(() => {
                controller.abort(new Error('NVIDIA API timeout: Server took longer than 300 seconds to respond. The free tier is currently heavily overloaded.'));
            }, 300000);

            const requestBody = {
                model: this.model,
                messages: this.messages,
                temperature: 0.6,
                max_tokens: 4096,
                stream: true
            };

            let bodyString = JSON.stringify(requestBody);
            
            // 🛡️ [SECRET MASKING] - Scan the entire outbound HTTP body before it hits the network
            const { masked } = maskSecretsString(bodyString);
            bodyString = masked;

            try {
                const response = await fetch(CHAT_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: bodyString,
                    signal: this.abortController.signal,
                    dispatcher: keepAliveAgent
                } as any); // cast to any because native TS fetch typings don't include dispatcher yet
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errBody = await response.text();
                    throw new Error(`NVIDIA API Error ${response.status}: ${errBody}`);
                }

                if (attempt === 1) console.log(); // Newline before streaming only on first attempt
                let assistantMessage = '';
                let reasoningMessage = '';
                let inReasoningPhase = false;
                const isReasoningModel = REASONING_MODELS.some(m => this.model.includes(m)) && NvidiaApiProvider.reasoningEnabled;
                
                if (response.body) {
                    const reader = (response.body as any).getReader();
                    const decoder = new TextDecoder("utf-8");
                    let buffer = '';

                    let streamingToolParsed = false;
                    let toolExecutionPromise: Promise<string> | null = null;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        
                        let newlineIndex;
                        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                            const line = buffer.slice(0, newlineIndex).trim();
                            buffer = buffer.slice(newlineIndex + 1);

                            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                                try {
                                    const parsed = JSON.parse(line.slice(6));
                                    const delta = parsed.choices?.[0]?.delta;
                                    
                                    // ── Reasoning content extraction (R1-style models) ──
                                    const reasoningChunk = delta?.reasoning_content;
                                    if (reasoningChunk) {
                                        if (!inReasoningPhase) {
                                            inReasoningPhase = true;
                                            console.log('\n\x1b[2m\x1b[36m[REASONING] 🧠 ');
                                        }
                                        process.stdout.write(reasoningChunk);
                                        reasoningMessage += reasoningChunk;
                                    }
                                    
                                    // ── Main content ──
                                    const textChunk = delta?.content;
                                    if (textChunk) {
                                        if (inReasoningPhase) {
                                            inReasoningPhase = false;
                                            console.log('\x1b[0m\n[ANSWER] 💬\n');
                                        }
                                        process.stdout.write(textChunk);
                                        assistantMessage += textChunk;
                                        
                                        // ── Streaming PatchEngine (Live Tool Execution) ──
                                        if (!streamingToolParsed && onToolCall && assistantMessage.includes('</tool_call>')) {
                                            const toolMatch = assistantMessage.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
                                            if (toolMatch) {
                                                streamingToolParsed = true;
                                                try {
                                                    const toolCallJson = JSON.parse(toolMatch[1]);
                                                    // Fire execution asynchronously without waiting for stream to finish
                                                    toolExecutionPromise = onToolCall(toolCallJson);
                                                } catch (e) {
                                                    // Malformed partial JSON, wait for full response
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Ignore parse errors from partial JSON
                                }
                            }
                        }
                    }

                    // Await background tool execution if it was triggered
                    if (toolExecutionPromise) {
                        await toolExecutionPromise;
                    }
                }
                
                // If model only produced reasoning (no content yet), flush the reasoning
                if (inReasoningPhase) {
                    console.log('\x1b[0m');
                }
                
                // For reasoning models: prepend a compact reasoning summary to the assistant message
                // so the conversation history retains the chain-of-thought context.
                if (isReasoningModel && reasoningMessage && assistantMessage) {
                    assistantMessage = `[Reasoning: ${reasoningMessage.substring(0, 2000)}]\n\n${assistantMessage}`;
                }

                // Add assistant response to persistent history
                this.messages.push({ role: 'assistant', content: assistantMessage });

                // Save to disk after every exchange
                this.saveConversation();

                return assistantMessage;

            } catch (e: any) {
                clearTimeout(timeoutId);
                // ── Retryable errors (server-side 5xx, 429, timeout, network) ──────────
                const is429 = e.message.includes('429');
                const isRetryable = e.name === 'AbortError' ||
                                    e.message.includes('503') ||
                                    e.message.includes('502') ||
                                    e.message.includes('504') ||
                                    e.message.includes('500') ||
                                    is429 ||
                                    (e.message.includes('400') && e.message.includes('DEGRADED')) ||
                                    e.message.includes('terminated') ||
                                    e.message.includes('fetch failed');

                // 429 → instantly hand off to scheduler for key swap (no manual backoff)
                if (is429) {
                    const currentKeyId = nvidiaScheduler.getActiveKeyId();
                    nvidiaScheduler.on429(currentKeyId);
                    // Update our local apiKey reference after scheduler swapped
                    this.apiKey = nvidiaScheduler.resolveApiKey() ?? this.apiKey;
                    attempt = 0; // Reset retry count for new key
                    continue;
                }

                if (isRetryable && attempt < MAX_RETRIES) {
                    const backoffMs = Math.pow(2, attempt) * 2000 + Math.floor(Math.random() * 2000);
                    console.log(`\n[NVIDIA] API busy or timed out. Retrying attempt ${attempt + 1}/${MAX_RETRIES} in ${Math.round(backoffMs / 1000)} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                    continue;
                }

                this.messages.pop(); // Remove user message if request permanently failed
                if (e.name === 'AbortError') {
                    throw new Error(`NVIDIA API request timed out after ${MAX_RETRIES} attempts. The server might be overloaded.`);
                }
                throw e;
            }
        }
        
        // Should never reach here due to throw in catch
        return '';
    }

    // ── AgentProvider Interface ────────────────────────────────────────────

    /** Ensure the provider is initialized — AgentLoop calls sendMessage() directly
     *  without calling init() first, so we lazy-init on first message. */
    private async initIfNeeded(): Promise<void> {
        if (!this.apiKey) {
            await this.init();
        }
    }

    public async sendMessage(message: string, onToolCall?: (toolCall: any) => Promise<string>): Promise<ProviderResponse> {
        try {
            await this.initIfNeeded();
            const keyId = nvidiaScheduler.getActiveKeyId();
            console.log(`\n[NVIDIA] 🚀 Sending to ${this.model} via ${keyId} (sliding-window scheduler)...`);
            // ALL requests go through the scheduler — handles preflight RPM check + 1-at-a-time
            const text = await nvidiaScheduler.enqueue(() => this.callAPI(message, onToolCall));
            return { text };
        } catch (e: any) {
            if (e.name === 'AbortError') return { text: '', error: 'Request cancelled' };
            return { text: '', error: e.message };
        }
    }

    public async sendImageAndMessage(imagePath: string, message: string): Promise<ProviderResponse> {
        // Lazy init
        await this.initIfNeeded();
        // For vision-capable NVIDIA models (e.g. meta/llama-3.2-11b-vision-instruct)
        try {
            let base64: string;
            if (imagePath.startsWith('__BASE64__')) {
                base64 = imagePath.slice('__BASE64__'.length);
            } else {
                base64 = fs.readFileSync(imagePath).toString('base64');
            }

            const ext = imagePath.split('.').pop()?.toLowerCase() || 'png';
            const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';

            const visionMessage = `${message}\n\n[Image attached as base64]\ndata:${mimeType};base64,${base64.substring(0, 100)}...`;
            return await this.sendMessage(visionMessage);
        } catch (e: any) {
            return { text: '', error: `Vision error: ${e.message}` };
        }
    }

    public reset(): void {
        this.messages = this.messages.slice(0, 1); // Keep system prompt only
        this.saveConversation();
    }

    public abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
