import { AgentSkill } from './base';
import * as fs from 'fs/promises';
import * as path from 'path';

export const GetFileOutlineSkill: AgentSkill = {
    name: 'get_file_outline',
    description: 'Extracts only the structural outline (classes, functions, methods, and exports) of a file. Extremely useful for understanding large files without using too many tokens.',
    example: `<tool_call>\n{"action": "get_file_outline", "path": "src/app.js"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path) return "Error: path is required";
        const targetPath = path.resolve(process.cwd(), args.path);
        if (!targetPath.startsWith(process.cwd() + path.sep) && targetPath !== process.cwd()) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }
        
        try {
            const content = await fs.readFile(targetPath, 'utf8');
            const lines = content.split('\n');
            const outline: string[] = [];
            
            // Basic regex to match function, class, and method definitions in JS/TS/Python
            const pattern = /^(?:export\s+|async\s+)?(?:class|function|const\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=]+)\s*=>)\s+(\w+)|^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/i;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (pattern.test(line.trim())) {
                    outline.push(`Line ${i + 1}: ${line.trim()}`);
                }
            }
            
            if (outline.length === 0) return "No clear structural outline found. The file might not contain standard functions/classes.";
            return outline.join('\n');
        } catch (e: any) {
            return `Error reading file: ${e.message}`;
        }
    }
};
