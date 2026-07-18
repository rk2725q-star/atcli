import * as fs from 'fs/promises';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// SENSITIVE FILE PATTERNS — blocked on both read and write regardless of
// whether Gatekeeper is wired in the caller. Defense-in-depth.
// ─────────────────────────────────────────────────────────────────────────────
const SENSITIVE_FILE_PATTERNS = [
    /\.env(\.(local|production|staging|development|test))?$/i,
    /\.ssh[\\/](id_rsa|id_ed25519|id_ecdsa|authorized_keys|known_hosts)$/i,
    /\/etc\/(passwd|shadow|sudoers|hosts)$/i,
];

export class FileSystemTools {
    /**
     * Resolve and validate a file path against the project root.
     * Throws if the resolved path escapes cwd or matches sensitive patterns.
     */
    private static resolveSafe(filePath: string): string {
        const projectRoot = path.resolve(process.cwd());
        const absolutePath = path.resolve(projectRoot, filePath);

        // ── Fix #1: Path traversal containment ────────────────────────────────
        // Ensures ../../../etc/passwd and absolute paths outside project root
        // are rejected. The trailing sep prevents /project-root-prefix-attack/.
        if (!absolutePath.startsWith(projectRoot + path.sep) && absolutePath !== projectRoot) {
            throw new Error(
                `SECURITY: Path "${filePath}" resolves to "${absolutePath}" which escapes the project root "${projectRoot}". Access denied.`
            );
        }

        // ── Fix #2: Sensitive file block (defense-in-depth) ───────────────────
        // This fires even if the caller forgot to call Gatekeeper first.
        // Normalise to forward-slashes for cross-platform pattern matching.
        const normalised = absolutePath.replace(/\\/g, '/');
        for (const pattern of SENSITIVE_FILE_PATTERNS) {
            if (pattern.test(normalised)) {
                throw new Error(
                    `SECURITY: Access to sensitive file "${filePath}" is blocked. Use environment variable managers, not direct file access.`
                );
            }
        }

        return absolutePath;
    }

    public static async readFile(filePath: string): Promise<string> {
        const absolutePath = FileSystemTools.resolveSafe(filePath);
        try {
            const content = await fs.readFile(absolutePath, 'utf-8');
            return content;
        } catch (error: any) {
            throw new Error(`Failed to read file: ${error.message}`);
        }
    }

    public static async writeFile(filePath: string, content: string): Promise<void> {
        const absolutePath = FileSystemTools.resolveSafe(filePath);
        try {
            await fs.mkdir(path.dirname(absolutePath), { recursive: true });
            await fs.writeFile(absolutePath, content, 'utf-8');
        } catch (error: any) {
            throw new Error(`Failed to write file: ${error.message}`);
        }
    }

    // ── str_replace_editor ────────────────────────────────────────────────────
    // Surgical replacement: finds `old` text in file, replaces with `new`.
    // line_hint: optional 1-indexed line number to disambiguate multiple matches.
    // Returns: summary of what was replaced and where.
    public static async strReplaceEditor(
        filePath: string,
        oldText: string,
        newText: string,
        lineHint?: number
    ): Promise<string> {
        const absolutePath = FileSystemTools.resolveSafe(filePath);
        const raw = await fs.readFile(absolutePath, 'utf-8');
        const occurrences = FileSystemTools.countOccurrences(raw, oldText);

        if (occurrences === 0) {
            throw new Error(
                `str_replace_editor: old text not found in ${filePath}.\n` +
                `Make sure the text matches exactly (whitespace, indentation).\n` +
                `Tip: use read_file first to see the exact current content.`
            );
        }

        let result: string;
        if (occurrences === 1 || !lineHint) {
            result = raw.replace(oldText, newText);
        } else {
            // Multiple occurrences — use line_hint to pick the right one
            const lines = raw.split('\n');
            const targetLineIdx = (lineHint - 1);
            // Find which occurrence contains the target line
            let searchFrom = 0;
            let replaced = false;
            let rebuilt = raw;
            let offset = 0;
            while (true) {
                const idx = rebuilt.indexOf(oldText, offset);
                if (idx === -1) break;
                const linesBefore = rebuilt.substring(0, idx).split('\n').length;
                if (Math.abs(linesBefore - lineHint) < 5) {
                    rebuilt = rebuilt.substring(0, idx) + newText + rebuilt.substring(idx + oldText.length);
                    replaced = true;
                    break;
                }
                offset = idx + 1;
            }
            result = replaced ? rebuilt : raw.replace(oldText, newText);
        }

        await fs.writeFile(absolutePath, result, 'utf-8');
        const newLines = result.split('\n').length;
        return `[str_replace_editor] Replaced ${occurrences > 1 ? `(occurrence near line ${lineHint})` : ''} in ${filePath} (${newLines} lines total)`;
    }

