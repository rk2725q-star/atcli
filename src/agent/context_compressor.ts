import * as fs from 'fs';
import * as path from 'path';

// ContextCompressor ? token-budget based context assembly.
// Priority order: user request > errors > diffs > small files > AST symbols > grep > summaries
// Errors are NEVER truncated. Everything else respects the token budget.

export interface RawContext {
    userRequest: string;
    chatHistory?: string;
    errors?: string;           // build/lint/test errors ? never cut
    changedFiles?: Array<{path: string; diff?: string; content?: string; lines?: number}>;
    grepResults?: string;
    astSymbols?: string;       // function names, exports
    fileSummaries?: string;
    extraContext?: string;
}

export interface CompressedContext {
    text: string;
    tokenEstimate: number;
    slots: Record<string, number>; // token counts per slot
}

const CHARS_PER_TOKEN = 4; // ~4 chars per token (conservative)
function estimateTokens(text: string): number { return Math.ceil(text.length / CHARS_PER_TOKEN); }
function budgetChars(tokens: number): number { return tokens * CHARS_PER_TOKEN; }

export class ContextCompressor {
    private readonly budgetTokens: number;

    constructor(budgetTokens = 16000) {
        this.budgetTokens = budgetTokens;
    }

    compress(ctx: RawContext): CompressedContext {
        const slots: Record<string, number> = {};
        const parts: string[] = [];
        let remaining = this.budgetTokens;

        // SLOT 1: User request + history (2k tokens, always included)
        const slot1Budget = Math.min(2000, remaining);
        const requestText = this.buildSlot1(ctx, slot1Budget);
        parts.push(requestText);
        slots['request'] = estimateTokens(requestText);
        remaining -= slots['request'];

        // SLOT 2: Errors ? NEVER truncated (up to 4k tokens)
        if (ctx.errors && ctx.errors.trim()) {
            const errText = '=== BUILD/LINT/TEST ERRORS (NEVER TRUNCATED) ===\\n' + ctx.errors + '\\n=== END ERRORS ===';
            parts.push(errText);
            slots['errors'] = estimateTokens(errText);
            remaining -= slots['errors'];
        }

        // SLOT 3: Changed files ? diff first, then content if budget allows
        if (ctx.changedFiles && remaining > 500) {
            const fileText = this.buildFilesSlot(ctx.changedFiles, Math.min(8000, remaining));
            if (fileText) {
                parts.push(fileText);
                slots['files'] = estimateTokens(fileText);
                remaining -= slots['files'];
            }
        }

        // SLOT 4: grep results (1.5k tokens)
        if (ctx.grepResults && remaining > 300) {
            const grepBudget = Math.min(1500, remaining);
            const grepText = ctx.grepResults.substring(0, budgetChars(grepBudget));
            parts.push('=== GREP RESULTS ===\\n' + grepText);
            slots['grep'] = estimateTokens(grepText);
            remaining -= slots['grep'];
        }

        // SLOT 5: AST symbols (500 tokens)
        if (ctx.astSymbols && remaining > 200) {
            const symText = ctx.astSymbols.substring(0, budgetChars(Math.min(500, remaining)));
            parts.push('=== SYMBOLS ===\\n' + symText);
            slots['symbols'] = estimateTokens(symText);
            remaining -= slots['symbols'];
        }

        // SLOT 6: File summaries
        if (ctx.fileSummaries && remaining > 200) {
            const sumText = ctx.fileSummaries.substring(0, budgetChars(remaining - 200));
            parts.push('=== FILE SUMMARIES ===\\n' + sumText);
            slots['summaries'] = estimateTokens(sumText);
            remaining -= slots['summaries'];
        }

        // Extra context
        if (ctx.extraContext && remaining > 200) {
            const extra = ctx.extraContext.substring(0, budgetChars(remaining - 200));
            parts.push(extra);
            slots['extra'] = estimateTokens(extra);
        }

        const text = parts.filter(Boolean).join('\\n\\n');
        return { text, tokenEstimate: estimateTokens(text), slots };
    }

    private buildSlot1(ctx: RawContext, budgetTokens: number): string {
        const histChars = budgetChars(Math.floor(budgetTokens * 0.3));
        const reqChars = budgetChars(Math.floor(budgetTokens * 0.7));
        const hist = ctx.chatHistory ? ctx.chatHistory.substring(0, histChars) : '';
        const req = ctx.userRequest.substring(0, reqChars);
        return [hist ? '=== CHAT HISTORY ===\\n' + hist : '', '=== USER REQUEST ===\\n' + req].filter(Boolean).join('\\n\\n');
    }

    private buildFilesSlot(
        files: Array<{path: string; diff?: string; content?: string; lines?: number}>,
        budgetTokens: number
    ): string {
        const parts: string[] = [];
        let usedTokens = 0;
        for (const f of files) {
            if (usedTokens >= budgetTokens) break;
            const remaining = budgetTokens - usedTokens;
            // Prefer diff over full content
            if (f.diff) {
                const text = '--- ' + f.path + ' (diff) ---\\n' + f.diff.substring(0, budgetChars(Math.min(2000, remaining)));
                parts.push(text); usedTokens += estimateTokens(text);
            } else if (f.content && (f.lines ?? 9999) < 200) {
                // Small files: include full content
                const text = '--- ' + f.path + ' ---\\n' + f.content.substring(0, budgetChars(Math.min(3000, remaining)));
                parts.push(text); usedTokens += estimateTokens(text);
            } else if (f.content) {
                // Large files: extract function signatures only
                const symbols = extractSymbols(f.content);
                const text = '--- ' + f.path + ' (symbols only ? file >200 lines) ---\\n' + symbols.substring(0, budgetChars(Math.min(800, remaining)));
                parts.push(text); usedTokens += estimateTokens(text);
            }
        }
        return parts.length ? '=== CHANGED FILES ===\\n' + parts.join('\\n\\n') : '';
    }
}

/** Extract function/class/export names from TypeScript/JS source */
function extractSymbols(content: string): string {
    const lines = content.split('\\n');
    const symbols: string[] = [];
    for (const line of lines) {
        const t = line.trim();
        if (/^(exports+)?(asyncs+)?functions+w+/.test(t)) symbols.push(t.split('{')[0].trim());
        else if (/^(exports+)?(abstracts+)?classs+w+/.test(t)) symbols.push(t.split('{')[0].trim());
        else if (/^(exports+)?(const|let|var)s+w+s*=/.test(t)) symbols.push(t.split('=')[0].trim());
        else if (/^(exports+)?interfaces+w+/.test(t)) symbols.push(t.split('{')[0].trim());
        else if (/^(exports+)?types+w+/.test(t)) symbols.push(t.split('=')[0].trim());
    }
    return symbols.join('\\n');
}