import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Self-healing Validator ? runs build/lint/test cycle and extracts minimal error context.
// Instead of restarting the whole plan on failure, sends ONLY the error to LLM for repair.

export type ValidationResult = {
    passed: boolean;
    errors: string;
    errorFiles: string[];   // files with errors (for targeted re-read)
    phase: 'build' | 'lint' | 'test' | 'none';
};

export class Validator {
    private cwd: string;
    private maxRepairCycles: number;

    constructor(cwd: string, maxRepairCycles = 3) {
        this.cwd = cwd;
        this.maxRepairCycles = maxRepairCycles;
    }

    /** Run build ? lint ? test. Returns first failing phase and minimal error context. */
    async validate(): Promise<ValidationResult> {
        // Phase 1: TypeScript build
        const buildResult = this.runPhase('build', this.getBuildCommand());
        if (!buildResult.passed) return { ...buildResult, phase: 'build' };

        // Phase 2: Lint (optional ? skip if no config)
        const lintCmd = this.getLintCommand();
        if (lintCmd) {
            const lintResult = this.runPhase('lint', lintCmd);
            if (!lintResult.passed) return { ...lintResult, phase: 'lint' };
        }

        // Phase 3: Tests (optional ? skip if no test script)
        const testCmd = this.getTestCommand();
        if (testCmd) {
            const testResult = this.runPhase('test', testCmd);
            if (!testResult.passed) return { ...testResult, phase: 'test' };
        }

        return { passed: true, errors: '', errorFiles: [], phase: 'none' };
    }

    /** Extract minimal error context for LLM repair call (not the full codebase) */
    extractRepairContext(result: ValidationResult, originalIntent: string): string {
        const errorSnippets = this.extractErrorSnippets(result.errors, result.errorFiles);
        return [
            '=== VALIDATION FAILURE (' + result.phase.toUpperCase() + ') ===',
            'Original intent: ' + originalIntent,
            '',
            '--- Error Output ---',
            result.errors.substring(0, 3000),
            '',
            '--- Failing File Snippets ---',
            errorSnippets,
            '=================================',
            'Fix ONLY the failing code. Do not rewrite unrelated files.',
        ].join('\\n');
    }

    private runPhase(phase: string, command: string): Omit<ValidationResult, 'phase'> {
        try {
            execSync(command, { cwd: this.cwd, stdio: 'pipe', timeout: 60000 });
            process.stdout.write('[Validator] ' + phase + ' PASSED\\n');
            return { passed: true, errors: '', errorFiles: [] };
        } catch (e: unknown) {
            const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
            const output = [
                err.stdout?.toString() ?? '',
                err.stderr?.toString() ?? '',
                err.message ?? '',
            ].join('\\n').trim();
            const errorFiles = this.parseErrorFiles(output);
            process.stdout.write('[Validator] ' + phase + ' FAILED ? ' + errorFiles.length + ' file(s) with errors\\n');
            return { passed: false, errors: output, errorFiles };
        }
    }

    private parseErrorFiles(output: string): string[] {
        const fileSet = new Set<string>();
        // TypeScript: "src/foo.ts(12,3)"
        for (const m of output.matchAll(/([^s:]+.(ts|js|tsx|jsx|py|go))[(:]/g)) {
            const p = m[1]; if (fs.existsSync(path.isAbsolute(p) ? p : path.join(this.cwd, p))) fileSet.add(p);
        }
        return Array.from(fileSet).slice(0, 10);
    }

    private extractErrorSnippets(errors: string, errorFiles: string[]): string {
        const parts: string[] = [];
        for (const filePath of errorFiles.slice(0, 5)) {
            const fp = path.isAbsolute(filePath) ? filePath : path.join(this.cwd, filePath);
            if (!fs.existsSync(fp)) continue;
            // Find the failing line numbers from error output
            const lineNums = new Set<number>();
            for (const m of errors.matchAll(new RegExp(filePath.replace(/[\.]/g, '\\.') + '[:(](\\d+)', 'g'))) {
                lineNums.add(parseInt(m[1]) - 1);
            }
            if (lineNums.size === 0) continue;
            const lines = fs.readFileSync(fp, 'utf-8').split('\\n');
            const snippetLines: string[] = [];
            for (const ln of lineNums) {
                const start = Math.max(0, ln - 2); const end = Math.min(lines.length - 1, ln + 3);
                snippetLines.push('  Line ' + (ln+1) + ': ' + lines.slice(start, end).join('\\n'));
            }
            parts.push('File: ' + filePath + '\\n' + snippetLines.join('\\n'));
        }
        return parts.join('\\n\\n') || '(Could not extract snippets)';
    }

    private getBuildCommand(): string {
        const pkg = this.readPackageJson();
        if (pkg?.scripts?.build) return 'npm run build';
        if (fs.existsSync(path.join(this.cwd, 'tsconfig.json'))) return 'npx tsc --noEmit';
        return 'echo NO_BUILD_COMMAND';
    }

    private getLintCommand(): string | null {
        const pkg = this.readPackageJson();
        if (pkg?.scripts?.lint) return 'npm run lint';
        return null;
    }

    private getTestCommand(): string | null {
        const pkg = this.readPackageJson();
        if (pkg?.scripts?.test) return 'npm test -- --bail';
        return null;
    }

    private readPackageJson(): { scripts?: Record<string, string> } | null {
        try {
            const p = path.join(this.cwd, 'package.json');
            return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) as { scripts?: Record<string, string> } : null;
        } catch { return null; }
    }
}