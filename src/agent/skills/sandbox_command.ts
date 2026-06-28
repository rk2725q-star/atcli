import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as util from 'util';

const execPromise = util.promisify(exec);

export const SandboxCommandSkill: AgentSkill = {
    name: 'sandbox_command',
    description: 'Runs a terminal command securely inside an isolated ephemeral Docker container (node:20) mapped to the current workspace. Use this for ALL package installations, unfamiliar script executions, and builds to prevent damaging the host OS.',
    example: `<tool_call>\n{"action": "sandbox_command", "command": "npm install express"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.command) {
            return "Error: command is required";
        }
        
        try {
            const cwd = process.cwd();
            // Escaping the command for bash inside the container
            const safeCommand = args.command.replace(/"/g, '\\"');
            
            console.log(`[Sandbox] Running secure command in Docker: ${args.command}`);
            // Use docker to run the command mapped to the workspace
            // We use -i for interactive without tty to prevent hanging
            const dockerCmd = `docker run --rm -i -v "${cwd}:/workspace" -w /workspace node:20 bash -c "${safeCommand}"`;
            
            const { stdout, stderr } = await execPromise(dockerCmd, { maxBuffer: 1024 * 1024 * 10 });
            return `[SANDBOX OUTPUT]\n${stdout}\n[SANDBOX STDERR]\n${stderr}`;
        } catch (error: any) {
            return `[SANDBOX ERROR]\n${error.message}\n[STDOUT]\n${error.stdout}\n[STDERR]\n${error.stderr}`;
        }
    }
};
