import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as util from 'util';
import * as readline from 'readline';

const execPromise = util.promisify(exec);

/**
 * Helper to prompt the user directly in the CLI during skill execution.
 */
function promptUserHITL(command: string): Promise<boolean> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        console.log(`\n\x1b[33m⚠️ [AI GATEKEEPER] The AI wants to execute a command:\x1b[0m`);
        console.log(`\x1b[36m> ${command}\x1b[0m`);
        
        rl.question(`Is this safe to run? (y/N): `, (answer) => {
            rl.close();
            const isApproved = answer.trim().toLowerCase() === 'y';
            resolve(isApproved);
        });
    });
}

export const SandboxCommandSkill: AgentSkill = {
    name: 'sandbox_command',
    description: 'Runs a terminal command securely. This uses Human-in-the-Loop (HITL). The user will be prompted to approve the command before it runs.',
    example: `<tool_call>\n{"action": "sandbox_command", "command": "npm install express"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.command) {
            return "Error: command is required";
        }
        
        try {
            const cwd = process.cwd();
            const cmd = args.command.toLowerCase();
            
            // 1. Path Escape Restriction (Chroot-lite) - basic sanity check
            if (cmd.includes('..\\') || cmd.includes('../') || cmd.includes('cd \\') || cmd.includes('cd /')) {
                return `[SECURITY VIOLATION] Command rejected. Attempting to traverse outside the workspace is strictly forbidden.`;
            }

            // 2. Intelligent Auto-Block (Protects non-technical users from OS destruction)
            const dangerousPatterns = [
                /\b(rm|del|rmdir|erase)\b/i,
                /\b(format|diskpart|mkfs|fdisk)\b/i,
                /\b(reg\s+add|reg\s+delete|reg\s+import)\b/i,
                /\b(netsh|ipconfig\s+\/release|route\s+add)\b/i,
                /\b(sudo|su|runas)\b/i,
                /\b(chmod|chown|icacls|takeown)\b/i,
                /\b(Invoke-WebRequest|wget|curl)\b/i, 
                /\b(shutdown|reboot|halt)\b/i
            ];

            for (const pattern of dangerousPatterns) {
                if (pattern.test(cmd)) {
                    console.log(`\n\x1b[31m⛔ [AUTO-BLOCKED] AI attempted a dangerous system command: ${args.command}\x1b[0m`);
                    return `[SECURITY VIOLATION] Command auto-rejected by Intelligent Gatekeeper. Destructive commands are forbidden.`;
                }
            }

            // 3. Intelligent Human-in-the-Loop Verification (For project-level commands)
            const isApproved = await promptUserHITL(args.command);
            
            if (!isApproved) {
                console.log(`\x1b[31m[!] Command blocked by Human Gatekeeper.\x1b[0m\n`);
                return `[SECURITY VIOLATION] The human user REJECTED this command. It was deemed unsafe or irrelevant. You must rethink your approach.`;
            }
            
            console.log(`\n\x1b[32m[✓] Command approved. Executing...\x1b[0m`);
            
            // Execute locally after human approval
            const { stdout, stderr } = await execPromise(args.command, { cwd, maxBuffer: 1024 * 1024 * 10 });
            return `[SANDBOX OUTPUT]\n${stdout}\n[SANDBOX STDERR]\n${stderr}`;
        } catch (error: any) {
            return `[SANDBOX ERROR]\n${error.message}\n[STDOUT]\n${error.stdout || ''}\n[STDERR]\n${error.stderr || ''}`;
        }
    }
};
