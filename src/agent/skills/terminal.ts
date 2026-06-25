import { AgentSkill } from './base';
import { exec, spawn, ChildProcess } from 'child_process';
import * as crypto from 'crypto';

interface BackgroundTask {
    id: string;
    command: string;
    process: ChildProcess;
    outputBuffer: string[];
    status: 'running' | 'completed' | 'failed' | 'killed';
    exitCode: number | null;
}

class BackgroundTaskManager {
    private static instance: BackgroundTaskManager;
    private tasks: Map<string, BackgroundTask> = new Map();

    private constructor() {}

    public static getInstance(): BackgroundTaskManager {
        if (!BackgroundTaskManager.instance) {
            BackgroundTaskManager.instance = new BackgroundTaskManager();
        }
        return BackgroundTaskManager.instance;
    }

    public startTask(command: string, cwd: string): string {
        const id = crypto.randomBytes(4).toString('hex');
        const child = spawn(command, { shell: true, cwd });

        const task: BackgroundTask = {
            id,
            command,
            process: child,
            outputBuffer: [],
            status: 'running',
            exitCode: null
        };

        const handleOutput = (data: Buffer) => {
            const lines = data.toString().split('\n');
            task.outputBuffer.push(...lines);
            if (task.outputBuffer.length > 500) {
                task.outputBuffer = task.outputBuffer.slice(task.outputBuffer.length - 500);
            }
        };

        child.stdout?.on('data', handleOutput);
        child.stderr?.on('data', handleOutput);

        child.on('close', (code) => {
            task.status = code === 0 ? 'completed' : 'failed';
            task.exitCode = code;
        });

        child.on('error', (err) => {
            task.status = 'failed';
            task.outputBuffer.push(`ERROR: ${err.message}`);
        });

        this.tasks.set(id, task);
        return id;
    }

    public getTaskStatus(id: string): any {
        const task = this.tasks.get(id);
        if (!task) return null;

        return {
            id: task.id,
            command: task.command,
            status: task.status,
            exitCode: task.exitCode,
            output: task.outputBuffer.join('\n')
        };
    }

    public killTask(id: string): boolean {
        const task = this.tasks.get(id);
        if (!task || task.status !== 'running') return false;
        
        // Use process.kill to terminate process tree on Windows/Linux if possible,
        // but child.kill() works for simple tasks
        task.process.kill();
        task.status = 'killed';
        return true;
    }
}

const taskManager = BackgroundTaskManager.getInstance();

