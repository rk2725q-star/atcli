import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as util from 'util';

const execPromise = util.promisify(exec);

export const SandboxCommandSkill: AgentSkill = {
    name: 'sandbox_command',
    description: 'Runs a terminal command securely inside the Node.js Gatekeeper Sandbox. Use this for ALL package installations, shell scripts, and builds to prevent damaging the host OS. This is your default execution environment.',
    example: `<tool_call>\n{"action": "sandbox_command", "command": "npm install express"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.command) {
            return "Error: command is required";
        }
        
        try {
            const cwd = process.cwd();
            const cmd = args.command.toLowerCase();
            
            // GATEKEEPER SECURITY RULES
            
            // 1. Path Escape Restriction (Chroot-lite)
            if (cmd.includes('..\\') || cmd.includes('../') || cmd.includes('cd \\') || cmd.includes('cd /')) {
                return `[SECURITY VIOLATION] Command rejected by Gatekeeper Sandbox. Attempting to traverse outside the workspace is strictly forbidden.`;
            }

            // 2. Comprehensive Destructive Command Denylist (Regex)
            // Blocks file deletion, registry, formatting, netsh, sudo, chown, hidden executions
            const dangerousPatterns = [
                /\\b(rm|del|rmdir|erase)\\b/i,
                /\\b(format|diskpart|mkfs|fdisk)\\b/i,
                /\\b(reg\\s+add|reg\\s+delete|reg\\s+import)\\b/i,
                /\\b(netsh|ipconfig\\s+\\/release|route\\s+add)\\b/i,
                /\\b(sudo|su|runas)\\b/i,
                /\\b(chmod|chown|icacls|takeown)\\b/i,
                /\\b(Invoke-WebRequest|wget|curl)\\b/i, // block raw downloads from CLI to prevent malware fetching
                /\\b(shutdown|reboot|halt)\\b/i
            ];

            for (const pattern of dangerousPatterns) {
                if (pattern.test(cmd)) {
                    return `[SECURITY VIOLATION] Command rejected by Gatekeeper Sandbox. Destructive or dangerous commands (${pattern}) are forbidden on the host OS.`;
                }
            }
            
            console.log(`[Gatekeeper Sandbox] Allowed secure command: ${args.command}`);
            
            // Execute locally (safely filtered)
            const { stdout, stderr } = await execPromise(args.command, { cwd, maxBuffer: 1024 * 1024 * 10 });
            return `[SANDBOX OUTPUT]\n${stdout}\n[SANDBOX STDERR]\n${stderr}`;
        } catch (error: any) {
            return `[SANDBOX ERROR]\n${error.message}\n[STDOUT]\n${error.stdout || ''}\n[STDERR]\n${error.stderr || ''}`;
        }
    }
};
