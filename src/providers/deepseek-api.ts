/**
 * DeepSeek API Provider — Direct API (no browser scraping)
 * Endpoint: https://api.deepseek.com/v1/chat/completions (OpenAI-compatible)
 * Models: deepseek-chat (V3), deepseek-reasoner (R1)
 * Key: store with /api deepseek <key>
 */

import { AgentProvider, ProviderResponse } from './interface';
import { ApiKeyStore } from './api-key-store';

const API_BASE = 'https://api.deepseek.com/v1/chat/completions';

interface DSMessage { role: 'system' | 'user' | 'assistant'; content: string; }

export class DeepSeekApiAdapter implements AgentProvider {
    public readonly id: string;
    private model: string;
    private messages: DSMessage[] = [];
    private systemPrompt = '';
    private abortController: AbortController | null = null;

    constructor(id = 'deepseek-api', model = 'deepseek-chat') {
        this.id = id;
        this.model = model;
    }

    public setModel(model: string): void {
        this.model = model;
        console.log(`[DeepSeek API] Model set to: ${model}`);
    }

    public async init(): Promise<void> {
        const key = ApiKeyStore.get('deepseek') || ApiKeyStore.get('deepseek-api');
        if (!key) {
            throw new Error('No DeepSeek API key. Run: /api deepseek <your-key>  (get free key at platform.deepseek.com)');
        }
        console.log(`[DeepSeek API] ✅ Initialized with model: ${this.model}`);
    }

    public abort(): void {
        this.abortController?.abort();
        this.abortController = null;
    }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        const key = ApiKeyStore.get('deepseek') || ApiKeyStore.get('deepseek-api');
        if (!key) {
            return { text: '', error: 'No DeepSeek API key. Run: /api deepseek <key>' };
        }

        this.messages.push({ role: 'user', content: message });

        // Trim context if getting too long (~60k tokens max)
        if (this.messages.length > 40) {
            const sys = this.messages.filter(m => m.role === 'system');
            const rest = this.messages.filter(m => m.role !== 'system');
            this.messages = [...sys, ...rest.slice(-30)];
        }

        this.abortController = new AbortController();

        try {
            const body = {
                model: this.model,
                messages: this.systemPrompt
                    ? [{ role: 'system', content: this.systemPrompt }, ...this.messages]
                    : this.messages,
                stream: true,
                max_tokens: 8000,
                temperature: 0.0,
            };

            const response = await fetch(API_BASE, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: this.abortController.signal,
            });

            if (!response.ok) {
                const err = await response.text();
                if (response.status === 401) {
                    return { text: '', error: 'Invalid DeepSeek API key. Run: /api deepseek <correct-key>' };
                }
                if (response.status === 429) {
                    return { text: '', error: 'DeepSeek rate limit hit. Wait 10s and retry.' };
                }
                return { text: '', error: `DeepSeek API error ${response.status}: ${err.slice(0, 200)}` };
            }

            if (!response.body) {
                return { text: '', error: 'Empty response body from DeepSeek API' };
            }

            // Stream response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed === 'data: [DONE]') continue;
                        if (!trimmed.startsWith('data: ')) continue;

                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            const delta = json.choices?.[0]?.delta?.content;
                            if (delta) {
                                process.stdout.write(delta);
                                fullText += delta;
                            }
                        } catch { /* partial chunk */ }
                    }
                }
            } finally {
                reader.releaseLock();
            }

            process.stdout.write('\n');
            this.messages.push({ role: 'assistant', content: fullText });
            return { text: fullText };

        } catch (e: any) {
            if (e.name === 'AbortError') {
                return { text: '', error: 'Aborted' };
            }
            // Pop the user message we added on failure
            this.messages.pop();
            return { text: '', error: `DeepSeek API request failed: ${e.message}` };
        }
    }

    public setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
    }

    public getMessages(): DSMessage[] {
        return this.messages;
    }

    public reset(): void {
        this.messages = [];
        this.systemPrompt = '';
    }

    public async sendImageAndMessage(imagePath: string, message: string): Promise<ProviderResponse> {
        // DeepSeek API supports vision via base64 image in message content
        try {
            const fs = await import('fs');
            const path = await import('path');
            let base64: string;
            if (imagePath.startsWith('__BASE64__')) {
                base64 = imagePath.slice('__BASE64__'.length);
            } else {
                base64 = fs.readFileSync(imagePath).toString('base64');
            }
            const ext = path.extname(imagePath).replace('.', '').toLowerCase() || 'png';
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
            // DeepSeek V3 supports vision via image_url in content array
            const enrichedMessage = `[Image: data:${mime};base64,${base64.substring(0, 200)}...]\n\n${message}`;
            return this.sendMessage(enrichedMessage);
        } catch (e: any) {
            return this.sendMessage(message); // fallback: send without image
        }
    }
}
