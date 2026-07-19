/**
 * Advanced File Operation Skills — Kimi CLI / Claude Code style
 *
 * Adds the tools that were missing vs Kimi CLI:
 *   grep_search    — ripgrep-style content search (finds the exact line before editing)
 *   insert_lines   — insert code at a specific line number (no whitespace matching needed)
 *   tree           — smart directory tree with ignore patterns
 *   read_many      — read up to 5 files in one tool call (saves RPM quota)
 *   write_diff     — write file and show a unified diff of what changed
 */

import { AgentSkill } from './base';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ─── Security helper ──────────────────────────────────────────────────────────
function assertSafe(targetPath: string): string | null {
    const cwd = (global as any).atcli_project_root || process.cwd();
    const cwdWithSep = cwd.endsWith(path.sep) ? cwd : cwd + path.sep;
    if (targetPath !== cwd && !targetPath.startsWith(cwdWithSep)) {
        return `Error: Security violation. Path resolves outside the project workspace.`;
    }
    return null;
}

// ─── grep_search ─────────────────────────────────────────────────────────────
export const GrepSearchSkill: AgentSkill = {
    name: 'grep_search',
    description: `Searches file CONTENTS for a pattern across the workspace. Returns matching file paths, line numbers, and the matching line text. Use this BEFORE using replace — it tells you the exact line number and surrounding whitespace.

Arguments:
  pattern  (required) — text or regex to search for
  path     (optional) — directory or file to search in (default: current workspace)
  glob     (optional) — file glob filter, e.g. "*.py", "*.ts" (default: all files)
  regex    (optional) — true to treat pattern as regex (default: false = literal)
  max      (optional) — max results to return (default: 30)`,
    example: `<tool_call>\n{"action": "grep_search", "pattern": "def calculate_score", "glob": "*.py"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.pattern) return 'Error: pattern is required';
        const cwd = (global as any).atcli_project_root || process.cwd();
        const searchIn = args.path ? path.resolve(cwd, args.path) : cwd;
        const secErr = assertSafe(searchIn);
        if (secErr) return secErr;

        const maxResults = parseInt(args.max ?? '30');
        const pattern = args.pattern as string;
        const isRegex = args.regex === true || args.regex === 'true';
        const glob = args.glob as string | undefined;

        const results: string[] = [];
        let count = 0;

        const skipDirs = new Set(['node_modules', '.git', 'dist', '__pycache__', '.venv', 'venv', '.next', 'build']);

        const searchFile = async (filePath: string) => {
            if (count >= maxResults) return;
            try {
                const stat = await fs.stat(filePath);
                if (stat.size > 500 * 1024) return; // skip >500KB files
                const content = await fs.readFile(filePath, 'utf8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (count >= maxResults) break;
                    const line = lines[i];
                    const matched = isRegex
                        ? new RegExp(pattern).test(line)
                        : line.includes(pattern);
                    if (matched) {
                        const relPath = path.relative(cwd, filePath).replace(/\\/g, '/');
                        results.push(`${relPath}:${i + 1}: ${line.trimEnd()}`);
                        count++;
                    }
                }
            } catch { /* binary / unreadable */ }
        };

        const walk = async (dir: string) => {
            if (count >= maxResults) return;
            let entries: any[];
            try { entries = await fs.readdir(dir, { withFileTypes: true }); }
            catch { return; }
            for (const entry of entries) {
                if (count >= maxResults) break;
                if (skipDirs.has(entry.name)) continue;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await walk(full);
                } else if (entry.isFile()) {
                    if (glob) {
                        // Simple glob: *.ext or **/*.ext
                        const ext = glob.replace(/^\*+\/|\*/g, '').replace(/^\*\./, '.');
                        if (!entry.name.endsWith(ext) && glob !== '*') continue;
                    }
                    await searchFile(full);
                }
            }
        };

        try {
            const stat = await fs.stat(searchIn);
            if (stat.isFile()) {
                await searchFile(searchIn);
            } else {
                await walk(searchIn);
            }
        } catch (e: any) {
            return `Error: ${e.message}`;
        }

        if (results.length === 0) {
            return `No matches found for "${pattern}"${glob ? ` in ${glob} files` : ''}.`;
        }

        const header = `Found ${results.length} match${results.length > 1 ? 'es' : ''} for "${pattern}"${count >= maxResults ? ` (showing first ${maxResults})` : ''}:`;
        return `${header}\n${results.join('\n')}`;
    }
};

// ─── insert_lines ─────────────────────────────────────────────────────────────
export const InsertLinesSkill: AgentSkill = {
    name: 'insert_lines',
    description: `Inserts one or more lines of text at a SPECIFIC LINE NUMBER in a file. No whitespace matching needed — just know the line number (use grep_search or read_lines to find it). The inserted content goes BEFORE the target line by default. Set after:true to insert AFTER the target line.

Arguments:
  path       (required) — file path
  line       (required) — 1-indexed line number to insert at
  content    (required) — text to insert (newlines supported)
  after      (optional) — true to insert AFTER the line instead of before (default: false)`,
    example: `<tool_call>\n{"action": "insert_lines", "path": "src/app.py", "line": 42, "content": "    result = validate(data)"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path || !args.content || args.line === undefined) {
            return 'Error: path, line, and content are required';
        }
        const cwd = (global as any).atcli_project_root || process.cwd();
        const targetPath = path.resolve(cwd, args.path);
        const secErr = assertSafe(targetPath);
        if (secErr) return secErr;

        const lowerPath = targetPath.toLowerCase();
        if (lowerPath.endsWith('prompts.ts') || lowerPath.endsWith('prompts.js')) {
            return '❌ [HARD STOP] Cannot modify the ATCLI security prompt engine.';
        }

        try {
            const content = await fs.readFile(targetPath, 'utf8');
            const lines = content.split('\n');
            const lineNum = Math.max(1, parseInt(args.line));
            const insertIdx = args.after ? lineNum : lineNum - 1; // 0-indexed insertion point
            const newLines = args.content.split('\n');
            lines.splice(Math.min(insertIdx, lines.length), 0, ...newLines);
            await fs.writeFile(targetPath, lines.join('\n'), 'utf8');
            const pos = args.after ? `after line ${lineNum}` : `before line ${lineNum}`;
            return `Success: Inserted ${newLines.length} line(s) ${pos} in ${args.path}. File now has ${lines.length} lines.`;
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }
};

