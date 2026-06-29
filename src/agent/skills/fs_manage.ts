import { AgentSkill } from './base';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';

export const DeleteFileSkill: AgentSkill = {
    name: 'delete_file',
    description: 'Deletes a single file, a directory, or multiple files permanently in one command. To delete multiple files, pass an array to "paths".',
    example: `<tool_call>\n{"action": "delete_file", "paths": ["src/old_file.js", "src/old_style.css"]}\n</tool_call>`,
    execute: async (args: any) => {
        const pathsToDelete = args.paths || (args.path ? [args.path] : []);
        if (pathsToDelete.length === 0) return "Error: path or paths array is required";

        // Use IDE-detected project root as the security boundary
        const safeRoot = (global as any).atcli_project_root || process.cwd();
        const cwdWithSep = safeRoot.endsWith(path.sep) ? safeRoot : safeRoot + path.sep;

        let results = [];
        for (const p of pathsToDelete) {
            const targetPath = path.resolve(safeRoot, p);
            // A path is safe if it IS the safeRoot or strictly inside it (Windows-safe)
            const isSafe = targetPath === safeRoot || targetPath.startsWith(cwdWithSep);
            if (!isSafe) {
                return `Error: Security violation. Path '${p}' resolves outside the project safe zone (${safeRoot}).`;
            }
            try {
                await fs.rm(targetPath, { recursive: true, force: true });
                results.push(`Success: Deleted ${p}`);
            } catch (e: any) {
                results.push(`Error deleting ${p}: ${e.message}`);
            }
        }
        return results.join('\n');
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

export const ClearWorkspaceSkill: AgentSkill = {
    name: 'clear_workspace',
    description: 'Deletes all files and folders in the current workspace. Preserves .git, .agents, .atcli config folders and ATCLI memory files. By default also preserves node_modules (set keep_node_modules:false to delete it too for a full clean). Use when user says "delete all files", "clear workspace", "clear workshop", "fresh start", or "full clean".',
    example: `<tool_call>\n{"action": "clear_workspace", "keep_node_modules": false}\n</tool_call>`,
    execute: async (args: any) => {
        try {
            // Use IDE-detected project root as the safe zone to clear
            const cwd = (global as any).atcli_project_root || process.cwd();
            const files = await fs.readdir(cwd);

            // node_modules: kept for real projects (reinstall is slow), removed for full cleans
            const keepNodeModules = args.keep_node_modules !== false; // default: true
            const preserved = ['.git', '.atcli-skills', '.agents', '.atcli',
                               'ATCLI_MEMORY.md', 'AGENTICA_MEMORY.md'];
            if (keepNodeModules) preserved.push('node_modules');

            let deletedCount = 0;
            const deletedItems: string[] = [];
            
            for (const file of files) {
                if (!preserved.includes(file)) {
                    await fs.rm(path.join(cwd, file), { recursive: true, force: true });
                    deletedCount++;
                    deletedItems.push(file);
                }
            }

            const deletedList = deletedItems.length > 0
                ? `\nDeleted: ${deletedItems.join(', ')}`
                : '\nNothing to delete — workspace was already empty.';
            return `Success: Cleared ${deletedCount} items from workspace (${cwd}).${deletedList}\nPreserved: ${preserved.join(', ')}`;
        } catch (e: any) {
            return `Error clearing workspace: ${e.message}`;
        }
    }
};
