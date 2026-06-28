export class OllamaFallbackProvider {
    private static baseUrl = 'http://localhost:11434/api/generate';

    /**
     * Calls the Unified Multimodal Agent (qwen3-vl:2b) to analyze a screenshot AND generate the fix.
     */
    public static async callUnifiedHealer(prompt: string, base64Image: string): Promise<string> {
        console.log('[OLLAMA] 🧠 Waking up Unified Brain (qwen3-vl:2b) for Vision + Coding...');
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'qwen3-vl:2b',
                    prompt: prompt,
                    images: [base64Image],
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('[OLLAMA] ❌ Unified Healer failed:', error);
            throw error;
        }
    }
}

import { AgentProvider, ProviderResponse } from './interface';
import * as fs from 'fs/promises';

export class OllamaApiAdapter implements AgentProvider {
    private baseUrl = 'http://localhost:11434/api/generate';

    constructor(public readonly id: string, private modelName: string = 'qwen3-vl:2b') {}

    public async init(): Promise<void> {
        console.log(`[OLLAMA] Initializing Local API Provider using model: ${this.modelName}`);
        // Can optionally verify connection to localhost:11434 here
    }

    public async sendMessage(message: string): Promise<ProviderResponse> {
        console.log(`[OLLAMA] Sending request to local model ${this.modelName}...`);
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.modelName,
                    prompt: message,
                    stream: false,
                    options: {
                        num_ctx: 32000 // Ensure a high context window for ATCLI prompts
                    }
                })
            });

            if (!response.ok) {
                return { text: '', error: `Ollama API Error: ${response.statusText}` };
            }

            const data = await response.json();
            return { text: data.response };
        } catch (e: any) {
            return { text: '', error: e.message };
        }
    }

    public async sendImageAndMessage(imagePath: string, message: string): Promise<ProviderResponse> {
        console.log(`[OLLAMA] Sending image request to local model ${this.modelName}...`);
        try {
            const buffer = await fs.readFile(imagePath);
            const base64Image = buffer.toString('base64');

            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.modelName,
                    prompt: message,
                    images: [base64Image],
                    stream: false,
                    options: {
                        num_ctx: 32000
                    }
                })
            });

            if (!response.ok) {
                return { text: '', error: `Ollama Vision Error: ${response.statusText}` };
            }

            const data = await response.json();
            return { text: data.response };
        } catch (e: any) {
            return { text: '', error: e.message };
        }
    }

    public reset(): void {
        // Stateless API, no reset required
    }
}