// ─── tree ─────────────────────────────────────────────────────────────────────
export const TreeSkill: AgentSkill = {
    name: 'tree',
    description: `Shows a visual directory tree of the workspace. Automatically excludes node_modules, .git, dist, __pycache__, .venv, .next. Use this first to understand project structure.

Arguments:
  path    (optional) — root directory to show tree from (default: workspace root)
  depth   (optional) — maximum depth to show (default: 3)
  exclude (optional) — additional directory names to exclude, comma-separated`,
    example: `<tool_call>\n{"action": "tree", "depth": 3}\n</tool_call>`,
    execute: async (args: any) => {
        const cwd = (global as any).atcli_project_root || process.cwd();
        const rootPath = args.path ? path.resolve(cwd, args.path) : cwd;
        const secErr = assertSafe(rootPath);
        if (secErr) return secErr;

        const maxDepth = parseInt(args.depth ?? '3');
        const customExcludes = args.exclude
            ? (args.exclude as string).split(',').map((s: string) => s.trim())
            : [];

        const skipDirs = new Set([
            'node_modules', '.git', 'dist', '__pycache__', '.venv', 'venv',
            '.next', 'build', '.cache', 'coverage', 'logs', '.atcli-tmp',
            ...customExcludes
        ]);

        const lines: string[] = [];
        const relRoot = path.relative(cwd, rootPath).replace(/\\/g, '/') || '.';
        lines.push(`${relRoot}/`);

        const walk = async (dir: string, prefix: string, depth: number) => {
            if (depth > maxDepth) return;
            let entries: any[];
            try { entries = await fs.readdir(dir, { withFileTypes: true }); }
            catch { return; }

            // Dirs first, then files
            const dirs = entries.filter(e => e.isDirectory() && !skipDirs.has(e.name)).sort((a, b) => a.name.localeCompare(b.name));
            const files = entries.filter(e => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));
            const all = [...dirs, ...files];

            for (let i = 0; i < all.length; i++) {
                const entry = all[i];
                const isLast = i === all.length - 1;
                const connector = isLast ? '└── ' : '├── ';
                const childPrefix = prefix + (isLast ? '    ' : '│   ');
                const suffix = entry.isDirectory() ? '/' : '';
                lines.push(`${prefix}${connector}${entry.name}${suffix}`);
                if (entry.isDirectory()) {
                    await walk(path.join(dir, entry.name), childPrefix, depth + 1);
                }
            }
        };

        await walk(rootPath, '', 1);

        if (lines.length > 200) {
            return lines.slice(0, 200).join('\n') + `\n... (truncated, ${lines.length - 200} more entries)`;
        }
        return lines.join('\n');
    }
};

