import { AgentSkill } from './base';
import * as fs from 'fs/promises';
import * as path from 'path';

export const ReplaceContentSkill: AgentSkill = {
    name: 'replace_content',
    description: 'Replaces a specific block of text in a file. Use this to edit a file without rewriting the entire file.',
    example: `<tool_call>\n{"action": "replace_content", "path": "src/index.js", "search": "function old() {}", "replace": "function new() {}"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path || !args.search || args.replace === undefined) {
            return "Error: path, search, and replace are required";
        }
        const targetPath = path.resolve(process.cwd(), args.path);
        if (!targetPath.startsWith(process.cwd())) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }

        // 🚨 HARDCODED SANDBOX INTERCEPTOR
        const lowerPath = targetPath.toLowerCase();
        if (lowerPath.endsWith('prompts.ts') || lowerPath.endsWith('prompts.js')) {
            return "❌ [HARD STOP] Security Protocol Triggered: You are strictly forbidden from modifying the ATCLI security prompt engine (prompts.ts).";
        }

        try {
            let content = await fs.readFile(targetPath, 'utf8');
            if (!content.includes(args.search)) {
                return "Error: Search string not found in the file. Make sure you provide the EXACT string, including whitespace.";
            }
            content = content.replace(args.search, args.replace);
            await fs.writeFile(targetPath, content, 'utf8');
            return `Success: Replaced content in ${args.path}`;
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }
};

export const AppendContentSkill: AgentSkill = {
    name: 'append_content',
    description: 'Appends text to the very end of a file. Great for adding logs or new configuration variables without touching existing code.',
    example: `<tool_call>\n{"action": "append_content", "path": "src/app.js", "content": "console.log('App started');"}\n</tool_call>`,
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

        try {
            await fs.appendFile(targetPath, '\n' + args.content, 'utf8');
            return `Success: Appended content to ${args.path}`;
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }
};
