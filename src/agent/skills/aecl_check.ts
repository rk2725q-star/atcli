import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as util from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execPromise = util.promisify(exec);

const AECL_MEMORY_FILE = '.aecl_memory.json';
const AECL_TMP_FILE = '.aecl_memory.tmp.json';

interface AeclError {
    file: string;
    line: number;
    col: number;
    message: string;
    severity: 'error' | 'warning';
    status: 'fix_now' | 'future_fix';
}

interface AeclMemory {
    error_count: number;
    warning_count: number;
    last_checked: string;
    files_checked: string[];
    errors: AeclError[];
    ai_notes: string;
    ignored_paths: string[];
}

/**
 * Atomically write AECL memory to prevent race conditions with the dashboard reader.
 * Write to .tmp first, then rename (atomic on all major OS filesystems).
 */
function writeAeclMemoryAtomic(cwd: string, data: AeclMemory): void {
    const tmpPath = path.join(cwd, AECL_TMP_FILE);
    const finalPath = path.join(cwd, AECL_MEMORY_FILE);
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, finalPath);
}

/**
 * Read existing AECL memory (or return fresh state).
 */
function readAeclMemory(cwd: string): AeclMemory {
    const memPath = path.join(cwd, AECL_MEMORY_FILE);
    if (fs.existsSync(memPath)) {
        try {
            return JSON.parse(fs.readFileSync(memPath, 'utf8'));
        } catch {
            // Corrupted - start fresh
        }
    }
    return {
        error_count: 0,
        warning_count: 0,
        last_checked: new Date().toISOString(),
        files_checked: [],
        errors: [],
        ai_notes: '',
        ignored_paths: ['node_modules', 'dist', '*.generated.ts', '.aecl_memory.json']
    };
}

/**
 * Parse tsc output into structured errors.
 */
function parseTscOutput(output: string): { errors: AeclError[], errorCount: number, warningCount: number } {
    const errors: AeclError[] = [];
    let errorCount = 0;
    let warningCount = 0;

    const lines = output.split('\n');
    for (const line of lines) {
        // Format: src/file.ts(10,5): error TS2345: ...
        const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/);
        if (match) {
            const severity = match[4] as 'error' | 'warning';
            errors.push({
                file: match[1].trim(),
                line: parseInt(match[2]),
                col: parseInt(match[3]),
                message: match[5].trim(),
                severity,
                status: 'fix_now'
            });
            if (severity === 'error') errorCount++;
            else warningCount++;
        }
    }

    return { errors, errorCount, warningCount };
}

export const AeclCheckSkill: AgentSkill = {
    name: 'aecl_check',
    description: `Auto Error Checker Live (AECL): Runs incremental TypeScript compilation across the entire project workspace (ignoring node_modules/dist) and writes structured error results to .aecl_memory.json. The AECL dashboard terminal reads this file live. 

WHEN TO USE:
1. After every 5 file writes/edits (the system enforces this mechanically)
2. Before project finalization (run until error_count === 0)

AECL INTELLIGENCE RULES:
- If a file error says "cannot find module X" and file X doesn't exist yet, mark it as "future_fix" in ai_notes.  
- If a file has syntax errors, fix them immediately.
- Always update ai_notes with your reasoning about each error.
- NEVER mark the project as complete if error_count > 0.

Arguments: { "files_written": ["list of files just written"], "ai_notes": "Your reasoning about errors" }`,
    example: `<tool_call>\n{"action": "aecl_check", "files_written": ["src/index.ts", "src/types.ts"], "ai_notes": "Created base types. Some import errors expected until router.ts is written."}\n</tool_call>`,
    execute: async (args: any) => {
        const cwd = process.cwd();
        const filesWritten: string[] = args.files_written || [];
        const aiNotes: string = args.ai_notes || '';
        
        console.log('\n🔍 [AECL] Running incremental TypeScript check...');
        
        // Read existing memory to keep cumulative history
        const existingMemory = readAeclMemory(cwd);
        
        // Track cumulative files checked
        const allFilesChecked = Array.from(new Set([...existingMemory.files_checked, ...filesWritten]));
        
        // Run tsc --noEmit --incremental (fast due to .tsbuildinfo cache)
        let tscOutput = '';
        try {
            const { stdout, stderr } = await execPromise(
                'npx tsc --noEmit --incremental 2>&1 || true',
                { cwd, maxBuffer: 1024 * 1024 * 5 }
            );
            tscOutput = stdout + stderr;
        } catch (err: any) {
            tscOutput = err.stdout || err.stderr || err.message || '';
        }
        
        // Parse errors, filter out ignored paths
        const { errors, errorCount, warningCount } = parseTscOutput(tscOutput);
        const ignoredPaths = existingMemory.ignored_paths;
        const filteredErrors = errors.filter(e => 
            !ignoredPaths.some(ig => e.file.includes(ig))
        );
        
        const now = new Date().toISOString();
        const newMemory: AeclMemory = {
            error_count: filteredErrors.filter(e => e.severity === 'error').length,
            warning_count: filteredErrors.filter(e => e.severity === 'warning').length,
            last_checked: now,
            files_checked: allFilesChecked,
            errors: filteredErrors,
            ai_notes: aiNotes || existingMemory.ai_notes,
            ignored_paths: ignoredPaths
        };
        
        // ATOMIC write to prevent dashboard race conditions
        writeAeclMemoryAtomic(cwd, newMemory);
        
        console.log(`\n📊 [AECL] Check complete: ${newMemory.error_count} errors, ${newMemory.warning_count} warnings`);
        console.log(`[AECL] Total files tracked: ${allFilesChecked.length}`);
        
        // Build structured result for AI
        const errorSummary = filteredErrors.slice(0, 20).map(e => 
            `  [${e.severity.toUpperCase()}] ${e.file}:${e.line} - ${e.message}`
        ).join('\n');
        
        let result = `[AECL CHECK COMPLETE]
Total Errors: ${newMemory.error_count}
Total Warnings: ${newMemory.warning_count}
Total Files Tracked: ${allFilesChecked.length}
Last Checked: ${now}

${filteredErrors.length > 0 ? 'ERRORS:\n' + errorSummary : '✅ No errors found!'}

AECL Memory saved to: ${path.join(cwd, AECL_MEMORY_FILE)}`;

        if (newMemory.error_count > 0) {
            result += `\n\n[AECL ENFORCEMENT] You MUST fix these errors before proceeding. If an error is due to a missing file that will be created later, add it to ai_notes as "future_fix". Otherwise fix it NOW.`;
        } else {
            result += `\n\n[AECL] ✅ All clear! Zero errors. You may proceed to finalization.`;
        }
        
        return result;
    }
};
