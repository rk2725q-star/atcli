import { AgentSkill } from './base';
import { exec } from 'child_process';

const runGitCommand = (cmd: string): Promise<string> => {
    return new Promise((resolve) => {
        exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
            if (error) {
                // Ignore code 1 for git status/diff as it just means no changes or changes exist
                if (cmd.includes('status') || cmd.includes('diff')) {
                    resolve((stdout + "\n" + stderr).trim());
                } else {
                    resolve(`Git Error: ${error.message}\n${stderr}`);
                }
            } else {
                resolve(stdout.trim() || "Success (no output)");
            }
        });
    });
};

export const GitStatusSkill: AgentSkill = {
    name: 'git_status',
    description: 'Shows the working tree status. Use this to see which files you have modified or created.',
    example: `<tool_call>\n{"action": "git_status"}\n</tool_call>`,
    execute: async () => await runGitCommand('git status -s')
};

export const GitDiffSkill: AgentSkill = {
    name: 'git_diff',
    description: 'Shows changes between working tree and index. Use this to review your code changes before committing.',
    example: `<tool_call>\n{"action": "git_diff"}\n</tool_call>`,
    execute: async () => {
        const diff = await runGitCommand('git diff');
        if (diff.length > 50000) {
            return diff.substring(0, 50000) + "\n\n...[Diff truncated]...";
        }
        return diff || "No unstaged changes.";
    }
};

export const GitCommitSkill: AgentSkill = {
    name: 'git_commit',
    description: 'Stages all changes and commits them with a message. Automatically runs git add . before committing.',
    example: `<tool_call>\n{"action": "git_commit", "message": "feat: added login page"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.message) return "Error: message is required";
        // Simple safety to prevent command injection
        const safeMessage = args.message.replace(/"/g, '\\"');
        await runGitCommand('git add .');
        return await runGitCommand(`git commit -m "${safeMessage}"`);
    }
};

export const GitLogSkill: AgentSkill = {
    name: 'git_log',
    description: 'Shows the recent commit history. Useful for understanding what was recently changed.',
    example: `<tool_call>\n{"action": "git_log", "count": 5}\n</tool_call>`,
    execute: async (args: any) => {
        const count = args.count || 5;
        return await runGitCommand(`git log -n ${count} --oneline`);
    }
};

export const GitBranchSkill: AgentSkill = {
    name: 'git_branch',
    description: 'Creates and switches to a new branch, or just lists branches if no name is provided.',
    example: `<tool_call>\n{"action": "git_branch", "name": "feature/login"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.name) {
            return await runGitCommand('git branch');
        }
        // Safe branch name
        const safeName = args.name.replace(/[^a-zA-Z0-9\-_/]/g, '');
        return await runGitCommand(`git checkout -b ${safeName}`);
    }
};
