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

export const GetCurrentTimeSkill: AgentSkill = {
    name: 'get_current_time',
    description: 'Returns the exact true current date, time, and timezone of the local system. Very useful for answering time-sensitive questions or scheduling.',
    example: `<tool_call>\n{"action": "get_current_time"}\n</tool_call>`,
    execute: async () => {
        const now = new Date();
        return `Current Date and Time: ${now.toString()}\nISO: ${now.toISOString()}\nTimezone Offset: ${now.getTimezoneOffset()} minutes`;
    }
};

export const GetPublicIpSkill: AgentSkill = {
    name: 'get_public_ip',
    description: 'Fetches the public IP address of the machine running ATCLI.',
    example: `<tool_call>\n{"action": "get_public_ip"}\n</tool_call>`,
    execute: async () => {
        return new Promise((resolve) => {
            const https = require('https');
            https.get('https://api.ipify.org', (res: any) => {
                let data = '';
                res.on('data', (chunk: any) => data += chunk);
                res.on('end', () => resolve(`Public IP: ${data}`));
            }).on('error', (err: any) => resolve(`Failed to get IP: ${err.message}`));
        });
    }
};

export const PingUrlSkill: AgentSkill = {
    name: 'ping_url',
    description: 'Pings a URL (HTTP GET) to check if it is reachable and returns the status code.',
    example: `<tool_call>\n{"action": "ping_url", "url": "https://google.com"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.url) return "Error: url is required";
        return new Promise((resolve) => {
            const protocol = args.url.startsWith('https') ? require('https') : require('http');
            const start = Date.now();
            protocol.get(args.url, (res: any) => {
                const ms = Date.now() - start;
                resolve(`Status: ${res.statusCode} ${res.statusMessage}\\nTime: ${ms}ms`);
            }).on('error', (err: any) => resolve(`Ping failed: ${err.message}`));
        });
    }
};

export const ReadClipboardSkill: AgentSkill = {
    name: 'read_clipboard',
    description: 'Reads the current text content from the user\'s OS clipboard.',
    example: `<tool_call>\n{"action": "read_clipboard"}\n</tool_call>`,
    execute: async () => {
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32' ? 'powershell Get-Clipboard' : (process.platform === 'darwin' ? 'pbpaste' : 'xclip -selection clipboard -o');
            exec(cmd, (error, stdout) => {
                if (error) resolve("Failed to read clipboard or empty.");
                else resolve(stdout || "Clipboard is empty.");
            });
        });
    }
};

export const GetCpuInfoSkill: AgentSkill = {
    name: 'get_cpu_info',
    description: 'Gets detailed information about the CPU cores and load.',
    example: `<tool_call>\n{"action": "get_cpu_info"}\n</tool_call>`,
    execute: async () => {
        const cpus = os.cpus();
        const model = cpus[0].model;
        const cores = cpus.length;
        const load = os.loadavg();
        return `CPU Model: ${model}\\nCores: ${cores}\\nLoad Average (1, 5, 15 min): ${load.map(n => n.toFixed(2)).join(', ')}`;
    }
};

export const GetNetworkInterfacesSkill: AgentSkill = {
    name: 'get_network_interfaces',
    description: 'Returns all local network interfaces and local IP addresses of the machine.',
    example: `<tool_call>\n{"action": "get_network_interfaces"}\n</tool_call>`,
    execute: async () => {
        const nets = os.networkInterfaces();
        let result = '';
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]!) {
                if (net.family === 'IPv4' && !net.internal) {
                    result += `Interface: ${name}\\nIP: ${net.address}\\nMAC: ${net.mac}\\n\\n`;
                }
            }
        }
        return result.trim() || 'No external IPv4 interfaces found.';
    }
};

export const ListProcessesSkill: AgentSkill = {
    name: 'list_processes',
    description: 'Searches for running processes matching a keyword.',
    example: `<tool_call>\n{"action": "list_processes", "keyword": "node"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.keyword) return "Error: keyword is required";
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32' 
                ? \`tasklist | findstr /i "\${args.keyword}"\`
                : \`ps aux | grep -i "\${args.keyword}" | grep -v grep\`;
            exec(cmd, (error, stdout) => {
                if (error || !stdout) resolve(`No processes found matching '${args.keyword}'.`);
                else resolve(stdout.substring(0, 1000) + (stdout.length > 1000 ? '\\n...truncated' : ''));
            });
        });
    }
};

export const KillProcessSkill: AgentSkill = {
    name: 'kill_process',
    description: 'Kills a process by its PID.',
    example: `<tool_call>\n{"action": "kill_process", "pid": "1234"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.pid) return "Error: pid is required";
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32' 
                ? \`taskkill /F /PID \${args.pid}\`
                : \`kill -9 \${args.pid}\`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) resolve(`Failed to kill PID ${args.pid}: ${stderr || error.message}`);
                else resolve(`Successfully killed PID ${args.pid}`);
            });
        });
    }
};

export const DownloadFileDirectSkill: AgentSkill = {
    name: 'download_file_direct',
    description: 'Downloads a file directly from a URL to a specified local path without relying on curl/wget.',
    example: `<tool_call>\n{"action": "download_file_direct", "url": "https://example.com/file.zip", "outputPath": "./file.zip"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.url || !args.outputPath) return "Error: url and outputPath are required";
        return new Promise((resolve) => {
            const fs = require('fs');
            const protocol = args.url.startsWith('https') ? require('https') : require('http');
            const file = fs.createWriteStream(args.outputPath);
            protocol.get(args.url, (response: any) => {
                if (response.statusCode !== 200) {
                    resolve(`Failed: Server returned status code ${response.statusCode}`);
                    return;
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(`Successfully downloaded to ${args.outputPath}`);
                });
            }).on('error', (err: any) => {
                fs.unlink(args.outputPath, () => {});
                resolve(`Download failed: ${err.message}`);
            });
        });
    }
};

export const GenerateUUIDSkill: AgentSkill = {
    name: 'generate_uuid',
    description: 'Generates a random v4 UUID. Useful when you need unique IDs for database mocking.',
    example: `<tool_call>\n{"action": "generate_uuid"}\n</tool_call>`,
    execute: async () => {
        const crypto = require('crypto');
        return crypto.randomUUID();
    }
};

export const Base64EncodeSkill: AgentSkill = {
    name: 'base64_encode',
    description: 'Encodes a string to Base64 natively.',
    example: `<tool_call>\n{"action": "base64_encode", "text": "hello"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.text) return "Error: text is required";
        return Buffer.from(args.text).toString('base64');
    }
};

export const Base64DecodeSkill: AgentSkill = {
    name: 'base64_decode',
    description: 'Decodes a Base64 string natively.',
    example: `<tool_call>\n{"action": "base64_decode", "base64Text": "aGVsbG8="}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.base64Text) return "Error: base64Text is required";
        return Buffer.from(args.base64Text, 'base64').toString('utf-8');
    }
};
