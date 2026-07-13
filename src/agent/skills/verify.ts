import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

export const VerifyCodeSkill: AgentSkill = {
    name: 'verify_code',
    description: 'Runs checks (syntax, types, linters, or tests) on a file or project directory. Use this immediately after writing code to verify it works.',
    example: `<tool_call>\n{"action": "verify_code", "target": "src/app.js"}\n</tool_call>`,
    execute: async (args: any) => {
        const target = args.target || '.';
        const targetPath = path.resolve(process.cwd(), target);
        if (!targetPath.startsWith(process.cwd() + path.sep) && targetPath !== process.cwd()) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }

        return new Promise(async (resolve) => {
            try {
                const stat = await fs.stat(targetPath);
                
                let cmd = '';

                if (stat.isFile()) {
                    if (target.endsWith('.js')) {
                        cmd = `node --check "${targetPath}"`;
                    } else if (target.endsWith('.ts')) {
                        cmd = `npx tsc --noEmit --incremental "${targetPath}"`;
                    } else {
                        resolve(`Verification not natively supported for file type of ${target}`);
                        return;
                    }
                } else if (stat.isDirectory()) {
                    // Check package.json for standard scripts
                    try {
                        const pkgRaw = await fs.readFile(path.join(targetPath, 'package.json'), 'utf8');
                        const pkg = JSON.parse(pkgRaw);
                        if (pkg.scripts?.lint) {
                            cmd = 'npm run lint';
                        } else if (pkg.scripts?.build) {
                            cmd = 'npm run build';
                        } else if (pkg.scripts?.test) {
                            cmd = 'npm run test';
                        } else {
                            cmd = 'npx tsc --noEmit'; // Fallback for TS projects without scripts
                        }
                    } catch (e) {
                        resolve("No package.json found in directory. Cannot automatically determine verification command.");
                        return;
                    }
                }

                exec(cmd, { cwd: stat.isDirectory() ? targetPath : process.cwd() }, (error, stdout, stderr) => {
                    if (error || stderr) {
                        resolve(`⚠️ ERRORS FOUND:\n${stderr || stdout || error?.message}\n\nUse read_file to inspect the affected file, then use the replace tool to patch only the broken lines or smallest safe block. Do NOT rewrite the full file unless it is brand new or completely unrecoverable.`);
                    } else {
                        resolve(`✅ Success: No errors found in ${target}!`);
                    }
                });

            } catch (err: any) {
                resolve(`Error finding target: ${err.message}`);
            }
        });
    }
};