export const RunCommandSkill: AgentSkill = {
    name: 'run_command',
    description: 'Executes a terminal command (e.g., npm install, node script.js) and waits for it to complete. The output will be streamed to the user, and the final output will be returned to you. WARNING: Do NOT use this tool for interactive commands (e.g., vim, nano, or scripts that prompt for user input like npm init without -y). Because this runs in the background, interactive prompts will cause the system to hang forever waiting for input. Always use non-interactive flags (like -y or --force) or use the run_interactive tool instead.',
    example: `<tool_call>\n{"action": "run_command", "command": "npm init -y"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.command) return "Error: command is required";
        
        // 🚨 HARDCODED SANDBOX INTERCEPTOR (Failsafe if prompts.ts is broken)
        const cmdLower = args.command.toLowerCase();
        const blockList = [
            'rm -rf /', 'del /s /q c:\\\\windows', 'format c:', 'rmdir /s /q c:\\\\windows', 'del /s /q c:\\\\', 'chmod -r 000 /', 'takeown /f c:\\\\windows'
        ];
        if (cmdLower.includes('prompts.ts') && (cmdLower.includes('rm ') || cmdLower.includes('del ') || cmdLower.includes('echo ') || cmdLower.includes('cat ') || cmdLower.includes('>'))) {
            return "❌ [HARD STOP] Security Protocol Triggered: You are strictly forbidden from modifying or deleting the prompts.ts file from the terminal.";
        }
        for (const blocked of blockList) {
            if (cmdLower.includes(blocked)) {
                return `❌ [HARD STOP] Security Guardrail Triggered: The command '${args.command}' is classified as HIGHLY DESTRUCTIVE and is blocked at the execution layer.`;
            }
        }

        return new Promise((resolve) => {
            console.log(`\n[ATCLI] Executing: ${args.command}\n`);
            
            if (typeof (global as any).pauseRepl === 'function') {
                (global as any).pauseRepl();
            }

            const child = spawn(args.command, { shell: true, cwd: process.cwd() });
            
            const outputBuffer: string[] = [];
            const handleOutput = (data: Buffer) => {
                process.stdout.write(data); // Stream live to user
                
                // Strip ANSI escape codes for the AI buffer
                const cleanText = data.toString().replace(/\\x1b\\[[0-9;]*m/g, '');
                const lines = cleanText.split('\\n');
                outputBuffer.push(...lines);
                
                // Keep memory usage bounded (last ~1000 lines is usually enough for context)
                if (outputBuffer.length > 1000) {
                    outputBuffer.splice(0, outputBuffer.length - 1000);
                }
            };

            child.stdout?.on('data', handleOutput);
            child.stderr?.on('data', handleOutput);

            child.on('close', (code) => {
                if (typeof (global as any).resumeRepl === 'function') {
                    (global as any).resumeRepl();
                }
                // Reset terminal mouse tracking in case the command left it dirty
                process.stdout.write('\\x1b[?1000l\\x1b[?1002l\\x1b[?1003l\\x1b[?1006l');
                const result = outputBuffer.join('\\n').trim();
                resolve(result || `Command executed successfully with exit code ${code}.`);
            });

            child.on('error', (err) => {
                if (typeof (global as any).resumeRepl === 'function') {
                    (global as any).resumeRepl();
                }
                process.stdout.write('\\x1b[?1000l\\x1b[?1002l\\x1b[?1003l\\x1b[?1006l');
                outputBuffer.push(`ERROR: ${err.message}`);
                resolve(outputBuffer.join('\\n').trim());
            });
        });
    }
};

export const RunInteractiveSkill: AgentSkill = {
    name: 'run_interactive',
    description: 'Executes an interactive terminal command (e.g., vim, nano, opencode) directly in the current terminal window. It pauses ATCLI to let the user interact with the TUI, and resumes ATCLI when the user exits the program.',
    example: `<tool_call>\n{"action": "run_interactive", "command": "opencode"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.command) return "Error: command is required";

        const cmdLower = args.command.toLowerCase();
        const blockList = ['rm -rf /', 'del /s /q c:\\\\windows', 'format c:', 'rmdir /s /q c:\\\\windows', 'del /s /q c:\\\\', 'chmod -r 000 /', 'takeown /f c:\\\\windows'];
        if (cmdLower.includes('prompts.ts') && (cmdLower.includes('rm ') || cmdLower.includes('del ') || cmdLower.includes('echo ') || cmdLower.includes('cat ') || cmdLower.includes('>'))) {
            return "❌ [HARD STOP] Security Protocol Triggered: You are strictly forbidden from modifying or deleting the prompts.ts file.";
        }
        for (const blocked of blockList) {
            if (cmdLower.includes(blocked)) {
                return `❌ [HARD STOP] Security Guardrail Triggered: Command '${args.command}' is HIGHLY DESTRUCTIVE and blocked at the execution layer.`;
            }
        }

        return new Promise((resolve) => {
            console.log(`\n[ATCLI] Handing over terminal to interactive command: ${args.command}...\n`);
            
            if (typeof (global as any).pauseRepl === 'function') {
                (global as any).pauseRepl();
            }

            const child = spawn(args.command, { stdio: 'inherit', shell: true, cwd: process.cwd() });
            
            child.on('close', (code) => {
                if (typeof (global as any).resumeRepl === 'function') {
                    (global as any).resumeRepl();
                }
                process.stdout.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l');
                console.log(`\n[ATCLI] Interactive command finished with exit code ${code}`);
                resolve(`Interactive command finished with exit code ${code}. The user has closed the program.`);
            });

            child.on('error', (err) => {
                if (typeof (global as any).resumeRepl === 'function') {
                    (global as any).resumeRepl();
                }
                process.stdout.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l');
                resolve(`Error launching interactive command: ${err.message}`);
            });
        });
    }
};

