import { AgentProvider, ProviderResponse } from './interface';
import { ApiKeyStore } from './api-key-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { maskSecretsString } from '../utils/secrets';
import { SkillManager } from '../agent/skillManager';

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
const MAX_CONTEXT_TOKENS = 180_000;
const RPM_WINDOW_MS      = 60_000;   // Sliding window = 60 seconds
const RPM_WARN_THRESHOLD = 38;       // Warm up next key at 38 RPM
const RPM_HARD_LIMIT     = 40;       // Swap key at 40 RPM (NVIDIA free tier limit)
const KEY_COOLDOWN_MS    = 62_000;   // After a 429, rest key for 62s (slightly over 60s for safety)

// Models that support reasoning (emit reasoning_content in stream deltas)
const REASONING_MODELS = [
    'deepseek-ai/deepseek-r1',
    'deepseek-ai/deepseek-r1-distill-qwen-32b',
    'deepseek-ai/deepseek-r1-distill-llama-8b',
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'qwen/qwen3-coder-480b-a35b-instruct',
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

// ── Dual-Key Sliding-Window Scheduler ────────────────────────────────────────
// Manages two NVIDIA API keys with per-key RPM tracking.
// Logic:
//   count(last60s) < 38 → use current key freely
//   count(last60s) >= 38 → log warning, pre-warm next key  
//   count(last60s) >= 40 → swap to next key immediately
//   HTTP 429 received   → mark key as resting for 62s, instant swap
export class NvidiaKeyScheduler {
    private keyRPM: Record<string, SlidingWindowRPM> = {
        nvidia:  new SlidingWindowRPM(),
        nvidia2: new SlidingWindowRPM(),
    };
    private restUntil: Record<string, number> = { nvidia: 0, nvidia2: 0 };
    private activeKeyId: 'nvidia' | 'nvidia2' = 'nvidia';
    private queue: Array<() => Promise<void>> = [];
    private running = false;

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

    /** Record a successful request on the active key */
    recordRequest(): void {
        this.keyRPM[this.activeKeyId].record();
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
                    this.recordRequest();
                    resolve(await fn());
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
    private systemPrompt: string = '';
    private abortController: AbortController | null = null;
    private projectDir: string;
    private memoryPath: string;

    // Reasoning mode — when true, extracts reasoning_content from stream (R1-style models)
    private static reasoningEnabled: boolean = true;

    constructor(id = 'nvidia', model = DEFAULT_MODEL) {
        this.id       = id;
        this.model    = model;
        this.projectDir = process.cwd();
        this.memoryPath = getMemoryPath(this.projectDir);
    }

    // ── Model Management ───────────────────────────────────────────────────
    public setModel(model: string): void {
        this.model = model;
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
    // Rough token count: ~4 chars per token. Trim oldest non-system messages
    // when approaching MAX_CONTEXT_TOKENS to stay under the limit.
    private trimContext(): void {
        const estimateTokens = (msgs: ConversationMessage[]) =>
            msgs.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

        while (estimateTokens(this.messages) > MAX_CONTEXT_TOKENS && this.messages.length > 2) {
            // Find first non-system message and remove it
            const firstUserIdx = this.messages.findIndex(m => m.role !== 'system');
            if (firstUserIdx === -1) break;
            this.messages.splice(firstUserIdx, 1);
        }
    }

    // ── Context Auto-Summarization ──────────────────────────────────────────
    // When context is near-full (due to our aggressive 5000 token TTFT optimization), 
    // force the AI to physically save its thoughts into long-term memory before it gets trimmed.
    private injectContextRefresh(): void {
        const tokenEstimate = this.messages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0);
        
        // If we are over 80% of our limit AND we've done at least a few turns of real work
        if (tokenEstimate > MAX_CONTEXT_TOKENS * 0.80 && this.messages.length > 4) {
            
            // Only inject if we haven't already just injected it recently to avoid spam loops
            const lastMsg = this.messages[this.messages.length - 1];
            if (lastMsg && lastMsg.content.includes('[MEMORY CHECKPOINT]')) return;

            console.log('\n[NVIDIA] 🧠 Context limit approaching — forcing AI to update physical memory...');
            this.messages.push({
                role: 'system',
                content: `[MEMORY CHECKPOINT] Context nearing limit. Save current progress to ATCLI_MEMORY.md before continuing.`
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
            this.messages.unshift({ role: 'system', content: this.systemPrompt });
        }

        console.log(`[NVIDIA] ✅ Provider ready | Model: ${this.model} | History: ${this.messages.length - 1} messages`);
    }

    // ── Core Request ───────────────────────────────────────────────────────
    private async callAPI(userMessage: string): Promise<string> {
        // Key resolution is handled by nvidiaScheduler.preflightCheck() before this call.
        // Update apiKey in case scheduler swapped to a different key.
        this.apiKey = nvidiaScheduler.resolveApiKey() ?? this.apiKey;

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
                    signal: this.abortController.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errBody = await response.text();
                    throw new Error(`NVIDIA API Error ${response.status}: ${errBody}`);
                }

                if (attempt === 1) console.log(); // Newline before streaming only on first attempt
                let assistantMessage = '';
                let reasoningMessage = '';
                let inReasoningPhase = false;
                const isReasoningModel = REASONING_MODELS.includes(this.model) && NvidiaApiProvider.reasoningEnabled;
                
                if (response.body) {
                    const reader = (response.body as any).getReader();
                    const decoder = new TextDecoder("utf-8");
                    let buffer = '';

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
                                    // NVIDIA reasoning models emit `reasoning_content` BEFORE `content`.
                                    // We display it in a dimmed/cyan style so user sees the "thinking".
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
                                            // Transition from reasoning → answer
                                            inReasoningPhase = false;
                                            console.log('\x1b[0m\n[ANSWER] 💬\n');
                                        }
                                        process.stdout.write(textChunk);
                                        assistantMessage += textChunk;
                                    }
                                } catch (e) {
                                    // Ignore parse errors from partial JSON
                                }
                            }
                        }
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

    public async sendMessage(message: string): Promise<ProviderResponse> {
        try {
            await this.initIfNeeded();
            const keyId = nvidiaScheduler.getActiveKeyId();
            console.log(`\n[NVIDIA] 🚀 Sending to ${this.model} via ${keyId} (sliding-window scheduler)...`);
            // ALL requests go through the scheduler — handles preflight RPM check + 1-at-a-time
            const text = await nvidiaScheduler.enqueue(() => this.callAPI(message));
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
