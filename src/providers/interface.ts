export interface ProviderResponse {
    text: string;
    error?: string;
}

export interface AgentProvider {
    readonly id: string;
    init(): Promise<void>;
    sendMessage(message: string): Promise<ProviderResponse>;
    sendImageAndMessage(imagePath: string, message: string): Promise<ProviderResponse>;
    reset(): void;
    abort(): void;
}
