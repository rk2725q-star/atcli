import * as fs from 'fs';
import * as path from 'path';

export interface ToolNode {
    id: string; tool: string; args: Record<string, unknown>; deps: string[];
    result?: string; status: 'pending'|'running'|'done'|'failed'; error?: string; durationMs?: number;
}

export class ToolDAG {
    private nodes: Map<string, ToolNode> = new Map();

    add(id: string, args: Record<string, unknown>, deps: string[] = []): void {
        this.nodes.set(id, { id, tool: String(args.action), args, deps, status: 'pending' });
    }

    async execute(cwd: string): Promise<Map<string, string>> {
        const results = new Map<string, string>();
        const executed = new Set<string>();
        let waves = 20;
        while (executed.size < this.nodes.size && waves-- > 0) {
            const wave = Array.from(this.nodes.values()).filter(
                n => n.status === 'pending' && n.deps.every(d => executed.has(d))
            );
            if (wave.length === 0) break;
            wave.forEach(n => { n.status = 'running'; });
            const settled = await Promise.allSettled(wave.map(async node => {
                const t0 = Date.now();
                try {
                    const result = await runTool(node.args, cwd);
                    node.result = result; node.status = 'done'; node.durationMs = Date.now() - t0;
                    return { id: node.id, result };
                } catch(e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    node.error = msg; node.status = 'failed'; node.durationMs = Date.now() - t0;
                    return { id: node.id, result: '[ERR] ' + msg };
                }
            }));
            for (const r of settled) {
                if (r.status === 'fulfilled') { results.set(r.value.id, r.value.result); executed.add(r.value.id); }
            }
            for (const n of wave) if (n.status === 'failed') { executed.add(n.id); results.set(n.id, '[FAIL] ' + n.error); }
        }
        return results;
    }

    toContextString(results: Map<string, string>): string {
        const parts: string[] = [];
        for (const [id, result] of results.entries()) {
            const node = this.nodes.get(id); if (!node) continue;
            const pL = node.args.path ? ' -> ' + String(node.args.path) : '';
            const qL = node.args.query ? ' q=' + String(node.args.query) : '';
            const label = '[' + node.tool.toUpperCase() + pL + qL + ']';
            parts.push(label + '\\n' + (result.length > 8000 ? result.substring(0, 8000) + '...' : result));
        }
        return parts.join('\\n\\n');
    }

    printSummary(): void {
        let done = 0, failed = 0, ms = 0;
        for (const n of this.nodes.values()) { if (n.status==='done') done++; if (n.status==='failed') failed++; ms += n.durationMs ?? 0; }
        process.stdout.write('[ToolDAG] ' + done + '/' + this.nodes.size + ' done | ' + failed + ' failed | ' + ms + 'ms | 0 API\\n');
    }

    size(): number { return this.nodes.size; }
    clear(): void { this.nodes.clear(); }
}

async function runTool(args: Record<string, unknown>, cwd: string): Promise<string> {
    const action = String(args.action);
    if (action === 'read_file') {
        const p = String(args.path); const fp = path.isAbsolute(p) ? p : path.join(cwd, p);
        if (!fs.existsSync(fp)) return '[NOT FOUND] ' + p;
        const c = fs.readFileSync(fp, 'utf-8');
        return c.length > 15000 ? c.substring(0, 15000) + '...(truncated)' : c;
    }
    if (action === 'list_dir') {
        const p = String(args.path ?? '.'); const dp = path.isAbsolute(p) ? p : path.join(cwd, p);
        if (!fs.existsSync(dp)) return '[NOT FOUND] ' + p;
        return listDir(dp, 0, 3);
    }
    if (action === 'grep_search') {
        const p = String(args.path ?? '.'); const sp = path.isAbsolute(p) ? p : path.join(cwd, p);
        return grepSearch(sp, String(args.query), Boolean(args.case_insensitive ?? true));
    }
    if (action === 'batch_read') {
        const paths = (args.paths as string[]).slice(0, 25); const parts: string[] = [];
        for (const p of paths) {
            const fp = path.isAbsolute(p) ? p : path.join(cwd, p);
            if (!fs.existsSync(fp)) { parts.push('--- ' + p + ' ---\\n[NOT FOUND]'); continue; }
            parts.push('--- ' + p + ' ---\\n' + fs.readFileSync(fp, 'utf-8').substring(0, 6000));
        }
        return parts.join('\\n\\n');
    }
    if (action === 'find_files') return findFiles(cwd, String(args.pattern), Number(args.max ?? 30));
    return '[LOCAL] ' + action + ' runs in LLM loop';
}

function listDir(dir: string, d: number, max: number): string {
    if (d > max) return '';
    const SKIP = new Set(['node_modules','.git','.next','dist','build','.cache','.atcli-tmp']);
    let out = '';
    try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        const fp = path.join(dir, e.name); const ind = '  '.repeat(d);
        if (e.isDirectory()) { out += ind + '[DIR] ' + e.name + '/\\n' + listDir(fp, d+1, max); }
        else { out += ind + '[FILE] ' + e.name + ' (' + fs.statSync(fp).size + 'B)\\n'; }
    } } catch {}
    return out;
}

function grepSearch(sp: string, query: string, ci: boolean): string {
    const results: string[] = [];
    const SKIP = new Set(['node_modules','.git','dist','build','.next']);
    let re: RegExp;
    try { re = new RegExp(query.replace(/[-[\]{}()*+?.\\^$|]/g, '\\$&'), ci ? 'gi' : 'g'); } catch { re = new RegExp('', 'g'); }
    function walk(dir: string, d: number): void {
        if (d > 4 || results.length >= 50) return;
        try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (SKIP.has(e.name)) continue;
            const fp = path.join(dir, e.name);
            if (e.isDirectory()) { walk(fp, d+1); }
            else if (/.(ts|js|tsx|jsx|py|go|md|json|yaml|yml)$/.test(e.name)) {
                try { const lines = fs.readFileSync(fp, 'utf-8').split('\\n');
                    for (let i=0; i<lines.length && results.length<50; i++) {
                        if (re.test(lines[i])) { re.lastIndex=0; results.push(fp+':'+(i+1)+': '+lines[i].trim().substring(0,120)); } re.lastIndex=0;
                    }
                } catch {}
            }
        } } catch {}
    }
    walk(sp, 0);
    return results.length ? '[GREP] ' + results.length + ' matches:\\n' + results.join('\\n') : '[GREP] No matches for ' + query;
}

function findFiles(cwd: string, pattern: string, max: number): string {
    const re = new RegExp(pattern.replace(/[*]/g,'.*').replace(/[?]/g,'.'), 'i');
    const found: string[] = [];
    function walk(dir: string): void {
        if (found.length >= max) return;
        try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (['node_modules','.git','dist','build'].includes(e.name)) continue;
            const fp = path.join(dir, e.name);
            if (e.isFile() && re.test(e.name)) found.push(fp.replace(cwd+path.sep,''));
            if (e.isDirectory()) walk(fp);
        } } catch {}
    }
    walk(cwd);
    return found.length ? found.join('\\n') : '[FIND] No files matching ' + pattern;
}