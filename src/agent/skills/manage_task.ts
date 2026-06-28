import { AgentSkill } from './base';
import { spawn, ChildProcess } from 'child_process';

// Global task registry attached to the process to persist across synchronous LLM loops
if (!(global as any).ATCLI_TASKS) {
    (global as any).ATCLI_TASKS = new Map<string, { process: ChildProcess, logs: string[] }>();
}
const tasks = (global as any).ATCLI_TASKS as Map<string, { process: ChildProcess, logs: string[] }>;

export const ManageTaskSkill: AgentSkill = {
    name: 'manage_task',
    description: 'Manages long-running background tasks synchronously. Actions: start, status, logs, kill. Use this instead of run_command for servers (like npm run dev) so they do not block the AI loop.',
    example: `<tool_call>\n{"action": "manage_task", "sub_action": "start", "task_id": "server", "command": "npm run dev"}\n</tool_call>\n<tool_call>\n{"action": "manage_task", "sub_action": "logs", "task_id": "server"}\n</tool_call>`,
    execute: async (args: any) => {
        const subAction = args.sub_action;
        const taskId = args.task_id;
        
        if (!subAction || !taskId) return "Error: sub_action and task_id are required.";

        if (subAction === 'start') {
            if (!args.command) return "Error: command is required to start a task.";
            if (tasks.has(taskId)) return `Error: Task ID '${taskId}' is already running. Kill it first.`;
            
            // Execute in shell
            const child = spawn(args.command, { shell: true, cwd: process.cwd() });
            const taskData = { process: child, logs: [] as string[] };
            tasks.set(taskId, taskData);

            const appendLog = (data: any) => {
                const lines = data.toString().trim().split('\n');
                taskData.logs.push(...lines);
                if (taskData.logs.length > 200) taskData.logs.splice(0, taskData.logs.length - 200); // Keep last 200 lines
            };

            child.stdout?.on('data', appendLog);
            child.stderr?.on('data', appendLog);
            child.on('close', (code) => {
                taskData.logs.push(`[Process exited with code ${code}]`);
            });

            return `Task '${taskId}' started in background. Command: ${args.command}\nUse {"action": "manage_task", "sub_action": "logs", "task_id": "${taskId}"} to check its output later.`;
        } 
        
        else if (subAction === 'logs') {
            const task = tasks.get(taskId);
            if (!task) return `Error: No task found with ID '${taskId}'.`;
            if (task.logs.length === 0) return `Task '${taskId}' is running but has no logs yet.`;
            return `Logs for '${taskId}':\n` + task.logs.join('\n');
        } 
        
        else if (subAction === 'status') {
            const task = tasks.get(taskId);
            if (!task) return `Task '${taskId}' is NOT running.`;
            const isDead = task.process.killed || task.process.exitCode !== null;
            return `Task '${taskId}' is ${isDead ? 'DEAD' : 'RUNNING'}.`;
        } 
        
        else if (subAction === 'kill') {
            const task = tasks.get(taskId);
            if (!task) return `Error: No task found with ID '${taskId}'.`;
            task.process.kill();
            tasks.delete(taskId);
            return `Task '${taskId}' killed successfully.`;
        }

        return `Error: Unknown sub_action '${subAction}'. Valid actions are: start, logs, status, kill.`;
    }
};
