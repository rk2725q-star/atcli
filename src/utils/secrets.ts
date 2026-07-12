// ── Shared Secret Masking Utility (single source of truth) ─────────────────
export const SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9_\-]{20,}/g,           // OpenAI / Anthropic / general SK keys
    /sk_(live|test)_[a-zA-Z0-9_-]+/g,    // Stripe keys
    /nvapi-[a-zA-Z0-9_\-]{32,}/g,        // Nvidia API keys
    /xox[baprs]-[0-9]+-[0-9]+-[a-zA-Z0-9]+/g,  // Slack Bot Token
    /gh[pousr]_[a-zA-Z0-9]{36,}/g,       // GitHub Tokens
    /AKIA[0-9A-Z]{16}/g,                 // AWS Access Key
    /AIza[0-9A-Za-z\-_]{35}/g,           // Google API Key
    /ya29\.[0-9A-Za-z\-_]+/g,            // Google OAuth Token
    /BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/g,  // Private key material
    // Generic fallback for high-entropy secrets (must be at least 32 chars to prevent false positives in ordinary code)
    /(?:api\s*key|secret)\s*[:=]\s*['"]?[a-zA-Z0-9_\-\.]{32,}['"]?/gi
];

export function maskSecretsString(input: string): { masked: string; changed: boolean } {
    let masked = input;
    let changed = false;
    for (const regex of SECRET_PATTERNS) {
        regex.lastIndex = 0; // Reset stateful regex
        if (regex.test(masked)) {
            regex.lastIndex = 0;
            masked = masked.replace(regex, '[REDACTED_LOCAL_SECRET]');
            changed = true;
        }
    }
    return { masked, changed };
}

export function maskSecretsObject(obj: any): any {
    let str = JSON.stringify(obj);
    let changed = false;
    for (const p of SECRET_PATTERNS) {
        p.lastIndex = 0;
        if (p.test(str)) {
            p.lastIndex = 0;
            str = str.replace(p, '[REDACTED_LOCAL_SECRET]');
            changed = true;
        }
    }
    if (changed) {
        try { return JSON.parse(str); } catch { return obj; }
    }
    return obj;
}

export function hasSecret(input: string): boolean {
    for (const p of SECRET_PATTERNS) {
        p.lastIndex = 0;
        if (p.test(input)) return true;
    }
    return false;
}
