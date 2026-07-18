import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

// SemanticCache ? multi-dimensional hash cache.
// Key = task + workspace + git HEAD + file hashes + tool outputs + prompt version + model ID
// Any dimension change invalidates the cache.

const CACHE_VERSION = '1';           // Bump this to invalidate all caches globally
const CACHE_TTL_MS  = 24 * 3600 * 1000; // 24-hour TTL

interface CacheEntry {
    key: string;
    result: unknown;
    createdAt: number;
    taskHash: string;
    modelId: string;
}

interface CacheFile {
    version: string;
    entries: CacheEntry[];
}

export class SemanticCache {
    private cachePath: string;
    private cache: CacheFile;

    constructor(cwd: string) {
        const dir = path.join(cwd, '.atcli-tmp');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        this.cachePath = path.join(dir, 'semantic_cache.json');
        this.cache = this.load();
        this.evictExpired();
    }

    /** Build a composite cache key from all dimensions */
    buildKey(params: {
        taskText: string;
        cwd: string;
        modelId: string;
        keyFilePaths?: string[];
        toolOutputs?: Record<string, string>;
    }): string {
        const { taskText, cwd, modelId, keyFilePaths = [], toolOutputs = {} } = params;

        const taskHash = sha256(taskText.trim().toLowerCase());
        const workspaceHash = sha256(getWorkspaceSignature(cwd));
        const gitHead = getGitHead(cwd);
        const fileHashes = keyFilePaths.map(p => {
            const fp = path.isAbsolute(p) ? p : path.join(cwd, p);
            return p + ':' + (fs.existsSync(fp) ? sha256(fs.readFileSync(fp, 'utf-8')) : 'MISSING');
        }).join(',');
        const toolHash = sha256(JSON.stringify(toolOutputs));

        return sha256([taskHash, workspaceHash, gitHead, fileHashes, toolHash, modelId, CACHE_VERSION].join('|'));
    }

    /** Check cache. Returns cached result or null. */
    get(key: string): unknown | null {
        const entry = this.cache.entries.find(e => e.key === key);
        if (!entry) return null;
        if (Date.now() - entry.createdAt > CACHE_TTL_MS) { this.remove(key); return null; }
        process.stdout.write('[SemanticCache] HIT ? skipping API call\\n');
        return entry.result;
    }

    /** Store result in cache */
    set(key: string, result: unknown, taskHash: string, modelId: string): void {
        this.remove(key); // deduplicate
        this.cache.entries.push({ key, result, createdAt: Date.now(), taskHash, modelId });
        this.save();
    }

    /** Clear all cache entries */
    clear(): void { this.cache.entries = []; this.save(); }

    private remove(key: string): void {
        this.cache.entries = this.cache.entries.filter(e => e.key !== key);
    }

    private evictExpired(): void {
        const now = Date.now();
        const before = this.cache.entries.length;
        this.cache.entries = this.cache.entries.filter(e => now - e.createdAt <= CACHE_TTL_MS);
        if (this.cache.entries.length < before) this.save();
    }

    private load(): CacheFile {
        try {
            if (fs.existsSync(this.cachePath)) {
                const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8')) as CacheFile;
                if (data.version === CACHE_VERSION) return data;
            }
        } catch {}
        return { version: CACHE_VERSION, entries: [] };
    }

    private save(): void {
        try { fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf-8'); } catch {}
    }
}

function sha256(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
}

function getGitHead(cwd: string): string {
    try { return execSync('git rev-parse HEAD', { cwd, stdio: ['pipe','pipe','pipe'] }).toString().trim().substring(0, 8); }
    catch { return 'no-git'; }
}

function getWorkspaceSignature(cwd: string): string {
    const SKIP = new Set(['node_modules','.git','.next','dist','build','.atcli-tmp']);
    const files: string[] = [];
    function walk(dir: string, d: number): void {
        if (d > 3) return;
        try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (SKIP.has(e.name)) continue;
            const fp = path.join(dir, e.name);
            if (e.isFile()) { const stat = fs.statSync(fp); files.push(fp + ':' + stat.size + ':' + stat.mtimeMs); }
            if (e.isDirectory()) walk(fp, d+1);
        } } catch {}
    }
    walk(cwd, 0);
    return files.sort().join(',');
}