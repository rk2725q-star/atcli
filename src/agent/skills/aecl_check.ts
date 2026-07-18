import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as util from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execPromise = util.promisify(exec);

const AECL_MEMORY_FILE = '.aecl_memory.json';
const AECL_TMP_FILE = '.aecl_memory.tmp.json';
const DEFAULT_IGNORED_PATHS = [
    'node_modules',
    'dist',
    '.git',
    '.agents',
    '.codex',
    '*.generated.ts',
    '.aecl_memory.json',
    '.aecl_memory.tmp.json'
];

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
            const parsed = JSON.parse(fs.readFileSync(memPath, 'utf8')) as Partial<AeclMemory>;
            return {
                error_count: parsed.error_count ?? 0,
                warning_count: parsed.warning_count ?? 0,
                last_checked: parsed.last_checked ?? new Date().toISOString(),
                files_checked: parsed.files_checked ?? [],
                errors: parsed.errors ?? [],
                ai_notes: parsed.ai_notes ?? '',
                ignored_paths: Array.from(new Set([...(parsed.ignored_paths ?? []), ...DEFAULT_IGNORED_PATHS]))
            };
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
        ignored_paths: [...DEFAULT_IGNORED_PATHS]
    };
}

/**
 * Parse checker output (tsc, eslint, python) into structured errors.
 */
