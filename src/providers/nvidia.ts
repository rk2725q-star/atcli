import { AgentProvider, ProviderResponse } from './interface';
import { ApiKeyStore } from './api-key-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// NVIDIA NIM Provider
// API: https://integrate.api.nvidia.com/v1  (OpenAI-compatible)
// Docs: https://docs.api.nvidia.com
//
// Features:
//  - Dynamic model list from GET /v1/models
//  - Sequential request queue (1-at-a-time, respects 40 RPM free tier)
//  - Persistent conversation memory (messages[] never cleared between turns)
//  - 180k token context window: auto-trims oldest messages to stay under limit
//  - Full system prompt (same as browser providers — Gatekeeper, skills, etc.)
//  - Secret masking before any request leaves the machine
// ─────────────────────────────────────────────────────────────────────────────

const NVIDIA_BASE_URL    = 'https://integrate.api.nvidia.com/v1';
const CHAT_ENDPOINT      = `${NVIDIA_BASE_URL}/chat/completions`;
const MODELS_ENDPOINT    = `${NVIDIA_BASE_URL}/models`;
const DEFAULT_MODEL      = 'minimaxai/minimax-m3';
const MAX_CONTEXT_TOKENS = 180_000;   // Increased to 180k to match architecture design
const RPM_DELAY_MS       = 3_000;     // 3s between requests → max 20 RPM (50% of the 40 RPM limit for ultimate safety)

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

// ── Sequential Request Queue ──────────────────────────────────────────────────
// All NVIDIA requests go through this queue — ensures 1-at-a-time execution
// so we never burst past the 40 RPM free tier limit.
class RequestQueue {
    private queue: Array<() => Promise<void>> = [];
    private running = false;
    private lastRequestTime = 0;

    public enqueue<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                // Rate limiter: ensure RPM_DELAY_MS has passed since last request
                const elapsed = Date.now() - this.lastRequestTime;
                if (elapsed < RPM_DELAY_MS) {
                    await new Promise(r => setTimeout(r, RPM_DELAY_MS - elapsed));
                }
                try {
                    this.lastRequestTime = Date.now();
                    resolve(await fn());
                } catch (e) {
                    reject(e);
                }
            });
            this.drain();
        });
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

// Single shared queue across ALL NvidiaApiProvider instances
const globalQueue = new RequestQueue();

export class NvidiaApiProvider implements AgentProvider {
    public readonly id: string;
    private model: string;
    private apiKey: string | null = null;
    private messages: ConversationMessage[] = [];
    private systemPrompt: string = '';
    private abortController: AbortController | null = null;
    private projectDir: string;
    private memoryPath: string;

    // Proactive Load Balancing State
    private static activeKeyId: 'nvidia' | 'nvidia2' = 'nvidia';
    private static requestCount: number = 0;

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
        this.apiKey = ApiKeyStore.get(NvidiaApiProvider.activeKeyId);
        if (!this.apiKey && NvidiaApiProvider.activeKeyId === 'nvidia2') {
            NvidiaApiProvider.activeKeyId = 'nvidia';
            this.apiKey = ApiKeyStore.get('nvidia');
        }
        if (!this.apiKey) {
            throw new Error('NVIDIA API key not set. Run: /api nvidia <your-api-key>');
        }

        // Load persistent conversation from disk
        this.loadConversation();

