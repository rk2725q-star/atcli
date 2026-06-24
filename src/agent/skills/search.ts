import { AgentSkill } from './base';
import { exec } from 'child_process';

export const GrepSearchSkill: AgentSkill = {
    name: 'grep_search',
    description: 'Searches the entire project for a specific text pattern. Extremely useful to find function definitions without reading all files.',
    example: `<tool_call>\n{"action": "grep_search", "pattern": "function startServer"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.pattern) return "Error: pattern is required";
        return new Promise((resolve) => {
            // Using grep (Windows native findstr if grep not available, but let's assume bash/git-bash or ripgrep is standard in modern node dev envs.
            // A safer cross-platform node way is to run a simple node search script, or use git grep.
            // We will use 'git grep' as it's universally fast and ignores node_modules, falling back to 'findstr' or 'grep'.
            const cmd = `git grep -n "${args.pattern}" || grep -rn --exclude-dir=node_modules "${args.pattern}" .`;
            exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
                if (error && error.code === 1) {
                    resolve("No matches found."); // grep exits with 1 if no matches
                } else if (error && error.code !== 1) {
                    // Try fallback
                    resolve(`Search failed (git grep / grep): ${error.message}\nConsider using read_file instead if search tools are missing.`);
                } else {
                    // Limit output size
                    const lines = stdout.split('\n');
                    if (lines.length > 50) {
                        resolve(lines.slice(0, 50).join('\n') + `\n...and ${lines.length - 50} more matches. Output truncated.`);
                    } else {
                        resolve(stdout.trim());
                    }
                }
            });
        });
    }
};
