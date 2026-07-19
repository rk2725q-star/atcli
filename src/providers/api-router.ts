/**
 * ApiRouter — Cline-style unified API provider manager
 *
 * Responsibilities:
 *  1. Registry: holds all API providers (nvidia, deepseek-api, gemini-api, groq, openrouter, mistral)
 *  2. Soft 429 fallback: if active provider returns 429, silently switch to next available provider
 *  3. /api list: prints live status table
 *  4. Priority order: user-configurable, persisted to ~/.atcli/api_router.json
 */

import { AgentProvider, ProviderResponse } from './interface';
import { ApiKeyStore } from './api-key-store';
import { NvidiaApiProvider } from './nvidia';
import { DeepSeekApiAdapter } from './deepseek-api';
import { GeminiApiProvider } from './gemini-api';
import { GroqApiProvider } from './groq';
import { OpenRouterApiProvider } from './openrouter';
import { MistralApiProvider } from './mistral-api';
import { OllamaApiRouterProvider } from './ollama-router';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Colour helpers ────────────────────────────────────────────────────────────
const C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    red:     '\x1b[31m',
    cyan:    '\x1b[36m',
    dim:     '\x1b[2m',
    blue:    '\x1b[34m',
    magenta: '\x1b[35m',
};

const ROUTER_CONFIG_PATH = path.join(os.homedir(), '.atcli', 'api_router.json');
const KEY_COOLDOWN_MS    = 62_000; // How long to rest a 429'd provider

interface ProviderEntry {
    provider: AgentProvider;
    priority: number;          // Lower = tried first
    cooldownUntil: number;     // ms timestamp; 0 = available
    model: string;
    keyId: string;             // Key in ApiKeyStore
}

interface RouterConfig {
    priorities: Record<string, number>;
    models: Record<string, string>;
}

// ── Canonical provider catalogue ─────────────────────────────────────────────
// Any provider registered here gets a slot in the router.
// Key must match what is used in ApiKeyStore.
const PROVIDER_CATALOGUE: Array<{
    id: string;
    keyId: string;
    defaultModel: string;
    defaultPriority: number;
    make: () => AgentProvider;
    rateLimit: number;
    description: string;
    signupUrl: string;
}> = [
    {
        id: 'nvidia',
        keyId: 'nvidia',
        defaultModel: 'minimaxai/minimax-m3',
        defaultPriority: 1,
        make: () => new NvidiaApiProvider(),
        rateLimit: 40,
        description: 'NVIDIA NIM — 40 RPM free, 300+ models',
        signupUrl: 'https://build.nvidia.com',
    },
    {
        id: 'deepseek-api',
        keyId: 'deepseek-api',
        defaultModel: 'deepseek-chat',
        defaultPriority: 2,
        make: () => new DeepSeekApiAdapter('deepseek-api', 'deepseek-chat'),
        rateLimit: 60,
        description: 'DeepSeek API — cheap V3/R1 models',
        signupUrl: 'https://platform.deepseek.com',
    },
    {
        id: 'gemini-api',
        keyId: 'gemini-api',
        defaultModel: 'gemini-2.0-flash',
        defaultPriority: 3,
        make: () => new GeminiApiProvider(),
        rateLimit: 15,
        description: 'Google Gemini API — 15 RPM free (Flash)',
        signupUrl: 'https://aistudio.google.com/app/apikey',
    },
    {
        id: 'groq',
        keyId: 'groq',
        defaultModel: 'llama-3.3-70b-versatile',
        defaultPriority: 4,
        make: () => new GroqApiProvider(),
        rateLimit: 30,
        description: 'Groq — ultra-fast LPU inference, 30 RPM free',
        signupUrl: 'https://console.groq.com',
    },
    {
        id: 'openrouter',
        keyId: 'openrouter',
        defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
        defaultPriority: 5,
        make: () => new OpenRouterApiProvider(),
        rateLimit: 20,
        description: 'OpenRouter — 300+ models, many free (:free suffix)',
        signupUrl: 'https://openrouter.ai',
    },
    {
        id: 'mistral',
        keyId: 'mistral',
        defaultModel: 'mistral-small-latest',
        defaultPriority: 6,
        make: () => new MistralApiProvider(),
        rateLimit: 60,
        description: 'Mistral AI — 60 RPM free',
        signupUrl: 'https://console.mistral.ai',
    },
    {
        id: 'ollama',
        keyId: 'ollama',
        defaultModel: 'qwen2.5-coder:7b',
        defaultPriority: 7,
        make: () => new OllamaApiRouterProvider(),
        rateLimit: 999,
        description: 'Ollama — local models, no API key needed',
        signupUrl: 'https://ollama.com',
    },
];

