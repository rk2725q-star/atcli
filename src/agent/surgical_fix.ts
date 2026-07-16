/**
 * surgical_fix.ts — Shared bug-fix enforcement for ALL agent loops
 *
 * Used by: AgentLoop (loop.ts), ManagerLoop (manager.ts), any future loops
 *
 * Rules enforced:
 * 1. write_file on EXISTING file → BLOCKED, show 25 numbered lines, force replace
 * 2. Error output with file:line → extractErrorContext() shows exact broken lines
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Check if this tool call is a write_file/create_file on an ALREADY existing file.
 * If so, return a blocking message that shows the file with line numbers.
 * Returns null if no interception needed (new file or non-write action).
 */
export function interceptFullFileWrite(
    toolCall: { action: string; path?: string },
    cwd: string
): string | null {
    if (toolCall.action !== 'write_file' && toolCall.action !== 'create_file') return null;
    if (!toolCall.path) return null;

    const targetPath = path.resolve(cwd, toolCall.path);
    if (!fs.existsSync(targetPath)) return null; // new file — allow write

    console.log(`\n⛔ [Smart Write] BLOCKED: ${toolCall.action} on existing '${toolCall.path}' — must use replace`);

    let existingContent = '(could not read)';
    let lineCount = 0;
    try {
        const raw = fs.readFileSync(targetPath, 'utf-8');
        const lines = raw.split('\n');
        lineCount = lines.length;
        existingContent = lines
            .slice(0, 25)
            .map((l, i) => `${String(i + 1).padStart(4)}: ${l}`)
            .join('\n') +
            (lineCount > 25 ? `\n     ... (${lineCount - 25} more lines — use read_file to see all)` : '');
    } catch { /* ignore */ }

    return [
        `⛔ WRITE BLOCKED: '${toolCall.path}' already exists (${lineCount} lines).`,
        `Full overwrite destroys working code outside the bug.`,
        ``,
        `File content (first 25 lines, numbered):`,
        existingContent,
        ``,
        `✅ CORRECT FIX PROTOCOL:`,
        `  1. Find the exact broken line number(s) from the error message above`,
        `  2. replace {"old": "<exact current broken text>", "new": "<corrected text>"}`,
        `  3. Only change what is broken — leave all other lines untouched`,
        `  4. Need more context? Use read_file first, then replace`,
        ``,
        `⛔ DO NOT retry write_file. Output a replace <tool_call> now.`,
    ].join('\n');
}

/**
 * Parse compiler/linter error output → extract file:line references →
 * read those files → show the ±3 lines around each error with >>> marker.
 * Returns a formatted string to inject into the gate message, or '' if nothing found.
 */
export function extractErrorContext(errorOutput: string, cwd: string): string {
    // Match: src/foo.ts(12,5)  or  src/foo.ts:12:5  or  ./foo.py:12
    const errorLinePattern = /([a-zA-Z0-9_./\\-]+\.[a-zA-Z]{1,10})[(:,](\d+)/g;
    const seen = new Set<string>();
    const contexts: string[] = [];

    let match;
    while ((match = errorLinePattern.exec(errorOutput)) !== null) {
        const [, filePath, lineStr] = match;
        const lineNum = parseInt(lineStr, 10);
        if (lineNum < 1 || lineNum > 100000) continue;

        const key = `${filePath}:${lineNum}`;
        if (seen.has(key) || seen.size >= 5) continue; // max 5 unique locations
        seen.add(key);

        try {
            const absPath = path.resolve(cwd, filePath);
            if (!fs.existsSync(absPath)) continue;

            const stat = fs.statSync(absPath);
            if (stat.size > 500 * 1024) continue; // skip huge files

            const lines = fs.readFileSync(absPath, 'utf-8').split('\n');
            const start = Math.max(0, lineNum - 4);
            const end = Math.min(lines.length - 1, lineNum + 2);

            const snippet = lines
                .slice(start, end + 1)
                .map((l, i) => {
                    const n = start + i + 1;
                    const marker = n === lineNum ? '>>>' : '   ';
                    return `${marker} ${String(n).padStart(4)}: ${l}`;
                })
                .join('\n');

            contexts.push(
                `\n[BROKEN at ${filePath}:${lineNum}]\n${snippet}`
            );
        } catch { /* ignore unreadable files */ }
    }

    if (contexts.length === 0) return '';

    return [
        `[ERROR CONTEXT — fix ONLY these lines with replace, nothing else]`,
        ...contexts,
    ].join('\n');
}

/**
 * Build the WORKSPACE GATE message with full surgical context.
 */
export function buildWorkspaceGateMessage(analyzeResult: string, cwd: string): string {
    const errorCtx = extractErrorContext(analyzeResult, cwd);
    return [
        `<tool_result>`,
        `[WORKSPACE GATE — SURGICAL FIX REQUIRED]`,
        analyzeResult,
        errorCtx ? `\n${errorCtx}` : '',
        ``,
        `⛔ RULE (ALL PROVIDERS): DO NOT use write_file on existing files.`,
        `✅ REQUIRED for each error:`,
        `  1. Identify the exact file:line from the error above`,
        `  2. read_file "<file>" — see full content if needed`,
        `  3. replace {"old": "<exact broken line>", "new": "<fixed line>"}`,
        `  4. Re-run workspace_analyze to confirm 0 failures`,
        `NEVER rewrite the whole file. Only the broken line(s).`,
        `</tool_result>`,
    ].join('\n');
}

/**
 * Build the AECL GATE message with exact error list.
 */
export function buildAeclGateMessage(mem: any): string {
    const errorList: string[] = (mem.errors || [])
        .slice(0, 10)
        .map((e: any) => `  • ${e.file || '?'}:${e.line || '?'} — ${e.message || e.text || JSON.stringify(e)}`);

    const errorSection = errorList.length > 0
        ? `\nExact errors:\n${errorList.join('\n')}`
        : '';

    return [
        `<tool_result>`,
        `[AECL GATE — SURGICAL FIX REQUIRED]`,
        `${mem.error_count} unresolved errors. Cannot finish until all fixed.${errorSection}`,
        ``,
        `⛔ FORBIDDEN (ALL PROVIDERS): write_file on existing files`,
        `✅ Fix each error:`,
        `  Step 1: read_file "<file from error>"`,
        `  Step 2: replace {"old": "<exact broken line>", "new": "<fixed line>"}`,
        `  Step 3: aecl_check — confirm fixed`,
        `  Repeat for each error. Do NOT touch lines that are not broken.`,
        `</tool_result>`,
    ].join('\n');
}
