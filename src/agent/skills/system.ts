import { AgentSkill } from './base';
import * as os from 'os';
import { exec } from 'child_process';

export const GetOsInfoSkill: AgentSkill = {
    name: 'get_os_info',
    description: 'Returns information about the operating system, architecture, and memory. Useful before writing bash vs powershell scripts.',
    example: `<tool_call>\n{"action": "get_os_info"}\n</tool_call>`,
    execute: async () => {
        return `OS: ${os.type()} ${os.release()}
Arch: ${os.arch()}
Platform: ${os.platform()}
Total Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB
Free Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB
Hostname: ${os.hostname()}`;
    }
};

export const GetEnvSkill: AgentSkill = {
    name: 'get_env',
    description: 'Reads a specific environment variable from the system.',
    example: `<tool_call>\n{"action": "get_env", "key": "PATH"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.key) return "Error: key is required";
        const val = process.env[args.key];
        return val !== undefined ? val : `Environment variable ${args.key} is not set.`;
    }
};

export const ListPortsSkill: AgentSkill = {
    name: 'list_ports',
    description: 'Lists all actively listening local ports. Very useful if you get an EADDRINUSE error.',
    example: `<tool_call>\n{"action": "list_ports"}\n</tool_call>`,
    execute: async () => {
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32'
                ? 'netstat -ano | findstr LISTENING'
                : 'lsof -i -P -n | grep LISTEN';
            
            exec(cmd, (error, stdout) => {
                if (error || !stdout) {
                    resolve("No listening ports found or command failed.");
                } else {
                    const lines = stdout.split('\n');
                    if (lines.length > 50) {
                        resolve(lines.slice(0, 50).join('\n') + `\n...and ${lines.length - 50} more. (Truncated)`);
                    } else {
                        resolve(stdout.trim());
                    }
                }
            });
        });
    }
};