export class ApiRouter {
    private static instance: ApiRouter;
    private entries: Map<string, ProviderEntry> = new Map();
    private sysPrompt = '';

    private constructor() {
        const cfg = this.loadConfig();
        for (const cat of PROVIDER_CATALOGUE) {
            const model = cfg.models?.[cat.id] || cat.defaultModel;
            const priority = cfg.priorities?.[cat.id] ?? cat.defaultPriority;
            const prov = cat.make();
            if ((prov as any).setModel) (prov as any).setModel(model);
            this.entries.set(cat.id, {
                provider: prov,
                priority,
                cooldownUntil: 0,
                model,
                keyId: cat.keyId,
            });
        }
    }

    public static getInstance(): ApiRouter {
        if (!ApiRouter.instance) ApiRouter.instance = new ApiRouter();
        return ApiRouter.instance;
    }

    // ── System prompt ─────────────────────────────────────────────────────────
    public setSystemPrompt(prompt: string): void {
        this.sysPrompt = prompt;
        for (const e of this.entries.values()) {
            if (e.provider.setSystemPrompt) e.provider.setSystemPrompt(prompt);
        }
    }

    // ── Core sendMessage with soft fallback ───────────────────────────────────
    public async sendMessage(message: string): Promise<ProviderResponse> {
        const ordered = this.getOrderedProviders();
        if (ordered.length === 0) {
            return { text: '', error: 'No API providers configured. Run: /api add nvidia <key>' };
        }

        let lastError = '';
        for (const { id, entry } of ordered) {
            // Skip providers on cooldown
            if (Date.now() < entry.cooldownUntil) {
                const secs = Math.ceil((entry.cooldownUntil - Date.now()) / 1000);
                console.log(`[ApiRouter] ⏭  Skipping ${id} (resting ${secs}s)`);
                continue;
            }

            // Skip providers without a key
            const key = ApiKeyStore.get(entry.keyId) ||
                        (entry.keyId === 'nvidia' ? ApiKeyStore.get('nvidia') : null);
            if (!key) continue;

            // Lazy init provider
            try {
                await entry.provider.init();
            } catch (initErr: any) {
                lastError = initErr.message;
                continue;
            }

            // Push system prompt if supported
            if (entry.provider.setSystemPrompt && this.sysPrompt) {
                entry.provider.setSystemPrompt(this.sysPrompt);
            }

            console.log(`[ApiRouter] 🚀 Sending via ${C.bold}${id}${C.reset}`);
            const result = await entry.provider.sendMessage(message);

            if (result.is429 || (result.error && result.error.includes('429'))) {
                entry.cooldownUntil = Date.now() + KEY_COOLDOWN_MS;
                console.log(`[ApiRouter] ⚡ ${id} rate-limited → cooling ${KEY_COOLDOWN_MS / 1000}s. Trying next provider...`);
                lastError = result.error || '429';
                continue; // soft fallback
            }

            if (result.error && !result.text) {
                lastError = result.error;
                console.log(`[ApiRouter] ⚠️  ${id} returned error: ${result.error}. Trying next provider...`);
                continue;
            }

            return result; // ✅ success
        }

        // All providers exhausted
        const waitingSecs = this.getShortestCooldown();
        if (waitingSecs > 0) {
            console.log(`[ApiRouter] ⏳ All providers resting. Waiting ${waitingSecs}s for shortest cooldown...`);
            await new Promise(r => setTimeout(r, waitingSecs * 1000 + 500));
            return this.sendMessage(message); // retry after wait
        }

        return { text: '', error: `[ApiRouter] All providers failed or have no keys. Last error: ${lastError}` };
    }

