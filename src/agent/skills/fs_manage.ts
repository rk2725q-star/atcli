import { AgentSkill } from './base';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';

export const DeleteFileSkill: AgentSkill = {
    name: 'delete_file',
    description: 'Deletes a file or directory permanently.',
    example: `<tool_call>\n{"action": "delete_file", "path": "src/old_file.js"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path) return "Error: path is required";
        const targetPath = path.resolve(process.cwd(), args.path);
        if (!targetPath.startsWith(process.cwd())) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }
        try {
            await fs.rm(targetPath, { recursive: true, force: true });
            return `Success: Deleted ${args.path}`;
        } catch (e: any) {
            return `Error deleting file: ${e.message}`;
        }
    }
};

export const MoveFileSkill: AgentSkill = {
    name: 'move_file',
    description: 'Moves or renames a file or directory.',
    example: `<tool_call>\n{"action": "move_file", "source": "src/old.js", "destination": "src/new.js"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.source || !args.destination) return "Error: source and destination are required";
        const sourcePath = path.resolve(process.cwd(), args.source);
        const destPath = path.resolve(process.cwd(), args.destination);
        if (!sourcePath.startsWith(process.cwd()) || !destPath.startsWith(process.cwd())) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }
        try {
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            await fs.rename(sourcePath, destPath);
            return `Success: Moved ${args.source} to ${args.destination}`;
        } catch (e: any) {
            return `Error moving file: ${e.message}`;
        }
    }
};

export const FindFilesSkill: AgentSkill = {
    name: 'find_files',
    description: 'Finds files by name using glob patterns (e.g. *.ts). Useful to find all test files or config files.',
    example: `<tool_call>\n{"action": "find_files", "pattern": "*.test.ts"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.pattern) return "Error: pattern is required";
        return new Promise((resolve) => {
            // Using find on unix or dir /s /b on windows
            const cmd = process.platform === 'win32' 
                ? `dir /s /b "${args.pattern}"` 
                : `find . -name "${args.pattern}"`;
            
            exec(cmd, { cwd: process.cwd() }, (error, stdout) => {
                if (error) {
                    resolve("No files found matching that pattern.");
                } else {
                    const lines = stdout.split('\n');
                    if (lines.length > 50) {
                        resolve(lines.slice(0, 50).join('\n') + `\n...and ${lines.length - 50} more matches.`);
                    } else {
                        resolve(stdout.trim());
                    }
                }
            });
        });
    }
};

export const CopyFileSkill: AgentSkill = {
    name: 'copy_file',
    description: 'Copies a file or directory to a new location.',
    example: `<tool_call>\n{"action": "copy_file", "source": "src/template.js", "destination": "src/app.js"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.source || !args.destination) return "Error: source and destination are required";
        const sourcePath = path.resolve(process.cwd(), args.source);
        const destPath = path.resolve(process.cwd(), args.destination);
        if (!sourcePath.startsWith(process.cwd()) || !destPath.startsWith(process.cwd())) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }
        try {
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            await fs.cp(sourcePath, destPath, { recursive: true });
            return `Success: Copied ${args.source} to ${args.destination}`;
        } catch (e: any) {
            return `Error copying file: ${e.message}`;
        }
    }
};