    // ── insert_at_line ────────────────────────────────────────────────────────
    // Insert content at a specific 1-indexed line. Existing lines shift down.
    public static async insertAtLine(filePath: string, line: number, content: string): Promise<string> {
        const absolutePath = FileSystemTools.resolveSafe(filePath);
        const raw = await fs.readFile(absolutePath, 'utf-8');
        const lines = raw.split('\n');
        const insertAt = Math.max(0, Math.min(line - 1, lines.length));
        lines.splice(insertAt, 0, content);
        await fs.writeFile(absolutePath, lines.join('\n'), 'utf-8');
        return `[insert_at_line] Inserted ${content.split('\n').length} line(s) at line ${line} in ${filePath}`;
    }

    // ── make_dir ──────────────────────────────────────────────────────────────
    public static async makeDir(dirPath: string): Promise<string> {
        const absolutePath = FileSystemTools.resolveSafe(dirPath);
        await fs.mkdir(absolutePath, { recursive: true });
        return `[make_dir] Created directory: ${dirPath}`;
    }

    // ── file_info ─────────────────────────────────────────────────────────────
    public static async fileInfo(filePath: string): Promise<string> {
        const absolutePath = FileSystemTools.resolveSafe(filePath);
        const stat = await fs.stat(absolutePath);
        const ext = path.extname(filePath).toLowerCase();
        const langMap: Record<string, string> = {
            '.ts': 'TypeScript', '.tsx': 'TypeScript React', '.js': 'JavaScript',
            '.jsx': 'JavaScript React', '.py': 'Python', '.go': 'Go',
            '.rs': 'Rust', '.java': 'Java', '.md': 'Markdown',
            '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML',
            '.css': 'CSS', '.html': 'HTML', '.sh': 'Shell',
        };
        const lang = langMap[ext] ?? ext.replace('.', '').toUpperCase() ?? 'Unknown';
        let lineCount = 0;
        if (stat.isFile()) {
            const content = await fs.readFile(absolutePath, 'utf-8');
            lineCount = content.split('\n').length;
        }
        return JSON.stringify({
            path: filePath,
            size_bytes: stat.size,
            size_kb: Math.round(stat.size / 1024 * 10) / 10,
            lines: lineCount,
            language: lang,
            last_modified: stat.mtime.toISOString(),
            is_directory: stat.isDirectory(),
        }, null, 2);
    }