    // ── Ordering ──────────────────────────────────────────────────────────────
    private getOrderedProviders(): Array<{ id: string; entry: ProviderEntry }> {
        return Array.from(this.entries.entries())
            .map(([id, entry]) => ({ id, entry }))
            .sort((a, b) => a.entry.priority - b.entry.priority);
    }

    private getShortestCooldown(): number {
        let min = 0;
        for (const [id, entry] of this.entries.entries()) {
            if (!ApiKeyStore.get(entry.keyId)) continue;
            const rem = entry.cooldownUntil - Date.now();
            if (rem > 0 && (min === 0 || rem < min)) min = rem;
        }
        return min > 0 ? Math.ceil(min / 1000) : 0;
    }

    // ── /api list ─────────────────────────────────────────────────────────────
    public list(): void {
        console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`║                  ATCLI — API Provider Status                     ║`);
        console.log(`╚══════════════════════════════════════════════════════════════════╝${C.reset}\n`);

        const ordered = this.getOrderedProviders();
        const rows: string[][] = [
            ['#', 'Provider', 'Status', 'Model', 'RPM', 'Signup'],
        ];

        for (const { id, entry } of ordered) {
            const cat = PROVIDER_CATALOGUE.find(c => c.id === id);
            const hasKey = !!ApiKeyStore.get(entry.keyId);
            const resting = Date.now() < entry.cooldownUntil;
            const restSecs = resting ? Math.ceil((entry.cooldownUntil - Date.now()) / 1000) : 0;

            let status: string;
            let signup = cat?.signupUrl ?? '';

            if (id === 'ollama') {
                const ollamaUrl = ApiKeyStore.get('ollama') || 'http://localhost:11434';
                signup = ollamaUrl;
                status = `${C.green}LOCAL${C.reset}`;
            } else if (!hasKey) {
                status = `${C.dim}NO KEY${C.reset}`;
            } else if (resting) {
                status = `${C.yellow}RESTING ${restSecs}s${C.reset}`;
            } else {
                status = `${C.green}ACTIVE${C.reset}`;
            }

            rows.push([
                String(entry.priority),
                `${C.bold}${id}${C.reset}`,
                status,
                entry.model,
                String(cat?.rateLimit ?? '?') + ' RPM',
                signup,
            ]);
        }

