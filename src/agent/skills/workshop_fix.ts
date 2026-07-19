import { AgentSkill } from './base';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { ApiRouter } from '../../providers/api-router';
import { FileSystemTools } from '../../tools/filesystem';

export const WorkshopFixSkill: AgentSkill = {
    name: 'workshop_fix',
    description: `[BETA] Autonomous Whole-File Error Fixer. 
Use this when a file has syntax or linter errors. This tool will spawn a background sub-agent that repeatedly runs the compiler on the file, analyzes the errors, and applies precise str_replace_editor patches until the file compiles cleanly (or hits a max loop limit).
This saves your main context window from being bloated by trial-and-error loops.

Arguments:
  file (required) — Absolute or relative path to the file to fix.
  compiler_cmd (optional) — Command to run to check errors (default: "npx tsc --noEmit" or "npm run lint").
`,
    example: `<tool_call>\n{"action": "workshop_fix", "file": "src/app.ts"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.file) return 'Error: file is required.';
        const cwd = (global as any).atcli_project_root || process.cwd();
        const fullPath = path.resolve(cwd, args.file);
        
        if (!fs.existsSync(fullPath)) return `Error: File not found at ${fullPath}`;

        let checkCmd = args.compiler_cmd;
        if (!checkCmd) {
            const pkgPath = path.join(cwd, 'package.json');
            if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
                checkCmd = 'npx tsc --noEmit';
            } else if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (pkg.scripts && pkg.scripts.lint) checkCmd = 'npm run lint';
            }
        }
        
        if (!checkCmd) {
            return `Error: Could not determine a compiler/linter command. Please provide 'compiler_cmd'.`;
        }

        console.log(`\n🛠️  [Workshop Auto-Fixer] Starting autonomous fixing loop for ${args.file}...`);
        
        const router = ApiRouter.getInstance();
        console.log(`   [Workshop] Using ApiRouter for fast fixing loop.`);

        const MAX_ITERATIONS = 4;
        let iteration = 0;
        let finalLog = `[Workshop Auto-Fixer Report for ${args.file}]\n\n`;

        while (iteration < MAX_ITERATIONS) {
            iteration++;
            let compileError = '';
            try {
                execSync(checkCmd, { cwd, encoding: 'utf-8', stdio: 'pipe' });
                // If it passes
                console.log(`✅ [Workshop] Iteration ${iteration}: 0 errors!`);
                finalLog += `Iteration ${iteration}: Compiler passed successfully.\n`;
                return finalLog + `\n✅ SUCCESS: File was fixed and now compiles cleanly!`;
            } catch (e: any) {
                compileError = (e.stdout || '') + '\n' + (e.stderr || '');
                // Trim massive outputs
                if (compileError.length > 2000) compileError = compileError.substring(0, 2000) + '\n...[truncated]';
            }

            console.log(`❌ [Workshop] Iteration ${iteration}: Found errors. Querying AI for patch...`);
            finalLog += `Iteration ${iteration}: Found errors, applying patch...\n`;

            const fileContent = fs.readFileSync(fullPath, 'utf-8');
            const lines = fileContent.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');

            const prompt = `You are a surgical syntax fixer.
A file has compilation errors. You must fix it by providing EXACT string replacements.

FILE: ${args.file}
CONTENT:
${lines}

COMPILER ERRORS:
${compileError}

Provide ONE exact string replacement to fix the primary error.
Return your response in STRICT JSON format:
{
  "old": "exact string to replace (from the file content above, without line numbers)",
  "new": "the corrected string"
}
DO NOT wrap in markdown. Output ONLY valid JSON.`;

            let patchStr = '';
            try {
                const response = await router.sendMessage(prompt);
                if (response.error) throw new Error(response.error);
                patchStr = response.text || '';
                
                // Strip markdown backticks if present
                patchStr = patchStr.replace(/^```json/im, '').replace(/^```/m, '').replace(/```$/m, '').trim();
                const patchJson = JSON.parse(patchStr);
                
                if (!patchJson.old || typeof patchJson.new !== 'string') {
                    throw new Error("Invalid patch JSON structure.");
                }

                console.log(`   [Workshop] Applying patch...`);
                const replaceResult = await FileSystemTools.strReplaceEditor(fullPath, patchJson.old, patchJson.new, undefined);
                
                if (replaceResult.includes('[ERROR]')) {
                    throw new Error(replaceResult);
                }
                finalLog += `   - Applied patch successfully.\n`;
            } catch (err: any) {
                console.log(`   [Workshop] Failed to apply patch: ${err.message}`);
                finalLog += `   - Failed to patch: ${err.message}\n`;
                // If patch parsing or matching fails, we just continue loop to try again, or it will eventually hit max loops.
            }
        }

        return finalLog + `\n⚠️ WARNING: Max iterations (${MAX_ITERATIONS}) reached. File may still have errors. Review manually.`;
    }
};
