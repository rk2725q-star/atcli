import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// API Key Store — Secure local storage for API provider keys
// Stored at: ~/.atcli/api_keys.json (encrypted with machine-derived key)
// Never pushed to git (gitignored), never sent to AI providers
// ─────────────────────────────────────────────────────────────────────────────

const STORE_DIR  = path.join(os.homedir(), '.atcli');
const STORE_FILE = path.join(STORE_DIR, 'api_keys.json');

// Derive a machine-specific key from hostname + username (not a password, just obfuscation)
function getMachineKey(): Buffer {
    const seed = `${os.hostname()}::${os.userInfo().username}::atcli-keys`;
    return crypto.createHash('sha256').update(seed).digest();
}

function encrypt(text: string): string {
    const key = getMachineKey();
    const iv  = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(data: string): string {
    try {
        const [ivHex, encHex] = data.split(':');
        const key = getMachineKey();
        const iv  = Buffer.from(ivHex, 'hex');
        const enc = Buffer.from(encHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch {
        return ''; // Corrupted or from different machine
    }
}

export class ApiKeyStore {
    private static readStore(): Record<string, string> {
        try {
            if (!fs.existsSync(STORE_FILE)) return {};
            const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
            const result: Record<string, string> = {};
            for (const [k, v] of Object.entries(raw)) {
                result[k] = decrypt(v as string);
            }
            return result;
        } catch { return {}; }
    }

    private static writeStore(store: Record<string, string>): void {
        if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
        const encrypted: Record<string, string> = {};
        for (const [k, v] of Object.entries(store)) {
            encrypted[k] = encrypt(v);
        }
        fs.writeFileSync(STORE_FILE, JSON.stringify(encrypted, null, 2), 'utf8');
        // Restrict permissions on Unix
        try { fs.chmodSync(STORE_FILE, 0o600); } catch {}
    }

    public static set(provider: string, key: string): void {
        const store = ApiKeyStore.readStore();
        store[provider] = key;
        ApiKeyStore.writeStore(store);
    }

    public static get(provider: string): string | null {
        const store = ApiKeyStore.readStore();
        return store[provider] || null;
    }

    public static remove(provider: string): void {
        const store = ApiKeyStore.readStore();
        delete store[provider];
        ApiKeyStore.writeStore(store);
    }

    public static list(): string[] {
        return Object.keys(ApiKeyStore.readStore());
    }

    public static hasKey(provider: string): boolean {
        return !!ApiKeyStore.get(provider);
    }
}
