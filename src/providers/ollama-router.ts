/**
 * Ollama API Provider — for ApiRouter
 * Wraps Ollama's OpenAI-compatible endpoint (/v1/chat/completions)
 * Supports custom base URLs: local (http://localhost:11434) or remote servers
 * Key: not required — but base URL + model must be set
 *
 * Usage:
 *   /api add ollama <base-url>        → sets the Ollama server URL
 *   /api set-model ollama <model>     → sets the model to use (e.g. qwen2.5-coder:7b)
 */

import { AgentProvider, ProviderResponse } from './interface';
import { ApiKeyStore } from './api-key-store';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL    = 'qwen2.5-coder:7b';

interface Msg { role: 'system' | 'user' | 'assistant'; content: string; }

export class OllamaApiRouterProvider implements AgentProvider {
    public readonly id = 'ollama';
    public readonly rateLimit = 999; // Local — effectively unlimited

    private model = DEFAULT_MODEL;
    private messages: Msg[] = [];
    private sysPrompt = '';
    private abort$ = new AbortController();

    // baseUrl is stored in ApiKeyStore under key 'ollama' (we reuse it for the URL)
    public get baseUrl(): string {
        return ApiKeyStore.get('ollama') || DEFAULT_BASE_URL;
    }

    public setModel(m: string): void {
        this.model = m;
        console.log(`[Ollama] Model → ${m}`);
    }

    public getModel(): string { return this.model; }

    public setSystemPrompt(p: string): void { this.sysPrompt = p; }

    public async init(): Promise<void> {
        const url = this.baseUrl;
        // Quick connectivity check
        try {
            const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as { models?: Array<{ name: string }> };
            const available = (data.models || []).map(m => m.name);
            const modelBase = this.model.split(':')[0];
            const found = available.some(m => m.startsWith(modelBase));
            if (!found && available.length > 0) {
                console.log(`[Ollama] ⚠️  Model '${this.model}' not found locally. Available: ${available.slice(0, 5).join(', ')}`);
                console.log(`[Ollama]    Pull it: ollama pull ${this.model}`);
            } else {
                console.log(`[Ollama] ✅ Connected to ${url} — Model: ${this.model}`);
            }
        } catch (e: any) {
            throw new Error(`[Ollama] Cannot reach ${url}. Is Ollama running? Start with: ollama serve`);
        }
    }

    public reset(): void { this.messages = []; }
    public abort(): void { this.abort$.abort(); this.abort$ = new AbortController(); }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        const url = `${this.baseUrl}/v1/chat/completions`;

        this.messages.push({ role: 'user', content: message });

        // Context trim (keep last 20 turns)
        if (this.messages.length > 30) {
            const sys = this.messages.filter(m => m.role === 'system');
            const rest = this.messages.filter(m => m.role !== 'system');
            this.messages = [...sys, ...rest.slice(-20)];
        }

        const allMessages = this.sysPrompt
            ? [{ role: 'system' as const, content: this.sysPrompt }, ...this.messages]
            : this.messages;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages: allMessages,
                    stream: true,
                    options: {
                        temperature: 0,
                        num_predict: 4096,
                    },
                }),
                signal: this.abort$.signal,
            });

            if (!res.ok) {
                const err = await res.text();
                if (err.includes('model') && err.includes('not found')) {
                    return { text: '', error: `[Ollama] Model '${this.model}' not found. Pull it with: ollama pull ${this.model}` };
                }
                return { text: '', error: `[Ollama] HTTP ${res.status}: ${err.substring(0, 200)}` };
            }

            // Stream reading (OpenAI-compatible SSE)
            let fullText = '';
            const reader = res.body!.getReader();
            const dec = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop() || '';
                for (const line of lines) {
                    const data = line.replace(/^data: /, '').trim();
                    if (!data || data === '[DONE]') continue;
                    try {
                        const j = JSON.parse(data);
                        fullText += j.choices?.[0]?.delta?.content || '';
                    } catch { /* ignore */ }
                }
            }

            this.messages.push({ role: 'assistant', content: fullText });
            return { text: fullText };
        } catch (e: any) {
            if (e.name === 'AbortError') return { text: '', error: 'Ollama: Aborted' };
            return { text: '', error: `[Ollama] ${e.message}. Make sure Ollama is running: ollama serve` };
        }
    }

    public async sendImageAndMessage(_imagePath: string, message: string): Promise<ProviderResponse> {
        return this.sendMessage(message); // Text-only for router mode
    }

    /** List all locally installed models */
    public async listModels(): Promise<string[]> {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json() as { models?: Array<{ name: string }> };
            return (data.models || []).map(m => m.name);
        } catch { return []; }
    }
}
