import { AgentSkill } from './base';
import * as fs from 'fs/promises';
import * as path from 'path';

export const ListDirSkill: AgentSkill = {
    name: 'list_dir',
    description: 'Lists the contents of a directory. Useful for exploring project structure without reading files.',
    example: `<tool_call>\n{"action": "list_dir", "path": "./"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path) return "Error: path is required";
        const targetPath = path.resolve(process.cwd(), args.path);
        if (!targetPath.startsWith(process.cwd() + path.sep) && targetPath !== process.cwd()) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }
        const files = await fs.readdir(targetPath, { withFileTypes: true });
        const result = files.map(f => `${f.isDirectory() ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n');
        return result || "Directory is empty";
    }
};

export const ReadFileSkill: AgentSkill = {
    name: 'read_file',
    description: 'Reads the entire contents of a specific file. Do NOT read excessively large files.',
    example: `<tool_call>\n{"action": "read_file", "path": "src/index.js"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path) return "Error: path is required";
        const targetPath = path.resolve(process.cwd(), args.path);
        if (!targetPath.startsWith(process.cwd() + path.sep) && targetPath !== process.cwd()) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }
        const stat = await fs.stat(targetPath);
        if (stat.size > 1024 * 1024) {
            return "Error: File is too large (>1MB) to read into context memory.";
        }
        return await fs.readFile(targetPath, 'utf8');
    }
};

export const ReadLinesSkill: AgentSkill = {
    name: 'read_lines',
    description: 'Reads a specific range of lines from a file. Useful to read small chunks of a massive file without exceeding memory.',
    example: `<tool_call>\n{"action": "read_lines", "path": "src/app.js", "start": 50, "end": 100}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path || args.start === undefined || args.end === undefined) return "Error: path, start, and end are required";
        const targetPath = path.resolve(process.cwd(), args.path);
        if (!targetPath.startsWith(process.cwd() + path.sep) && targetPath !== process.cwd()) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }
        try {
            const content = await fs.readFile(targetPath, 'utf8');
            const lines = content.split('\n');
            const chunk = lines.slice(Math.max(0, args.start - 1), args.end);
            return chunk.map((l, i) => `Line ${args.start + i}: ${l}`).join('\n');
        } catch (e: any) {
            return `Error reading lines: ${e.message}`;
        }
    }
};
