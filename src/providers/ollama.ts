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