    // ── find_replace_all ──────────────────────────────────────────────────────
    // Codebase-wide find & replace across all matching files.
    public static async findReplaceAll(
        searchPath: string,
        oldText: string,
        newText: string,
        extensions: string[] = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.md']
    ): Promise<string> {
        const absolutePath = FileSystemTools.resolveSafe(searchPath);
        const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next']);
        const changed: string[] = [];
        let totalOccurrences = 0;

        const walk = async (dir: string): Promise<void> => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                if (SKIP.has(e.name)) continue;
                const fp = path.join(dir, e.name);
                if (e.isDirectory()) { await walk(fp); }
                else if (extensions.some(ext => e.name.endsWith(ext))) {
                    const content = await fs.readFile(fp, 'utf-8');
                    const count = FileSystemTools.countOccurrences(content, oldText);
                    if (count > 0) {
                        await fs.writeFile(fp, content.split(oldText).join(newText), 'utf-8');
                        changed.push(`  ${fp.replace(absolutePath + path.sep, '')} (${count} replacements)`);
                        totalOccurrences += count;
                    }
                }
            }
        };
        await walk(absolutePath);

        if (changed.length === 0) return `[find_replace_all] No occurrences of "${oldText}" found.`;
        return `[find_replace_all] Replaced "${oldText}" → "${newText}" in ${changed.length} files (${totalOccurrences} total occurrences):\n${changed.join('\n')}`;
    }

    // ── diff_preview ──────────────────────────────────────────────────────────
    // Show a unified diff of current file vs proposed new content (no file write).
    public static async diffPreview(filePath: string, newContent: string): Promise<string> {
        const absolutePath = FileSystemTools.resolveSafe(filePath);
        let oldContent = '';
        try { oldContent = await fs.readFile(absolutePath, 'utf-8'); } catch { /* new file */ }
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const diff: string[] = [`--- ${filePath} (current)`, `+++ ${filePath} (proposed)`];
        const maxLen = Math.max(oldLines.length, newLines.length);
        let added = 0; let removed = 0;
        for (let i = 0; i < maxLen; i++) {
            const o = oldLines[i]; const n = newLines[i];
            if (o === undefined) { diff.push(`+  ${String(n)}`); added++; }
            else if (n === undefined) { diff.push(`-  ${String(o)}`); removed++; }
            else if (o !== n) { diff.push(`-  ${o}`); diff.push(`+  ${n}`); added++; removed++; }
        }
        diff.push(`\n[diff_preview] +${added} lines added, -${removed} lines removed. Use write_file to apply.`);
        return diff.join('\n');
    }

    // ── batch_write ───────────────────────────────────────────────────────────
    // Write multiple files in one call — 1 API call for an entire feature scaffold.
    public static async batchWrite(files: Array<{ path: string; content: string }>): Promise<string> {
        const results: string[] = [];
        const errors: string[] = [];
        await Promise.all(files.map(async f => {
            try {
                await FileSystemTools.writeFile(f.path, f.content);
                results.push(`  ✅ ${f.path} (${f.content.split('\n').length} lines)`);
            } catch (e: any) {
                errors.push(`  ❌ ${f.path}: ${e.message}`);
            }
        }));
        return `[batch_write] Wrote ${results.length}/${files.length} files:\n${results.join('\n')}${errors.length ? '\nErrors:\n' + errors.join('\n') : ''}`;
    }

    // ── smart_patch ───────────────────────────────────────────────────────────
    // Apply a unified diff patch string to a file. Handles line offset drift.
    public static async smartPatch(filePath: string, patchText: string): Promise<string> {
        const absolutePath = FileSystemTools.resolveSafe(filePath);
        const raw = await fs.readFile(absolutePath, 'utf-8');
        const lines = raw.split('\n');
        // Parse unified diff hunks: @@ -start,count +start,count @@
        const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
        const patchLines = patchText.split('\n');
        let resultLines = [...lines];
        let offset = 0;
        let i = 0;
        while (i < patchLines.length) {
            const hunkMatch = patchLines[i].match(hunkRegex);
            if (hunkMatch) {
                const origStart = parseInt(hunkMatch[1]) - 1 + offset;
                i++;
                const hunkOld: string[] = [];
                const hunkNew: string[] = [];
                while (i < patchLines.length && !patchLines[i].startsWith('@@')) {
                    const ch = patchLines[i][0];
                    const content = patchLines[i].substring(1);
                    if (ch === '-') hunkOld.push(content);
                    else if (ch === '+') hunkNew.push(content);
                    else { hunkOld.push(content); hunkNew.push(content); } // context
                    i++;
                }
                // Replace old lines with new lines
                resultLines.splice(origStart, hunkOld.length, ...hunkNew);
                offset += hunkNew.length - hunkOld.length;
            } else { i++; }
        }
        await fs.writeFile(absolutePath, resultLines.join('\n'), 'utf-8');
        return `[smart_patch] Applied patch to ${filePath} (${resultLines.length} lines)`;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static countOccurrences(text: string, search: string): number {
        if (!search) return 0;
        let count = 0;
        let pos = 0;
        while ((pos = text.indexOf(search, pos)) !== -1) { count++; pos += search.length; }
        return count;
    }
}