        // Get system prompt from ATCLI (same full prompt as browser providers)
        try {
            const { buildSystemPrompt } = require('../agent/prompts');
            this.systemPrompt = await buildSystemPrompt(true); // isAgenticaMode=false for vibecoding
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
        if (!this.apiKey) throw new Error('API key not initialized');

        // Proactive Rate Limit Balancing (Swap every 30 requests)
        NvidiaApiProvider.requestCount++;
        if (NvidiaApiProvider.requestCount >= 30) {
            const nextKeyId = NvidiaApiProvider.activeKeyId === 'nvidia' ? 'nvidia2' : 'nvidia';
            const nextKey = ApiKeyStore.get(nextKeyId);
            if (nextKey) {
                console.log(`\n[NVIDIA] ⚖️ Proactive load balancing: Swapping to ${nextKeyId} key to prevent rate limits...`);
                NvidiaApiProvider.activeKeyId = nextKeyId;
                this.apiKey = nextKey;
                NvidiaApiProvider.requestCount = 0;
            } else {
                NvidiaApiProvider.requestCount = 0; // Reset anyway if secondary not available
            }
        }

        // Add user message to history
        this.messages.push({ role: 'user', content: userMessage });

        // Check if context refresh needed
        this.injectContextRefresh();

        // Trim to stay within context window
        this.trimContext();

        let attempt = 0;
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
            const SECRET_PATTERNS = [
                /sk-[a-zA-Z0-9]{32,}/g,
                /nvapi-[a-zA-Z0-9\-]{32,}/g,
                /xox[baprs]-[0-9a-zA-Z]{10,}/g,
                /gh[pousr]_[a-zA-Z0-9]{36,}/g,
                /AKIA[0-9A-Z]{16}/g,
                /(?:api\s*key|token|secret|password)\s*[:=]\s*['"]?[a-zA-Z0-9_\-\.]{10,}['"]?/gi
            ];
            for (const regex of SECRET_PATTERNS) {
                bodyString = bodyString.replace(regex, '[REDACTED_LOCAL_SECRET]');
            }

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
                                    const textChunk = parsed.choices?.[0]?.delta?.content;
                                    if (textChunk) {
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

                // Add assistant response to persistent history
                this.messages.push({ role: 'assistant', content: assistantMessage });

                // Save to disk after every exchange
                this.saveConversation();

                return assistantMessage;

            } catch (e: any) {
                clearTimeout(timeoutId);
                
                // Retry if 503 (Busy), 502/504 (Gateway timeout), 429 (Rate limit), or AbortError (timeout)
                const isRetryable = e.name === 'AbortError' || 
                                    e.message.includes('503') || 
                                    e.message.includes('502') || 
                                    e.message.includes('504') || 
                                    e.message.includes('500') ||
                                    e.message.includes('429') ||
                                    e.message.includes('terminated') ||
                                    e.message.includes('fetch failed');

                if (isRetryable && attempt < MAX_RETRIES) {
                    const backoffMs = attempt * 5000 + Math.floor(Math.random() * 2000); // Exponential backoff + jitter
                    console.log(`\n[NVIDIA] API busy or timed out. Retrying attempt ${attempt + 1}/${MAX_RETRIES} in ${Math.round(backoffMs / 1000)} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                    continue;
                }

                // Seamless Fallback Logic (Reactive)
                if (isRetryable && attempt >= MAX_RETRIES) {
                    const nextKeyId = NvidiaApiProvider.activeKeyId === 'nvidia' ? 'nvidia2' : 'nvidia';
                    const nextKey = ApiKeyStore.get(nextKeyId);
                    if (nextKey) {
                        console.log(`\n[NVIDIA] ⚠️ Active API key exhausted. Seamlessly falling back to ${nextKeyId}...`);
                        NvidiaApiProvider.activeKeyId = nextKeyId;
                        this.apiKey = nextKey;
                        NvidiaApiProvider.requestCount = 0;
                        attempt = 0; // Reset retries for the new key
                        continue;
                    }
                }

                this.messages.pop(); // Remove user message if request permanently failed
                if (e.name === 'AbortError') {
                    throw new Error(`NVIDIA API request timed out (120s) after ${MAX_RETRIES} attempts. The NVIDIA server might be overloaded.`);
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
            // Lazy init — AgentLoop skips explicit init() and calls sendMessage directly
            await this.initIfNeeded();
            console.log(`\n[NVIDIA] 🚀 Sending to ${this.model} (queued, 1-at-a-time)...`);
            // ALL requests go through the sequential queue — enforces 1-at-a-time
            const text = await globalQueue.enqueue(() => this.callAPI(message));
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
