/**
 * Gemini API Provider — Google AI (direct REST API)
 * Endpoint: https://generativelanguage.googleapis.com/v1beta
 * Free tier: 15 RPM (Flash), 2 RPM (Pro)
 * Key: /api add gemini-api <key>  (get free at aistudio.google.com/app/apikey)
 */

import { AgentProvider, ProviderResponse } from './interface';
import { ApiKeyStore } from './api-key-store';
import { Agent, fetch as undiciFetch } from 'undici';
import { maskSecretsString } from '../utils/secrets';

const API_BASE_FN   = (model: string, key: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
const DEFAULT_MODEL = 'gemini-2.0-flash';

const keepAlive = new Agent({ keepAliveTimeout: 30_000, connections: 5 });

interface GeminiPart { text: string; }
interface GeminiContent { role: 'user' | 'model'; parts: GeminiPart[]; }

export class GeminiApiProvider implements AgentProvider {
    public readonly id = 'gemini-api';
    public readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    public readonly rateLimit = 15; // 15 RPM free

    private model = DEFAULT_MODEL;
    private history: GeminiContent[] = [];
    private sysPrompt = '';
    private abort$ = new AbortController();

    public setModel(m: string): void { this.model = m; console.log(`[Gemini API] Model → ${m}`); }
    public setSystemPrompt(p: string): void { this.sysPrompt = p; }

    public async init(): Promise<void> {
        const key = ApiKeyStore.get('gemini-api') || ApiKeyStore.get('gemini');
        if (!key) throw new Error('[Gemini API] No API key. Run: /api add gemini-api <key>  (get free at aistudio.google.com)');
        console.log(`[Gemini API] ✅ Ready. Model: ${this.model}`);
    }

    public reset(): void { this.history = []; }
    public abort(): void { this.abort$.abort(); this.abort$ = new AbortController(); }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        const key = ApiKeyStore.get('gemini-api') || ApiKeyStore.get('gemini');
        if (!key) return { text: '', error: '[Gemini API] No API key. Run: /api add gemini-api <key>' };

        this.history.push({ role: 'user', parts: [{ text: message }] });

        // Gemini context trim (~30 turns)
        if (this.history.length > 40) {
            this.history = this.history.slice(-30);
        }

        const body: any = {
            contents: this.history,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.0,
            },
        };
        if (this.sysPrompt) {
            body.systemInstruction = { parts: [{ text: this.sysPrompt }] };
        }

        try {
            const url = API_BASE_FN(this.model, key);
            const res = await (undiciFetch as any)(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: this.abort$.signal,
                dispatcher: keepAlive,
            });

            if (res.status === 429) {
                console.log(`[Gemini API] ⚡ 429 rate limit hit.`);
                return { text: '', error: '[Gemini API] Rate limit', is429: true };
            }
            if (!res.ok) {
                const err = await res.text();
                return { text: '', error: `[Gemini API] HTTP ${res.status}: ${err.substring(0, 200)}` };
            }

            // SSE streaming
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
                        const chunk = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        fullText += chunk;
                    } catch { /* ignore */ }
                }
            }

            fullText = maskSecretsString(fullText).masked;
            this.history.push({ role: 'model', parts: [{ text: fullText }] });
            return { text: fullText };
        } catch (e: any) {
            if (e.name === 'AbortError') return { text: '', error: 'Gemini API: Aborted' };
            return { text: '', error: `[Gemini API] ${e.message}` };
        }
    }

    public async sendImageAndMessage(imagePath: string, message: string): Promise<ProviderResponse> {
        // For now, fall back to text only
        return this.sendMessage(message);
    }
}
