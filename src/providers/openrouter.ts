/**
 * OpenRouter API Provider — Routes to 300+ models via single endpoint
 * Endpoint: https://openrouter.ai/api/v1  (OpenAI-compatible)
 * Free models: use ":free" suffix — llama, gemma, mistral, deepseek, etc.
 * Key: /api add openrouter <key>  (get free at openrouter.ai)
 */

import { AgentProvider, ProviderResponse } from './interface';
import { ApiKeyStore } from './api-key-store';
import { Agent, fetch as undiciFetch } from 'undici';
import { maskSecretsString } from '../utils/secrets';

const API_BASE     = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL   = 'https://openrouter.ai/api/v1/models';
const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

const keepAlive = new Agent({ keepAliveTimeout: 30_000, connections: 5 });

interface Msg { role: 'system' | 'user' | 'assistant'; content: string; }

export class OpenRouterApiProvider implements AgentProvider {
    public readonly id = 'openrouter';
    public readonly baseUrl = 'https://openrouter.ai/api/v1';
    public readonly rateLimit = 20; // varies by model; 20 is a safe default for free tier

    private model = DEFAULT_MODEL;
    private messages: Msg[] = [];
    private sysPrompt = '';
    private abort$ = new AbortController();

    public setModel(m: string): void { this.model = m; console.log(`[OpenRouter] Model → ${m}`); }
    public setSystemPrompt(p: string): void { this.sysPrompt = p; }

    public async init(): Promise<void> {
        const key = ApiKeyStore.get('openrouter');
        if (!key) throw new Error('[OpenRouter] No API key. Run: /api add openrouter <key>  (get free at openrouter.ai)');
        console.log(`[OpenRouter] ✅ Ready. Model: ${this.model}`);
    }

    public reset(): void { this.messages = []; }
    public abort(): void { this.abort$.abort(); this.abort$ = new AbortController(); }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        const key = ApiKeyStore.get('openrouter');
        if (!key) return { text: '', error: '[OpenRouter] No API key. Run: /api add openrouter <key>' };

        this.messages.push({ role: 'user', content: message });

        // Context trimming (~120k tokens for free models; trim at 40 messages)
        if (this.messages.length > 40) {
            const sys = this.messages.filter(m => m.role === 'system');
            const rest = this.messages.filter(m => m.role !== 'system');
            this.messages = [...sys, ...rest.slice(-28)];
        }

        const allMessages = this.sysPrompt
            ? [{ role: 'system' as const, content: this.sysPrompt }, ...this.messages]
            : this.messages;

        try {
            const res = await (undiciFetch as any)(API_BASE, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/rk2725q-star/atcli',
                    'X-Title': 'ATCLI',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: allMessages,
                    stream: true,
                    max_tokens: 8000,
                    temperature: 0.0,
                }),
                signal: this.abort$.signal,
                dispatcher: keepAlive,
            });

            if (res.status === 429) {
                console.log(`[OpenRouter] ⚡ 429 rate limit hit.`);
                return { text: '', error: '[OpenRouter] Rate limit', is429: true };
            }

            if (!res.ok) {
                const err = await res.text();
                return { text: '', error: `[OpenRouter] HTTP ${res.status}: ${err.substring(0, 200)}` };
            }

            // Stream reading
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

            fullText = maskSecretsString(fullText).masked;
            this.messages.push({ role: 'assistant', content: fullText });
            return { text: fullText };
        } catch (e: any) {
            if (e.name === 'AbortError') return { text: '', error: 'OpenRouter: Aborted' };
            return { text: '', error: `[OpenRouter] ${e.message}` };
        }
    }

    public async sendImageAndMessage(_imagePath: string, message: string): Promise<ProviderResponse> {
        return this.sendMessage(message);
    }

    /** List free models available via OpenRouter */
    public async listFreeModels(): Promise<string[]> {
        const key = ApiKeyStore.get('openrouter');
        if (!key) return [];
        try {
            const res = await (undiciFetch as any)(MODELS_URL, {
                headers: { 'Authorization': `Bearer ${key}` },
                dispatcher: keepAlive,
            });
            const json = await res.json() as any;
            return (json.data || [])
                .filter((m: any) => m.id.endsWith(':free') || (m.pricing?.prompt === '0' || m.pricing?.prompt === 0))
                .map((m: any) => m.id)
                .sort();
        } catch { return []; }
    }
}
