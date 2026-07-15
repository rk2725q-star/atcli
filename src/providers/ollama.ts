import { AgentProvider, ProviderResponse } from './interface';
import { SkillManager } from '../agent/skillManager';
import { generateLocalSystemPrompt } from '../agent/prompts';
import * as fs from 'fs';
import * as path from 'path';

interface OllamaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    images?: string[];
}

interface OllamaChatResponse {
    message?: {
        content?: string;
    };
}

const OLLAMA_API_BASE = 'http://localhost:11434/api';
// CRITICAL: num_ctx must be larger than (system_prompt_tokens + conversation + num_predict)
// System prompt ~3-4k tokens, so: num_ctx:16384 leaves 12k for conversation + 3k output
// num_predict must be < (num_ctx - prompt_tokens). 3072 is safe for most file writes.
const OLLAMA_MAX_CONTEXT_TOKENS = 16384;
const OLLAMA_TRIM_TARGET_TOKENS = 8000;

// ── Global prompt cache ───────────────────────────────────────────────────────
// System prompt is built ONCE and reused. This ensures Ollama's KV cache is
// never invalidated between calls — eliminating the 10-20s re-evaluation penalty.
const _promptCache: Map<string, string> = new Map();

function getConversationPath(projectDir: string, providerId: string): string {
    const dir = path.join(projectDir, '.atcli-tmp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${providerId}_conversation.json`);
}

export class OllamaFallbackProvider {
    private static baseUrl = `${OLLAMA_API_BASE}/generate`;

    /**
     * Calls the Unified Multimodal Agent (qwen3-vl:2b) to analyze a screenshot AND generate the fix.
     */
    public static async callUnifiedHealer(prompt: string, base64Image: string): Promise<string> {
        console.log('[OLLAMA] Waking up Unified Brain (qwen3-vl:2b) for Vision + Coding...');
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'qwen3-vl:2b',
                    prompt,
                    images: [base64Image],
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }

            const data = await response.json() as { response?: string };
            return data.response || '';
        } catch (error) {
            console.error('[OLLAMA] Unified Healer failed:', error);
            throw error;
        }
    }
}

export class OllamaApiAdapter implements AgentProvider {
    private abortController: AbortController | null = null;
    private messages: OllamaMessage[] = [];
    private systemPrompt = '';
    private projectDir: string;
    private conversationPath: string;

    constructor(public readonly id: string, private modelName: string = 'qwen3-vl:2b') {
        this.projectDir = process.cwd();
        this.conversationPath = getConversationPath(this.projectDir, id);
    }

    public setModel(model: string): void {
        this.modelName = model;
        console.log(`[OLLAMA] Model set to: ${model}`);
    }

    public getModel(): string {
        return this.modelName;
    }

    private estimateTokens(messages: OllamaMessage[]): number {
        return messages.reduce((sum, message) => {
            const imageCost = (message.images?.length || 0) * 1200;
            return sum + Math.ceil(message.content.length / 4) + imageCost;
        }, 0);
    }

    private trimContext(): void {
        while (this.estimateTokens(this.messages) > OLLAMA_TRIM_TARGET_TOKENS && this.messages.length > 3) {
            const removableIndex = this.messages.findIndex((message, index) => index > 0 && message.role !== 'system');
            if (removableIndex === -1) break;
            this.messages.splice(removableIndex, 1);
        }
    }

    private loadConversation(): void {
        try {
            if (!fs.existsSync(this.conversationPath)) {
                this.messages = [];
                return;
            }

            const saved = JSON.parse(fs.readFileSync(this.conversationPath, 'utf8')) as {
                messages?: OllamaMessage[];
                model?: string;
            };

            this.messages = Array.isArray(saved.messages) ? saved.messages : [];
        } catch {
            this.messages = [];
        }
    }

    private saveConversation(): void {
        try {
            fs.writeFileSync(this.conversationPath, JSON.stringify({
                model: this.modelName,
                messages: this.messages,
                savedAt: new Date().toISOString()
            }, null, 2), 'utf8');
        } catch {
            // Keep the provider usable even if saving fails.
        }
    }

    public clearConversation(): void {
        this.messages = [];
        try {
            if (fs.existsSync(this.conversationPath)) fs.unlinkSync(this.conversationPath);
        } catch {
            // Ignore disk cleanup errors.
        }
        console.log(`[OLLAMA] Conversation history cleared for ${this.id}.`);
    }

    public async init(): Promise<void> {
        console.log(`[OLLAMA] Initializing Local API Provider using model: ${this.modelName}`);

        this.loadConversation();

        if (!this.systemPrompt) {
            // ── Check global cache first — avoids skill reload + re-evaluation penalty
            const cacheKey = `${this.modelName}::${process.cwd()}`;
            if (_promptCache.has(cacheKey)) {
                this.systemPrompt = _promptCache.get(cacheKey)!;
            } else {
                try {
                    const skillManager = new SkillManager();
                    await skillManager.loadAllSkills();
                    const cachedPlan = (global as any).__atcli_senior_plan as string | undefined;
                    this.systemPrompt = await generateLocalSystemPrompt(skillManager, process.cwd(), cachedPlan);
                    _promptCache.set(cacheKey, this.systemPrompt);
                } catch {
                    this.systemPrompt = 'You are ATCLI local agent. Output ONE <tool_call> JSON block per turn. Wait for <tool_result> before next call.';
                    _promptCache.set(cacheKey, this.systemPrompt);
                }
            }
        }

        if (this.messages.length === 0 || this.messages[0]?.role !== 'system') {
            this.messages.unshift({ role: 'system', content: this.systemPrompt });
        } else if (this.messages[0].content !== this.systemPrompt) {
            this.messages[0] = { role: 'system', content: this.systemPrompt };
        }
    }