// ─── read_many ────────────────────────────────────────────────────────────────
export const ReadManySkill: AgentSkill = {
    name: 'read_many',
    description: `Reads up to 5 files in a SINGLE tool call. Saves API quota — use instead of calling read_file 5 times separately. Returns all file contents labeled by path.

Arguments:
  paths   (required) — array of file paths to read (max 5)`,
    example: `<tool_call>\n{"action": "read_many", "paths": ["src/app.py", "templates/index.html", "requirements.txt"]}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.paths || !Array.isArray(args.paths) || args.paths.length === 0) {
            return 'Error: paths array is required (e.g. ["src/app.py", "src/utils.py"])';
        }
        const cwd = (global as any).atcli_project_root || process.cwd();
        const paths = args.paths.slice(0, 5) as string[]; // max 5

        const results: string[] = [];
        for (const p of paths) {
            const targetPath = path.resolve(cwd, p);
            const secErr = assertSafe(targetPath);
            if (secErr) { results.push(`=== ${p} ===\n${secErr}`); continue; }
            try {
                const stat = await fs.stat(targetPath);
                if (stat.size > 500 * 1024) {
                    results.push(`=== ${p} ===\nError: File too large (${Math.round(stat.size / 1024)}KB > 500KB)`);
                    continue;
                }
                const content = await fs.readFile(targetPath, 'utf8');
                results.push(`=== ${p} (${content.split('\n').length} lines) ===\n${content}`);
            } catch (e: any) {
                results.push(`=== ${p} ===\nError: ${e.message}`);
            }
        }
        return results.join('\n\n');
    }
};

// ─── write_diff ───────────────────────────────────────────────────────────────
export const WriteDiffSkill: AgentSkill = {
    name: 'write_diff',
    description: `Writes a file with new content and shows a diff of what changed (added/removed lines). 
Use this instead of write_file when you want to verify your changes are correct.
Also creates a .bak backup automatically before overwriting.

Arguments:
  path      (required) — file path to write
  content   (required) — new full file content`,
    example: `<tool_call>\n{"action": "write_diff", "path": "src/app.py", "content": "# New content\\ndef main():\\n    pass"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path || args.content === undefined) return 'Error: path and content are required';
        const cwd = (global as any).atcli_project_root || process.cwd();
        const targetPath = path.resolve(cwd, args.path);
        const secErr = assertSafe(targetPath);
        if (secErr) return secErr;

        const lowerPath = targetPath.toLowerCase();
        if (lowerPath.endsWith('prompts.ts') || lowerPath.endsWith('prompts.js')) {
            return '❌ [HARD STOP] Cannot modify the ATCLI security prompt engine.';
        }

        try {
            await fs.mkdir(path.dirname(targetPath), { recursive: true });

            // Read old content for diff
            let oldLines: string[] = [];
            let isNew = false;
            try {
                const old = await fs.readFile(targetPath, 'utf8');
                oldLines = old.split('\n');
                // Create backup
                await fs.writeFile(targetPath + '.bak', old, 'utf8');
            } catch {
                isNew = true;
            }

            const newLines = (args.content as string).split('\n');
            await fs.writeFile(targetPath, args.content, 'utf8');

            if (isNew) {
                return `Success: Created ${args.path} (${newLines.length} lines, new file)`;
            }

            // Simple unified diff
            const diffLines: string[] = [];
            let added = 0, removed = 0;
            const maxOld = oldLines.length, maxNew = newLines.length;
            const maxLen = Math.max(maxOld, maxNew);

            for (let i = 0; i < maxLen && diffLines.length < 50; i++) {
                const o = oldLines[i];
                const n = newLines[i];
                if (o === undefined) { diffLines.push(`+ ${n}`); added++; }
                else if (n === undefined) { diffLines.push(`- ${o}`); removed++; }
                else if (o !== n) { diffLines.push(`- ${o}`); diffLines.push(`+ ${n}`); removed++; added++; }
            }

            if (diffLines.length === 0) {
                return `Success: Wrote ${args.path} — no changes detected (file identical).`;
            }

            const summary = `+${added} lines, -${removed} lines`;
            const diffPreview = diffLines.slice(0, 30).join('\n');
            const truncated = diffLines.length > 30 ? `\n... (${diffLines.length - 30} more diff lines)` : '';
            return `Success: Wrote ${args.path} (${summary})\nBackup: ${args.path}.bak\n\nDiff:\n${diffPreview}${truncated}`;
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }
};

