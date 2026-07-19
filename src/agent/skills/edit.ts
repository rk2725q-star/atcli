import { AgentSkill } from './base';
import * as fs from 'fs/promises';
import * as path from 'path';

export const ReplaceSkill: AgentSkill = {
    name: 'replace',
    description: 'Intelligently replaces a specific block of text in a file. You can optionally provide startLine and endLine (1-indexed) to restrict the search and avoid duplicate matches.',
    example: `<tool_call>\n{"action": "replace", "path": "src/index.js", "search": "function old() {}", "replace": "function new() {}", "startLine": 10, "endLine": 20}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path || !args.search || args.replace === undefined) {
            return "Error: path, search, and replace are required";
        }
        const targetPath = path.resolve(process.cwd(), args.path);
        if (!targetPath.startsWith(process.cwd() + path.sep) && targetPath !== process.cwd()) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }

        // 🚨 HARDCODED SANDBOX INTERCEPTOR
        const lowerPath = targetPath.toLowerCase();
        if (lowerPath.endsWith('prompts.ts') || lowerPath.endsWith('prompts.js')) {
            return "❌ [HARD STOP] Security Protocol Triggered: You are strictly forbidden from modifying the ATCLI security prompt engine (prompts.ts).";
        }

        try {
            let content = await fs.readFile(targetPath, 'utf8');
            
            if (args.startLine && args.endLine) {
                const lines = content.split('\n');
                const startIdx = Math.max(0, parseInt(args.startLine) - 1);
                const endIdx = Math.min(lines.length, parseInt(args.endLine));
                const chunk = lines.slice(startIdx, endIdx).join('\n');
                
                if (!chunk.includes(args.search)) {
                    // Fuzzy fallback
                    const escaped = args.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const fuzzyRegex = new RegExp(escaped.replace(/\s+/g, '\\s+'));
                    const match = chunk.match(fuzzyRegex);
                    if (match) {
                        const replacedChunk = chunk.replace(match[0], args.replace);
                        lines.splice(startIdx, endIdx - startIdx, replacedChunk);
                        content = lines.join('\n');
                    } else {
                        const actualLines = chunk.split('\n').map((l, i) => `${startIdx + i + 1}: ${l}`).join('\n');
                        return `Error: Search string not found within lines ${args.startLine}-${args.endLine}. (Fuzzy match also failed).\nActual content of these lines:\n${actualLines}`;
                    }
                } else {
                    const replacedChunk = chunk.replace(args.search, args.replace);
                    lines.splice(startIdx, endIdx - startIdx, replacedChunk);
                    content = lines.join('\n');
                }
            } else {
                if (!content.includes(args.search)) {
                    // Fuzzy fallback
                    const escaped = args.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const fuzzyRegex = new RegExp(escaped.replace(/\s+/g, '\\s+'));
                    const match = content.match(fuzzyRegex);
                    if (match) {
                        content = content.replace(match[0], args.replace);
                    } else {
                        return `Error: Search string not found in the file (even with fuzzy whitespace matching). Make sure you provide the EXACT string. Try using read_file to check exact indentation, or specify startLine and endLine.`;
                    }
                } else {
                    content = content.replace(args.search, args.replace);
                }
            }
            
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
        if (!targetPath.startsWith(process.cwd() + path.sep) && targetPath !== process.cwd()) {
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
