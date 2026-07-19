/**
 * Groq API Provider — Ultra-fast inference (LPU chips)
 * Endpoint: https://api.groq.com/openai/v1  (OpenAI-compatible)
 * Free tier: 30 RPM / 6000 TPM for llama models
 * Key: /api add groq <key>  (get free at console.groq.com)
 */

import { AgentProvider, ProviderResponse } from './interface';
import { ApiKeyStore } from './api-key-store';
import { Agent, fetch as undiciFetch } from 'undici';
import { maskSecretsString } from '../utils/secrets';

const API_BASE    = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS_URL  = 'https://api.groq.com/openai/v1/models';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const keepAlive = new Agent({ keepAliveTimeout: 30_000, connections: 5 });

interface Msg { role: 'system' | 'user' | 'assistant'; content: string; }

export class GroqApiProvider implements AgentProvider {
    public readonly id = 'groq';
    public readonly baseUrl = 'https://api.groq.com/openai/v1';
    public readonly rateLimit = 30; // 30 RPM free tier

    private model = DEFAULT_MODEL;
    private messages: Msg[] = [];
    private sysPrompt = '';
    private abort$ = new AbortController();

    public setModel(m: string): void { this.model = m; console.log(`[Groq] Model → ${m}`); }
    public setSystemPrompt(p: string): void { this.sysPrompt = p; }

    public async init(): Promise<void> {
        const key = ApiKeyStore.get('groq');
        if (!key) throw new Error('[Groq] No API key. Run: /api add groq <key>  (get free at console.groq.com)');
        console.log(`[Groq] ✅ Ready. Model: ${this.model}`);
    }

    public reset(): void { this.messages = []; }
    public abort(): void { this.abort$.abort(); this.abort$ = new AbortController(); }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        const key = ApiKeyStore.get('groq');
        if (!key) return { text: '', error: '[Groq] No API key. Run: /api add groq <key>' };

        this.messages.push({ role: 'user', content: message });

        // Trim if too long (~30k tokens = 6 messages for safety)
        if (this.messages.length > 30) {
            const sys = this.messages.filter(m => m.role === 'system');
            const rest = this.messages.filter(m => m.role !== 'system');
            this.messages = [...sys, ...rest.slice(-20)];
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
                console.log(`[Groq] ⚡ 429 rate limit hit.`);
                return { text: '', error: '[Groq] Rate limit', is429: true };
            }

            if (!res.ok) {
                const err = await res.text();
                return { text: '', error: `[Groq] HTTP ${res.status}: ${err.substring(0, 200)}` };
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
            if (e.name === 'AbortError') return { text: '', error: 'Groq: Aborted' };
            return { text: '', error: `[Groq] ${e.message}` };
        }
    }

    public async sendImageAndMessage(_imagePath: string, message: string): Promise<ProviderResponse> {
        return this.sendMessage(message); // Groq text-only fallback
    }

    public async listModels(): Promise<string[]> {
        const key = ApiKeyStore.get('groq');
        if (!key) return [];
        try {
            const res = await (undiciFetch as any)(MODELS_URL, {
                headers: { 'Authorization': `Bearer ${key}` },
                dispatcher: keepAlive,
            });
            const json = await res.json() as any;
            return (json.data || []).map((m: any) => m.id).sort();
        } catch { return []; }
    }
}