function parseCheckerOutput(output: string): { errors: AeclError[], errorCount: number, warningCount: number } {
    const errors: AeclError[] = [];
    let errorCount = 0;
    let warningCount = 0;

    const lines = output.split('\n');
    for (const line of lines) {
        // TS Format: src/file.ts(10,5): error TS2345: ...
        const tsMatch = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/);
        if (tsMatch) {
            const severity = tsMatch[4] as 'error' | 'warning';
            errors.push({ file: tsMatch[1].trim(), line: parseInt(tsMatch[2]), col: parseInt(tsMatch[3]), message: tsMatch[5].trim(), severity, status: 'fix_now' });
            if (severity === 'error') errorCount++; else warningCount++;
            continue;
        }


        // Python pyflakes format: file.py:10: message
        const pyMatch = line.match(/^(.+?):(\d+):(?:(\d+):\s)?(.+)$/);
        if (pyMatch && /\.py$/.test(pyMatch[1])) {
            const msg = pyMatch[4];
            const isWarning = /imported but unused|unable to detect undefined names|redefinition of unused/i.test(msg);
            errors.push({
                file: pyMatch[1].trim(), line: parseInt(pyMatch[2]), col: pyMatch[3] ? parseInt(pyMatch[3]) : 1,
                message: msg.trim(),
                severity: isWarning ? 'warning' : 'error',
                status: 'fix_now'
            });
            if (isWarning) warningCount++; else errorCount++;
            continue;
        }

        // ESLint Unix Format: file.js:1:1: error: Message [rule]
        const unixMatch = line.match(/^(.+?):(\d+):(\d+):\s+(error|warning)?(.*)$/i);
        if (unixMatch) {
            const severity = (unixMatch[4]?.toLowerCase() === 'warning') ? 'warning' : 'error';
            errors.push({ file: unixMatch[1].trim(), line: parseInt(unixMatch[2]), col: parseInt(unixMatch[3]), message: unixMatch[5].trim(), severity, status: 'fix_now' });
            if (severity === 'error') errorCount++; else warningCount++;
            continue;
        }

        // Python format: File "app.py", line 10
        const pySyntaxMatch = line.match(/^  File "([^"]+)", line (\d+)/);
        if (pySyntaxMatch) {
             errors.push({ file: pySyntaxMatch[1].trim(), line: parseInt(pySyntaxMatch[2]), col: 1, message: 'Python Syntax Error', severity: 'error', status: 'fix_now' });
             errorCount++;
             continue;
        }
    }

    // Fallback if there was output but no regex matched (e.g., checker missing or crashed)
    if (errors.length === 0 && output.trim().length > 0 && output.toLowerCase().includes('error')) {
         errors.push({ file: 'project', line: 1, col: 1, message: output.substring(0, 500).trim(), severity: 'error', status: 'fix_now' });
         errorCount++;
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
        const isFullScan: boolean = args.full_scan === true;
        const aiNotes: string = args.ai_notes || '';
        
        // Read existing memory to keep cumulative history
        const existingMemory = readAeclMemory(cwd);
        const ignoredPaths = existingMemory.ignored_paths;

        let allFilesChecked: string[];
        if (isFullScan) {
            console.log('\n🔍 [AECL] Running FULL PROJECT language check...');
            
            async function globProjectFiles(dir: string, ignoredPaths: string[]): Promise<string[]> {
                const results: string[] = [];
                const exts = /\.(ts|tsx|js|jsx|py)$/;
                async function walk(currentDir: string) {
                    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
                    for (const e of entries) {
                        const full = path.join(currentDir, e.name);
                        const rel = path.relative(cwd, full);
                        const normalizedRel = rel.replace(/\\/g, '/');
                        if (ignoredPaths.some(ig => normalizedRel.includes(ig) || normalizedRel === ig)) continue;
                        if (e.isDirectory()) await walk(full);
                        else if (exts.test(e.name)) results.push(rel);
                    }
                }
                await walk(dir);
                return results;
            }
            allFilesChecked = await globProjectFiles(cwd, ignoredPaths);
            
        } else {
            console.log('\n🔍 [AECL] Running incremental language check...');
            allFilesChecked = Array.from(new Set([...existingMemory.files_checked, ...filesWritten]));
        }
        
        const hasTs = allFilesChecked.some(f => /\.tsx?$/.test(f)) || fs.existsSync(path.join(cwd, 'tsconfig.json'));
        const hasPy = allFilesChecked.some(f => /\.py$/.test(f));
        const hasJs = allFilesChecked.some(f => /\.jsx?$/.test(f));
        
        let combinedOutput = '';
        let checkerFailed = false;
        let finalAiNotes = aiNotes || existingMemory.ai_notes;

        console.log(`\n🔍 [AECL] Running dynamic language checks (TS: ${hasTs}, PY: ${hasPy}, JS: ${hasJs})...`);

        const runCmd = async (cmd: string, execCwd: string = cwd): Promise<{output: string, failed: boolean}> => {
            try {
                const { stdout, stderr } = await execPromise(cmd, { cwd: execCwd, maxBuffer: 1024 * 1024 * 5 });
                return { output: (stdout || '') + (stderr || ''), failed: false };
            } catch (err: any) {
                return { output: (err.stdout || '') + (err.stderr || '') + (err.message || ''), failed: true };
            }
        };

        let universalFailures = 0;
        
        // --- UNIVERSAL PROJECT DETECTION ---
        if (fs.existsSync(path.join(cwd, 'package.json'))) {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
                const scripts = pkg.scripts || {};
                // Only run read-only / check scripts. We allow 'build' here if nothing else exists because users often rely on it for checking.
                const potentialScripts = ['analyze', 'check', 'validate', 'typecheck', 'lint', 'test', 'build'];
                const scriptsToRun = potentialScripts.filter(s => scripts[s]);
                for (const script of scriptsToRun) {
                    console.log(`\n🔍 [AECL] Running Universal Check: npm run ${script}...`);
                    const res = await runCmd(`npm run ${script}`, cwd);
                    combinedOutput += `\n[npm run ${script} output]\n` + res.output + '\n';
                    if (res.failed) {
                        checkerFailed = true;
                        universalFailures++;
                    }
                }
            } catch (e) {}
        }
        
        if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
            console.log(`\n🔍 [AECL] Running Universal Check: cargo check...`);
            const res = await runCmd('cargo check', cwd);
            combinedOutput += `\n[cargo check output]\n` + res.output + '\n';
            if (res.failed) {
                checkerFailed = true;
                universalFailures++;
            }
        }
        
        if (fs.existsSync(path.join(cwd, 'go.mod'))) {
            console.log(`\n🔍 [AECL] Running Universal Check: go vet & build...`);
            const resVet = await runCmd('go vet ./...', cwd);
            const resBuild = await runCmd('go build ./...', cwd);
            combinedOutput += `\n[go vet/build output]\n` + resVet.output + '\n' + resBuild.output + '\n';
            if (resVet.failed || resBuild.failed) {
                checkerFailed = true;
                universalFailures++;
            }
        }

        if (hasTs) {
            // Dynamically discover all unique sub-projects with a tsconfig.json that we touched
            const tsDirs = Array.from(new Set(allFilesChecked.filter(f => /\.tsx?$/.test(f)).map(f => path.dirname(path.join(cwd, f)))));
            const tsconfigPaths = new Set<string>();
            for (let d of tsDirs) {
                let curr = d;
                while (curr.length >= cwd.length && curr.startsWith(cwd)) {
                    if (fs.existsSync(path.join(curr, 'tsconfig.json'))) {
                        tsconfigPaths.add(curr);
                        break;
                    }
                    curr = path.dirname(curr);
                }
            }

            if (tsconfigPaths.size > 0) {
                for (const tsconfigDir of tsconfigPaths) {
                    let tscCmd = 'npx tsc --noEmit';
                    try {
                        const tsconfigContent = fs.readFileSync(path.join(tsconfigDir, 'tsconfig.json'), 'utf-8');
                        if (tsconfigContent.includes('"references"')) {
                            tscCmd = 'npx tsc -b';
                        }
                    } catch (e) {}
                    const res = await runCmd(tscCmd, tsconfigDir);
                    if (res.failed) checkerFailed = true;
                    
                    const subpath = path.relative(cwd, tsconfigDir);
                    if (subpath && subpath !== '') {
                        // Re-map error paths from subproject-relative to workspace-relative so AECL can match them
                        const lines = res.output.split('\n');
                        const fixedOutput = lines.map((line: string) => {
                            const tsMatch = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:/);
                            if (tsMatch) {
                                return line.replace(tsMatch[1], path.join(subpath, tsMatch[1]).replace(/\\/g, '/'));
                            }
                            return line;
                        }).join('\n');
                        combinedOutput += fixedOutput + '\n';
                    } else {
                        combinedOutput += res.output + '\n';
                    }
                }
            } else {
                const res = await runCmd('npx tsc --noEmit');
                if (res.failed) checkerFailed = true;
                combinedOutput += res.output + '\n';
            }
        }
        
        if (hasPy) {
            const pyFiles = allFilesChecked.filter(f => /\.py$/.test(f));
            if (pyFiles.length > 0) {
                // Try pyflakes for rich diagnostics (undefined names, etc.), fallback to py_compile if missing
                const pyCmd = process.platform === 'win32' 
                    ? `python -m pyflakes ${pyFiles.join(' ')} 2>nul || py -m pyflakes ${pyFiles.join(' ')} 2>nul || python -m py_compile ${pyFiles.join(' ')} 2>nul || py -m py_compile ${pyFiles.join(' ')} 2>nul || python3 -m py_compile ${pyFiles.join(' ')}`
                    : `python3 -m pyflakes ${pyFiles.join(' ')} 2>/dev/null || python -m pyflakes ${pyFiles.join(' ')} 2>/dev/null || python3 -m py_compile ${pyFiles.join(' ')} 2>/dev/null || python -m py_compile ${pyFiles.join(' ')}`;
                const res = await runCmd(pyCmd);
                if (res.failed) checkerFailed = true;
                combinedOutput += res.output;
            }
        }

        if (hasJs) {
            const jsFiles = allFilesChecked.filter(f => /\.jsx?$/.test(f));
            if (jsFiles.length > 0) {
                const eslintBin = process.platform === 'win32'
                    ? path.join(cwd, 'node_modules', '.bin', 'eslint.cmd')
                    : path.join(cwd, 'node_modules', '.bin', 'eslint');

                if (fs.existsSync(eslintBin)) {
                    // unix format is easily parseable by our generic unix match
                    const res = await runCmd(`"${eslintBin}" --format unix --no-eslintrc --env browser,es2021 ${jsFiles.join(' ')}`);
                    if (res.failed) checkerFailed = true;
                    combinedOutput += res.output;
                } else {
                    console.log(`\n[AECL] Skipping local JS lint (no eslint). Falling back to node --check and npx eslint@8 for deep syntax & logic errors...`);
                    const resNode = await runCmd(`node --check ${jsFiles.join(' ')}`);
                    if (resNode.failed) checkerFailed = true;
                    combinedOutput += resNode.output;
                    
                    const resEslint = await runCmd(`npx eslint@8 --format unix --no-eslintrc --env node --env browser --env es2021 --parser-options=sourceType:module ${jsFiles.join(' ')}`);
                    if (resEslint.failed) checkerFailed = true;
                    combinedOutput += resEslint.output;
                }
            }
        }
        
        // Parse errors, filter out ignored paths
        const { errors, errorCount, warningCount } = parseCheckerOutput(combinedOutput);
        const filteredErrors = errors.filter(e => 
            !ignoredPaths.some(ig => e.file.includes(ig))
        );
        
        const parsedErrorCount = filteredErrors.filter(e => e.severity === 'error').length;
        
        // Fatal commands (crashes, command not found) vs normal diagnostic failure:
        // Linters and compilers often exit with non-zero when they find *valid* errors.
        // We consider it a "fatal crash" if a command failed but produced NO parseable structured errors.
        const isFatalCrash = checkerFailed && parsedErrorCount === 0;

        if (isFatalCrash || (combinedOutput.includes('command not found') || combinedOutput.includes('is not recognized'))) {
            finalAiNotes = `[STATE: checker_unavailable] A required linter or compiler failed to execute, or crashed without structured errors. Raw output: ${combinedOutput.substring(0, 200)} ` + finalAiNotes;
        }
        
        // FATAL ERROR TRAPPING: If commands failed but we parsed 0 structured errors, 
        // force error_count > 0 so the gate blocks! We MUST inject a synthetic error 
        // into the array so the Dashboard and the Agent's loop can actually see *why* it failed.
        if (isFatalCrash) {
            filteredErrors.push({
                file: 'project-workspace',
                line: 1,
                col: 1,
                message: `Fatal Build/Lint Crash: A command exited with a non-zero status but no structured errors were found. Check raw output.`,
                severity: 'error',
                status: 'fix_now'
            });
        }
        
        const finalErrorCount = filteredErrors.filter(e => e.severity === 'error').length;

        const now = new Date().toISOString();
        const newMemory: AeclMemory = {
            error_count: finalErrorCount,
            warning_count: filteredErrors.filter(e => e.severity === 'warning').length,
            last_checked: now,
            files_checked: allFilesChecked,
            errors: filteredErrors,
            ai_notes: finalAiNotes,
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
Last Checked: ${now}\n\n`;

        if (filteredErrors.length > 0) {
            result += 'ERRORS:\n' + errorSummary;
        } else if (checkerFailed) {
            result += `[FATAL BUILD/LINT CRASH] Command returned non-zero exit code but no structured errors were found.\n\nRAW OUTPUT TRACE:\n${combinedOutput.substring(0, 1500)}...`;
        } else {
            result += '✅ No errors found!';
        }
        
        result += `\n\nAECL Memory saved to: ${path.join(cwd, AECL_MEMORY_FILE)}`;

        if (newMemory.error_count > 0) {
            result += `\n\n[AECL ENFORCEMENT] You MUST fix these errors before proceeding. If an error is due to a missing file that will be created later, add it to ai_notes as "future_fix". Otherwise fix it NOW.`;
        } else {
            result += `\n\n[AECL] ✅ All clear! Zero errors. You may proceed to finalization.`;
        }
        
        return result;
    }
};
