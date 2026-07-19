export interface ProviderResponse {
    text: string;
    error?: string;
    is429?: boolean; // Provider signals rate limit for soft fallback
}

export interface AgentProvider {
    readonly id: string;
    readonly baseUrl?: string;     // For /api list display
    readonly rateLimit?: number;   // RPM limit of this provider
    init(): Promise<void>;
    sendMessage(message: string, onToolCall?: (toolCall: any) => Promise<string>): Promise<ProviderResponse>;
    sendImageAndMessage(imagePath: string, message: string): Promise<ProviderResponse>;
    setSystemPrompt?(prompt: string): void; // Optional: allow router to push system prompt
    reset(): void;
    abort(): void;
}