        // Print table
        const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.replace(/\x1b\[[0-9;]*m/g, '').length));
        const cols = [3, 16, 18, 42, 10, 34];
        for (const row of rows) {
            const line = row.map((cell, i) => pad(cell, cols[i])).join('  ');
            console.log(`  ${line}`);
        }

        console.log(`\n${C.dim}Commands:${C.reset}`);
        console.log(`  ${C.cyan}/api add <provider> <key>${C.reset}         — Register a provider key`);
        console.log(`  ${C.cyan}/api remove <provider>${C.reset}            — Remove a provider key`);
        console.log(`  ${C.cyan}/api set-model <provider> <model>${C.reset} — Change default model`);
        console.log(`  ${C.cyan}/api priority <provider> <number>${C.reset} — Set priority (1=first)\n`);

        // Print add instructions for providers without keys (skip ollama — it's always local)
        const missing = ordered.filter(({ id, entry }) => id !== 'ollama' && !ApiKeyStore.get(entry.keyId));
        if (missing.length > 0) {
            console.log(`${C.yellow}Add more providers for automatic failover:${C.reset}`);
            for (const { id } of missing) {
                const cat = PROVIDER_CATALOGUE.find(c => c.id === id);
                if (cat) console.log(`  /api add ${id} <key>   →  ${cat.signupUrl}`);
            }
            console.log('');
        }
        const ollamaUrl = ApiKeyStore.get('ollama') || 'http://localhost:11434';
        console.log(`${C.dim}Ollama (local): /api add ollama ${ollamaUrl}  then  /api set-model ollama <model>${C.reset}\n`);
    }

    // ── /api add <id> <key> ───────────────────────────────────────────────────
    public add(id: string, key: string): void {
        const cat = PROVIDER_CATALOGUE.find(c => c.id === id);
        if (!cat) {
            const valid = PROVIDER_CATALOGUE.map(c => c.id).join(', ');
            console.log(`${C.red}Unknown provider "${id}". Valid: ${valid}${C.reset}`);
            return;
        }

        // Ollama: the "key" is actually the base URL
        if (id === 'ollama') {
            const url = key.startsWith('http') ? key : `http://${key}`;
            ApiKeyStore.set('ollama', url);
            const entry = this.entries.get('ollama');
            console.log(`${C.green}\u2705 [ApiRouter] Ollama registered!${C.reset}`);
            console.log(`   Base URL: ${url}`);
            console.log(`   Model: ${entry?.model || cat.defaultModel}`);
            console.log(`   Run ${C.cyan}/api set-model ollama <model-name>${C.reset} to change model.`);
            console.log(`   Run ${C.cyan}/api list models ollama${C.reset} to see installed models.`);
            return;
        }

        ApiKeyStore.set(cat.keyId, key);
        console.log(`${C.green}\u2705 [ApiRouter] ${id} API key saved!${C.reset}`);
        console.log(`   Model: ${cat.defaultModel}`);
        console.log(`   Run ${C.cyan}/api list${C.reset} to see status.`);
    }

    // ── /api remove <id> ─────────────────────────────────────────────────────
    public remove(id: string): void {
        const cat = PROVIDER_CATALOGUE.find(c => c.id === id);
        if (!cat) { console.log(`${C.red}Unknown provider "${id}".${C.reset}`); return; }
        ApiKeyStore.remove(cat.keyId);
        console.log(`${C.yellow}[ApiRouter] ${id} key removed.${C.reset}`);
    }

    // ── /api set-model <id> <model> ───────────────────────────────────────────
    public setProviderModel(id: string, model: string): void {
        const entry = this.entries.get(id);
        if (!entry) { console.log(`${C.red}Unknown provider "${id}".${C.reset}`); return; }
        entry.model = model;
        if ((entry.provider as any).setModel) (entry.provider as any).setModel(model);
        this.saveConfig();
        console.log(`${C.green}✅ ${id} model set to: ${model}${C.reset}`);
    }

    // ── /api priority <id> <n> ────────────────────────────────────────────────
    public setPriority(id: string, priority: number): void {
        const entry = this.entries.get(id);
        if (!entry) { console.log(`${C.red}Unknown provider "${id}".${C.reset}`); return; }
        entry.priority = priority;
        this.saveConfig();
        console.log(`${C.green}✅ ${id} priority set to: ${priority}${C.reset}`);
    }

    // ── Reset / Abort ─────────────────────────────────────────────────────────
    public reset(): void {
        for (const e of this.entries.values()) e.provider.reset();
    }

    public abort(): void {
        for (const e of this.entries.values()) e.provider.abort();
    }

    // ── Config persistence ────────────────────────────────────────────────────
    private loadConfig(): RouterConfig {
        try {
            if (fs.existsSync(ROUTER_CONFIG_PATH)) {
                return JSON.parse(fs.readFileSync(ROUTER_CONFIG_PATH, 'utf8'));
            }
        } catch { /* ignore */ }
        return { priorities: {}, models: {} };
    }

    private saveConfig(): void {
        const cfg: RouterConfig = { priorities: {}, models: {} };
        for (const [id, entry] of this.entries.entries()) {
            cfg.priorities[id] = entry.priority;
            cfg.models[id] = entry.model;
        }
        try {
            const dir = path.dirname(ROUTER_CONFIG_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(ROUTER_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
        } catch { /* ignore */ }
    }

    /** List provider IDs that have a key configured */
    public getActiveProviderIds(): string[] {
        return Array.from(this.entries.entries())
            .filter(([_, e]) => !!ApiKeyStore.get(e.keyId))
            .sort((a, b) => a[1].priority - b[1].priority)
            .map(([id]) => id);
    }

    public getCatalogue() { return PROVIDER_CATALOGUE; }
}
