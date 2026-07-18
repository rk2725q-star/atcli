import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

const execPromise = util.promisify(exec);

interface CheckResult {
    label: string;
    command: string;
    cwd: string;
    passed: boolean;
    output: string;
}

function shellJoin(items: string[]): string {
    return items.map(item => `"${item}"`).join(' ');
}

function truncate(text: string, max = 2500): string {
    return text.length > max ? text.substring(0, max) + '\n...[TRUNCATED]...' : text;
}

async function runCheck(command: string, cwd: string, label: string): Promise<CheckResult> {
    try {
        const { stdout, stderr } = await execPromise(command, { cwd, maxBuffer: 1024 * 1024 * 5 });
        return {
            label,
            command,
            cwd,
            passed: true,
            output: `${stdout || ''}${stderr || ''}`.trim()
        };
    } catch (err: any) {
        return {
            label,
            command,
            cwd,
            passed: false,
            output: `${err.stdout || ''}${err.stderr || ''}${err.message || ''}`.trim()
        };
    }
}

export const WorkspaceAnalyzeSkill: AgentSkill = {
    name: 'workspace_analyze',
    description: 'Runs safe terminal-based diagnostics across the full workspace, not just AECL. It discovers project scripts and executes checks like typecheck, lint, test, and build, plus fallback compiler checks, then returns a pass/fail summary the agent must use to auto-fix until failures reach 0.',
    example: `<tool_call>\n{"action": "workspace_analyze", "mode": "full"}\n</tool_call>`,
    execute: async (args: any) => {
        const cwd = process.cwd();
        const mode = args.mode === 'quick' ? 'quick' : 'full';
        const includeBuild = args.include_build !== false && mode === 'full';

        const checks: Array<{ label: string; command: string; cwd: string }> = [];

        const packageJsonPath = path.join(cwd, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const scripts = pkg.scripts || {};
                const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

                const potentialCheckScripts = ['analyze', 'check', 'validate', 'typecheck', 'lint', 'test'];
                for (const scriptName of potentialCheckScripts) {
                    if (scripts[scriptName]) {
                        checks.push({
                            label: `npm run ${scriptName}`,
                            command: `${npmCmd} run ${scriptName}`,
                            cwd
                        });
                    }
                }

                if (includeBuild && scripts.build) {
                    checks.push({
                        label: 'npm run build',
                        command: `${npmCmd} run build`,
                        cwd
                    });
                }
            } catch {
                // Ignore malformed package.json and continue with fallbacks.
            }
        }

        const tsconfigPath = path.join(cwd, 'tsconfig.json');
        if (fs.existsSync(tsconfigPath)) {
            const alreadyHasTypecheck = checks.some(check => check.label === 'npm run typecheck');
            if (!alreadyHasTypecheck) {
                checks.push({
                    label: 'TypeScript noEmit',
                    command: 'npx tsc --noEmit',
                    cwd
                });
            }
        }

        const pyProjectMarkers = ['pyproject.toml', 'setup.py', 'requirements.txt']
            .map(file => path.join(cwd, file))
            .filter(fs.existsSync);
        const hasPythonProject = pyProjectMarkers.length > 0;
        if (hasPythonProject) {
            const pythonFiles: string[] = [];
            const walk = (dir: string) => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (['node_modules', 'dist', '.git', '.agents', '.codex', '__pycache__', '.venv', 'venv'].includes(entry.name)) {
                        continue;
                    }
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        walk(fullPath);
                    } else if (entry.isFile() && entry.name.endsWith('.py')) {
                        pythonFiles.push(path.relative(cwd, fullPath));
                    }
                }
            };
            walk(cwd);

            if (pythonFiles.length > 0) {
                checks.push({
                    label: 'Python compile',
                    command: process.platform === 'win32'
                        ? `py -m py_compile ${shellJoin(pythonFiles)}`
                        : `python3 -m py_compile ${shellJoin(pythonFiles)}`,
                    cwd
                });
            }
        }

        if (checks.length === 0) {
            return `[WORKSPACE ANALYZE COMPLETE]
Mode: ${mode}
Total Checks: 0
Passed: 0
Failed: 0

No workspace-level terminal checks were discovered.`;
        }

        const uniqueChecks = checks.filter((check, index, arr) =>
            arr.findIndex(candidate => candidate.command === check.command && candidate.cwd === check.cwd) === index
        );

        const results: CheckResult[] = [];
        for (const check of uniqueChecks) {
            console.log(`\n🔎 [Workspace Analyze] Running ${check.label}...`);
            results.push(await runCheck(check.command, check.cwd, check.label));
        }

        const failed = results.filter(result => !result.passed);
        const passed = results.length - failed.length;

        const sections = results.map(result => {
            const status = result.passed ? 'PASS' : 'FAIL';
            const body = result.output ? truncate(result.output) : '(no output)';
            return `[${status}] ${result.label}\nCommand: ${result.command}\n${body}`;
        });

        let summary = `[WORKSPACE ANALYZE COMPLETE]
Mode: ${mode}
Total Checks: ${results.length}
Passed: ${passed}
Failed: ${failed.length}
`;

        if (failed.length > 0) {
            summary += `\n[WORKSPACE ANALYZE FAILURES]\n${sections.filter((_, index) => !results[index].passed).join('\n\n')}`;
            summary += `\n\n[WORKSPACE ENFORCEMENT] Terminal-level workspace checks are still failing. You MUST inspect the raw output above, read the affected file(s), patch only the broken lines or smallest safe block with the replace tool, and re-run workspace_analyze until Failed: 0. Avoid full-file rewrites unless the file is brand new or irreparably wrong.`;
        } else {
            summary += `\n[WORKSPACE ANALYZE OK]\n${sections.join('\n\n')}\n\n[WORKSPACE] ✅ All discovered terminal diagnostics passed with 0 failures.`;
        }

        return summary;
    }
};
