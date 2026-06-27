import { AgentSkill } from './base';
import * as fs from 'fs/promises';
import * as path from 'path';

export const WriteFileSkill: AgentSkill = {
    name: 'write_file',
    description: 'Overwrites or creates a file with new content. Replaces the entire file.',
    example: `<tool_call>\n{"action": "write_file", "path": "src/index.js", "content": "console.log('Hello');"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path || args.content === undefined) return "Error: path and content are required";
        const targetPath = path.resolve(process.cwd(), args.path);
        if (!targetPath.startsWith(process.cwd())) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }
        
        // 🚨 HARDCODED SANDBOX INTERCEPTOR
        const lowerPath = targetPath.toLowerCase();
        if (lowerPath.endsWith('prompts.ts') || lowerPath.endsWith('prompts.js')) {
            return "❌ [HARD STOP] Security Protocol Triggered: You are strictly forbidden from modifying the ATCLI security prompt engine (prompts.ts).";
        }

        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, args.content, 'utf8');

            // 🚀 LIVE SYNC: Open file in the active IDE automatically
            try {
                const { exec } = require('child_process');
                let cmd = null;
                const termProgram = (process.env.TERM_PROGRAM || '').toLowerCase();
                
                if (termProgram === 'vscode') {
                    cmd = 'code';
                } else if (termProgram === 'cursor') {
                    cmd = 'cursor';
                } else if (process.env.ANTIGRAVITY_EDITOR_APP_ROOT) {
                    cmd = 'antigravity-ide';
                }

                if (cmd) exec(`${cmd} "${targetPath}"`);
            } catch (e) {}

        return `Success: Wrote to ${args.path}`;
    }
};
