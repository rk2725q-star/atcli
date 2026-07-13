import { AgentProvider, ProviderResponse } from './interface';
import { SkillManager } from '../agent/skillManager';
import { generateSystemPrompt } from '../agent/prompts';
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
const OLLAMA_MAX_CONTEXT_TOKENS = 16384;
const OLLAMA_TRIM_TARGET_TOKENS = 12288;

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
            try {
                const skillManager = new SkillManager();
                await skillManager.loadAllSkills();
                this.systemPrompt = await generateSystemPrompt(skillManager, false, this.id);
            } catch {
                this.systemPrompt = 'You are ATCLI local model mode. Use the available XML tool calls to inspect, edit, verify, and remember project state carefully.';
            }
        }

        if (this.messages.length === 0 || this.messages[0]?.role !== 'system') {
            this.messages.unshift({ role: 'system', content: this.systemPrompt });
        } else if (this.messages[0].content !== this.systemPrompt) {
            this.messages[0] = { role: 'system', content: this.systemPrompt };
        }
    }

    public abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    private async callChat(messages: OllamaMessage[]): Promise<string> {
        this.abortController = new AbortController();

        console.log(`\n\x1b[90m[OLLAMA] 🧠 Loading model and evaluating prompt... (this may take 15-60 seconds on the very first run)\x1b[0m`);

        const response = await fetch(`${OLLAMA_API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: this.abortController.signal,
            body: JSON.stringify({
                model: this.modelName,
                messages,
                stream: true,
                options: {
                    num_ctx: OLLAMA_MAX_CONTEXT_TOKENS
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
        
        console.log(`\n\x1b[35m[OLLAMA STREAM STARTED]\x1b[0m`);

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line) as { message?: { content?: string } };
                        if (parsed.message?.content) {
                            process.stdout.write(parsed.message.content);
                            fullText += parsed.message.content;
                        }
                    } catch (e) {
                        // ignore unparseable chunk lines
                    }
                }
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