export const RunBackgroundCommandSkill: AgentSkill = {
    name: 'run_background_command',
    description: 'Executes a long-running terminal command (e.g., npm run build, starting a server, heavy compilations) in the background. It returns immediately with a taskId. You can use check_background_task to read the logs later.',
    example: `<tool_call>\n{"action": "run_background_command", "command": "npm run build"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.command) return "Error: command is required";

        const cmdLower = args.command.toLowerCase();
        const blockList = ['rm -rf /', 'del /s /q c:\\\\windows', 'format c:', 'rmdir /s /q c:\\\\windows', 'del /s /q c:\\\\', 'chmod -r 000 /', 'takeown /f c:\\\\windows'];
        if (cmdLower.includes('prompts.ts') && (cmdLower.includes('rm ') || cmdLower.includes('del ') || cmdLower.includes('echo ') || cmdLower.includes('cat ') || cmdLower.includes('>'))) {
            return "❌ [HARD STOP] Security Protocol Triggered: You are strictly forbidden from modifying or deleting the prompts.ts file.";
        }
        for (const blocked of blockList) {
            if (cmdLower.includes(blocked)) {
                return `❌ [HARD STOP] Security Guardrail Triggered: Command '${args.command}' is HIGHLY DESTRUCTIVE and blocked at the execution layer.`;
            }
        }

        const taskId = taskManager.startTask(args.command, process.cwd());
        return `Background task started successfully.\nTask ID: ${taskId}\nCommand: ${args.command}\nUse check_background_task to monitor its output.`;
    }
};

export const CheckBackgroundTaskSkill: AgentSkill = {
    name: 'check_background_task',
    description: 'Checks the status and retrieves the latest logs (up to 500 lines) of a running or completed background task.',
    example: `<tool_call>\n{"action": "check_background_task", "taskId": "a1b2c3d4"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.taskId) return "Error: taskId is required";
        const status = taskManager.getTaskStatus(args.taskId);
        if (!status) return `Error: No task found with ID ${args.taskId}`;

        let output = `Task ID: ${status.id}\nCommand: ${status.command}\nStatus: ${status.status}`;
        if (status.exitCode !== null) output += `\nExit Code: ${status.exitCode}`;
        output += `\n\n--- LATEST OUTPUT ---\n${status.output}\n---------------------`;
        return output;
    }
};

export const KillBackgroundTaskSkill: AgentSkill = {
    name: 'kill_background_task',
    description: 'Terminates a running background task.',
    example: `<tool_call>\n{"action": "kill_background_task", "taskId": "a1b2c3d4"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.taskId) return "Error: taskId is required";
        const success = taskManager.killTask(args.taskId);
        if (success) return `Successfully sent kill signal to task ${args.taskId}.`;
        return `Failed to kill task ${args.taskId}. It may not exist or is already stopped.`;
    }
};

export const SendInputToTaskSkill: AgentSkill = {
    name: 'send_input_to_task',
    description: 'Sends text input (like "y" or "n" or a password) to the stdin of a running background task. Use this to respond to interactive prompts (like "Ok to proceed? (y)") that are blocking a background command.',
    example: `<tool_call>\n{"action": "send_input_to_task", "taskId": "a1b2c3d4", "input": "y"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.taskId) return "Error: taskId is required";
        if (args.input === undefined) return "Error: input is required";
        
        // We need to access the underlying tasks map to write to stdin
        // Let's use a workaround since tasks map is private in BackgroundTaskManager
        const tm = (taskManager as any);
        const task = tm.tasks.get(args.taskId);
        
        if (!task || task.status !== 'running') {
            return `Error: Task ${args.taskId} is not running.`;
        }
        
        if (!task.process.stdin) {
            return `Error: Task ${args.taskId} does not have an open stdin.`;
        }
        
        // Send input with a newline
        task.process.stdin.write(args.input + '\n');
        
        // Wait a second to capture any new output
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const status = tm.getTaskStatus(args.taskId);
        return `Successfully sent input to task ${args.taskId}.\n\n--- LATEST OUTPUT AFTER INPUT ---\n${status.output}\n---------------------------------`;
    }
};
