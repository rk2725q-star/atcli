import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as os from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS SKILLS — System process management (OpenClaw system control)
// ─────────────────────────────────────────────────────────────────────────────
export const ProcessListSkill: AgentSkill = {
    name: 'process_list',
    description: `Lists running processes on the host PC with CPU/RAM info.
OpenClaw system management capability.
Arguments:
  filter (string, optional): filter by process name (partial match)
  top (number, optional): show top N by CPU (default: 20)`,
    example: `<tool_call>\n{"action": "process_list", "filter": "node", "top": 10}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        const platform = process.platform;
        return new Promise(resolve => {
            let cmd: string;
            if (platform === 'win32') {
                const filter = args.filter ? `| Where-Object { $_.Name -like '*${args.filter}*' }` : '';
                const top = args.top || 20;
                cmd = `powershell -Command "Get-Process ${filter} | Sort-Object CPU -Descending | Select-Object -First ${top} | Select-Object Name, Id, CPU, WorkingSet | Format-Table -AutoSize | Out-String"`;
            } else {
                const filter = args.filter ? `grep -i '${args.filter}' |` : '';
                cmd = `ps aux | ${filter} sort -k3 -rn | head -${args.top || 20}`;
            }
            exec(cmd, { timeout: 8000 }, (e, out) => resolve(e ? `Error: ${e.message}` : out.trim() || 'No processes found'));
        });
    },
};

export const ProcessKillSkill: AgentSkill = {
    name: 'process_kill',
    description: `Kills a running process by name or PID. Gatekeeper blocks killing system/atcli processes.
Arguments:
  name (string, optional): process name to kill
  pid (number, optional): process ID to kill`,
    example: `<tool_call>\n{"action": "process_kill", "name": "node"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.name && !args.pid) return 'Error: name or pid required';
        // Safety: never kill critical system processes
        const forbidden = ['system', 'svchost', 'lsass', 'csrss', 'smss', 'wininit', 'services', 'explorer'];
        if (args.name && forbidden.some(f => args.name.toLowerCase().includes(f))) {
            return `BLOCKED: Cannot kill critical system process "${args.name}"`;
        }
        const platform = process.platform;
        return new Promise(resolve => {
            let cmd: string;
            if (platform === 'win32') {
                cmd = args.pid
                    ? `taskkill /PID ${args.pid} /F`
                    : `taskkill /IM "${args.name}.exe" /F`;
            } else {
                cmd = args.pid ? `kill -9 ${args.pid}` : `pkill -f "${args.name}"`;
            }
            exec(cmd, (e, out) => resolve(e ? `Error: ${e.message}` : `✅ Killed: ${args.name || args.pid}\n${out}`));
        });
    },
};

export const SystemInfoSkill: AgentSkill = {
    name: 'system_info',
    description: `Returns detailed system information: OS, CPU, RAM, disk, Node version, env variables.
OpenClaw system awareness capability.`,
    example: `<tool_call>\n{"action": "system_info"}\n</tool_call>`,
    execute: async (_args: any): Promise<string> => {
        const mem = os.totalmem();
        const freeMem = os.freemem();
        const info = [
            `## System Info`,
            `OS: ${os.type()} ${os.release()} (${os.arch()})`,
            `Platform: ${process.platform}`,
            `CPU: ${os.cpus()[0]?.model || 'Unknown'} × ${os.cpus().length} cores`,
            `RAM: ${Math.round(freeMem / 1024 / 1024)}MB free / ${Math.round(mem / 1024 / 1024)}MB total`,
            `Node: ${process.version}`,
            `Uptime: ${Math.round(os.uptime() / 3600)}h`,
            `Home: ${os.homedir()}`,
            `Hostname: ${os.hostname()}`,
            `Project Root: ${(global as any).atcli_project_root || process.cwd()}`,
        ].join('\n');
        return info;
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// HEARTBEAT SKILL — Cron-style scheduled tasks (OpenClaw heartbeat scheduler)
// ─────────────────────────────────────────────────────────────────────────────
const heartbeatRegistry = new Map<string, NodeJS.Timeout>();

export const HeartbeatScheduleSkill: AgentSkill = {
    name: 'heartbeat_schedule',
    description: `Schedules a recurring background task (OpenClaw heartbeat scheduler).
Arguments:
  name (string): unique name for this schedule
  interval_minutes (number): run every N minutes
  task (string): description of what to do when heartbeat fires
  action (string): "start" | "stop" | "list"`,
    example: `<tool_call>\n{"action": "heartbeat_schedule", "name": "check-server", "interval_minutes": 5, "task": "Check if dev server is still running", "action": "start"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (args.action === 'list') {
            const names = Array.from(heartbeatRegistry.keys());
            return names.length > 0
                ? `Active heartbeats:\n${names.map(n => `- ${n}`).join('\n')}`
                : 'No active heartbeats.';
        }
        if (args.action === 'stop' && args.name) {
            const timer = heartbeatRegistry.get(args.name);
            if (timer) { clearInterval(timer); heartbeatRegistry.delete(args.name); }
            return `✅ Stopped heartbeat: ${args.name}`;
        }
        if (args.action === 'start' && args.name && args.interval_minutes && args.task) {
            if (heartbeatRegistry.has(args.name)) {
                return `Heartbeat "${args.name}" already running. Stop it first.`;
            }
            const ms = args.interval_minutes * 60 * 1000;
            const timer = setInterval(() => {
                console.log(`\n⏰ [HEARTBEAT: ${args.name}] Firing — Task: ${args.task}`);
                // Task gets logged — agent can check with process_list or run a health check
            }, ms);
            heartbeatRegistry.set(args.name, timer);
            return `✅ Heartbeat "${args.name}" started — fires every ${args.interval_minutes} min\nTask: ${args.task}`;
        }
        return 'Error: provide action (start/stop/list), name, interval_minutes, and task';
    },
};