    /**
     * Pre-warm: load model into VRAM immediately when user connects.
     * Called right after setModel() so by the time user types, model is hot.
     */
    public async preWarm(): Promise<void> {
        try {
            // Send a real tiny prompt so Ollama actually loads the model into VRAM
            // Empty string prompt causes Ollama to skip model loading!
            await fetch(`${OLLAMA_API_BASE}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.modelName,
                    prompt: 'hi',            // tiny real prompt — forces model load
                    keep_alive: -1,
                    stream: false,
                    options: { num_predict: 1 }  // generate only 1 token — fast warmup
                })
            });
            console.log(`\x1b[90m  [OLLAMA] ✅ ${this.modelName} loaded into VRAM and ready.\x1b[0m`);
        } catch { /* silent — error shown on first real call */ }
    }

    public abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    private _firstCall = true;

    private async callChat(messages: OllamaMessage[]): Promise<string> {
        this.abortController = new AbortController();

        if (this._firstCall) {
            console.log(`\n\x1b[90m[OLLAMA] 🔥 Warming up ${this.modelName}... (first call loads model into VRAM, ~5-20s)\x1b[0m`);
            this._firstCall = false;
        } else {
            console.log(`\n\x1b[90m[OLLAMA] ⚡ ${this.modelName} is hot — responding...\x1b[0m`);
        }

        const response = await fetch(`${OLLAMA_API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: this.abortController.signal,
            body: JSON.stringify({
                model: this.modelName,
                messages,
                stream: true,
                keep_alive: -1,   // keep model hot in RAM between calls
                options: {
                    num_ctx: OLLAMA_MAX_CONTEXT_TOKENS,
                    num_predict: 3072,       // safe: leaves 13k for prompt+history in 16k ctx
                    temperature: 0.1,
                    repeat_penalty: 1.1
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API Error: ${response.statusText}`);
        }

        if (!response.body) {
            throw new Error('Ollama API returned empty body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let buffer = '';
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                // The last element might be an incomplete line, so we keep it in the buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line) as { message?: { content?: string } };
                        if (parsed.message?.content) {
                            process.stdout.write(parsed.message.content);
                            fullText += parsed.message.content;
                        }
                    } catch (e) {
                        // If it fails even after buffering, we can't do much but ignore
                    }
                }
            }
            
            // flush anything left in buffer
            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer) as { message?: { content?: string } };
                    if (parsed.message?.content) {
                        process.stdout.write(parsed.message.content);
                        fullText += parsed.message.content;
                    }
                } catch (e) { }
            }
        } finally {
            reader.releaseLock();
        }

        console.log(`\n\x1b[35m[OLLAMA STREAM END]\x1b[0m\n`);
        return fullText;
    }

    private async initIfNeeded(): Promise<void> {
        if (!this.systemPrompt || this.messages.length === 0) {
            await this.init();
        }
    }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        console.log(`[OLLAMA] Sending request to local model ${this.modelName}...`);

        try {
            await this.initIfNeeded();
            this.messages.push({ role: 'user', content: message });
            this.trimContext();

            const text = await this.callChat(this.messages);
            this.messages.push({ role: 'assistant', content: text });
            this.saveConversation();

            return { text };
        } catch (e: any) {
            const lastMessage = this.messages[this.messages.length - 1];
            if (lastMessage?.role === 'user' && lastMessage.content === message) {
                this.messages.pop();
            }
            return { text: '', error: e.message };
        }
    }

    public async sendImageAndMessage(imageSource: string, message: string): Promise<ProviderResponse> {
        console.log(`[OLLAMA] Sending request with image to local model ${this.modelName}...`);

        let base64: string;
        if (imageSource.startsWith('__BASE64__')) {
            base64 = imageSource.slice('__BASE64__'.length);
        } else {
            base64 = fs.readFileSync(imageSource).toString('base64');
        }

        try {
            await this.initIfNeeded();
            this.messages.push({
                role: 'user',
                content: message,
                images: [base64]
            });
            this.trimContext();

            const text = await this.callChat(this.messages);
            this.messages.push({ role: 'assistant', content: text });
            this.saveConversation();

            return { text };
        } catch (e: any) {
            const lastMessage = this.messages[this.messages.length - 1];
            if (lastMessage?.role === 'user' && lastMessage.content === message) {
                this.messages.pop();
            }
            return { text: '', error: e.message };
        }
    }

    public reset(): void {
        if (this.systemPrompt) {
            this.messages = [{ role: 'system', content: this.systemPrompt }];
        } else {
            this.messages = [];
        }
        this.saveConversation();
    }

    public static async fetchInstalledModels(): Promise<string[]> {
        try {
            const response = await fetch(`${OLLAMA_API_BASE}/tags`);
            if (!response.ok) {
                throw new Error(`Ollama tags error: ${response.statusText}`);
            }
            const data = await response.json() as { models?: Array<{ name?: string; model?: string }> };
            return (data.models || [])
                .map(entry => entry.name || entry.model || '')
                .filter(Boolean)
                .sort();
        } catch (error: any) {
            throw new Error(`Failed to list local Ollama models: ${error.message}`);
        }
    }

    public static async pullModel(model: string): Promise<string> {
        try {
            const response = await fetch(`${OLLAMA_API_BASE}/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: model, stream: false })
            });

            if (!response.ok) {
                throw new Error(`Ollama pull error: ${response.statusText}`);
            }

            const body = await response.text();
            return body || `Model pull started: ${model}`;
        } catch (error: any) {
            throw new Error(`Failed to pull local Ollama model '${model}': ${error.message}`);
        }
    }
}
