/**
 * Mistral API Provider — Direct REST API
 * Endpoint: https://api.mistral.ai/v1  (OpenAI-compatible)
 * Free models: open-mistral-nemo, open-codestral-mamba
 * Key: /api add mistral <key>  (get at console.mistral.ai)
 */

import { AgentProvider, ProviderResponse } from './interface';
import { ApiKeyStore } from './api-key-store';
import { Agent, fetch as undiciFetch } from 'undici';
import { maskSecretsString } from '../utils/secrets';

const API_BASE     = 'https://api.mistral.ai/v1/chat/completions';
const DEFAULT_MODEL = 'mistral-small-latest';

const keepAlive = new Agent({ keepAliveTimeout: 30_000, connections: 5 });

interface Msg { role: 'system' | 'user' | 'assistant'; content: string; }

export class MistralApiProvider implements AgentProvider {
    public readonly id = 'mistral';
    public readonly baseUrl = 'https://api.mistral.ai/v1';
    public readonly rateLimit = 60; // 60 RPM free tier

    private model = DEFAULT_MODEL;
    private messages: Msg[] = [];
    private sysPrompt = '';
    private abort$ = new AbortController();

    public setModel(m: string): void { this.model = m; console.log(`[Mistral] Model → ${m}`); }
    public setSystemPrompt(p: string): void { this.sysPrompt = p; }

    public async init(): Promise<void> {
        const key = ApiKeyStore.get('mistral');
        if (!key) throw new Error('[Mistral] No API key. Run: /api add mistral <key>  (get at console.mistral.ai)');
        console.log(`[Mistral] ✅ Ready. Model: ${this.model}`);
    }

    public reset(): void { this.messages = []; }
    public abort(): void { this.abort$.abort(); this.abort$ = new AbortController(); }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        const key = ApiKeyStore.get('mistral');
        if (!key) return { text: '', error: '[Mistral] No API key. Run: /api add mistral <key>' };

        this.messages.push({ role: 'user', content: message });

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
                console.log(`[Mistral] ⚡ 429 rate limit hit.`);
                return { text: '', error: '[Mistral] Rate limit', is429: true };
            }

            if (!res.ok) {
                const err = await res.text();
                return { text: '', error: `[Mistral] HTTP ${res.status}: ${err.substring(0, 200)}` };
            }

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
            if (e.name === 'AbortError') return { text: '', error: 'Mistral: Aborted' };
            return { text: '', error: `[Mistral] ${e.message}` };
        }
    }

    public async sendImageAndMessage(_imagePath: string, message: string): Promise<ProviderResponse> {
        return this.sendMessage(message);
    }
}