// ─── str_replace_editor ───────────────────────────────────────────────────────
export const StrReplaceEditorSkill: AgentSkill = {
    name: 'str_replace_editor',
    description: `Kimi/Claude-style exact match string replacer. Replaces EXACT substrings in a file and returns a unified diff. 
You must provide the exact string including all original whitespace and indentation. Use grep_search or read_lines first to see exact whitespace.

Arguments:
  path       (required) — file path to edit
  old_str    (required) — the EXACT string to replace
  new_str    (required) — the new string to replace it with`,
    example: `<tool_call>\n{"action": "str_replace_editor", "path": "src/app.py", "old_str": "    def test():\\n        pass", "new_str": "    def test():\\n        return True"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path || args.old_str === undefined || args.new_str === undefined) {
            return 'Error: path, old_str, and new_str are required';
        }
        const cwd = (global as any).atcli_project_root || process.cwd();
        const targetPath = path.resolve(cwd, args.path);
        const secErr = assertSafe(targetPath);
        if (secErr) return secErr;

        const lowerPath = targetPath.toLowerCase();
        if (lowerPath.endsWith('prompts.ts') || lowerPath.endsWith('prompts.js')) {
            return '❌ [HARD STOP] Cannot modify the ATCLI security prompt engine.';
        }

        try {
            const oldContent = await fs.readFile(targetPath, 'utf8');
            
            // Check if old_str exists
            const occurrences = oldContent.split(args.old_str).length - 1;
            
            if (occurrences === 0) {
                return `Error: 'old_str' not found in ${args.path}. You must match the EXACT text including spaces and newlines. Try using grep_search first to copy the exact text.`;
            }
            if (occurrences > 1) {
                return `Error: 'old_str' matches ${occurrences} places in ${args.path}. Please provide a larger block of text in 'old_str' so it uniquely matches only the section you want to change.`;
            }

            // Exactly 1 match, safe to replace
            const newContent = oldContent.replace(args.old_str, args.new_str);
            
            // Save backup and write new file
            await fs.writeFile(targetPath + '.bak', oldContent, 'utf8');
            await fs.writeFile(targetPath, newContent, 'utf8');

            // Diff generation
            const oldLines = args.old_str.split('\n');
            const newLines = args.new_str.split('\n');
            
            const diffLines: string[] = [];
            let added = 0, removed = 0;
            const maxLen = Math.max(oldLines.length, newLines.length);

            for (let i = 0; i < maxLen && diffLines.length < 50; i++) {
                const o = oldLines[i];
                const n = newLines[i];
                if (o === undefined) { diffLines.push(`+ ${n}`); added++; }
                else if (n === undefined) { diffLines.push(`- ${o}`); removed++; }
                else if (o !== n) { diffLines.push(`- ${o}`); diffLines.push(`+ ${n}`); removed++; added++; }
            }

            const summary = `+${added} lines, -${removed} lines`;
            const diffPreview = diffLines.slice(0, 30).join('\n');
            const truncated = diffLines.length > 30 ? `\n... (${diffLines.length - 30} more diff lines)` : '';
            return `Success: 1 occurrence replaced in ${args.path} (${summary})\nBackup: ${args.path}.bak\n\nDiff:\n${diffPreview}${truncated}`;
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }
};
