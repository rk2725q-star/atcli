import { AgentSkill } from './base';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// SPAWN SUB-AGENT SKILL
// Allows any agent (including the Orchestrator via tool call) to dynamically
// spawn one of the 15 specialist sub-agents for a specific subtask.
// ─────────────────────────────────────────────────────────────────────────────
export const SpawnSubAgentSkill: AgentSkill = {
    name: 'spawn_sub_agent',
    description: `Spawns one of the 15 specialist sub-agents to handle a specific subtask.
Use this when a task requires a different specialist than the current agent.
Available agents: openclaw, coder, terminal, fileops, git, package, search, word, security, skills, devserver, audit, design, data, deploy
Arguments:
  agent (string): which specialist to spawn (one of the names above)
  task (string): the specific subtask description to give the agent
  run_in_background (boolean, optional): default false — if true, the agent runs asynchronously and immediately returns control to you. You will be notified when it completes.`,
    example: `<tool_call>\n{"action": "spawn_sub_agent", "agent": "coder", "task": "Create src/components/Button.tsx", "run_in_background": true}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.agent) return 'Error: agent name is required';
        if (!args.task) return 'Error: task description is required';

        const { AGENT_REGISTRY } = await import('../subagents/agents');
        
        const AgentClass = AGENT_REGISTRY[args.agent.toLowerCase()];
        if (!AgentClass) {
            const available = Object.keys(AGENT_REGISTRY).join(', ');
            return `Error: Unknown agent "${args.agent}". Available: ${available}`;
        }

        const provider = (global as any).atcli_current_provider;
        if (!provider) {
            return 'Error: No active provider. Cannot spawn sub-agent without a connected AI provider.';
        }

        const runInBackground = args.run_in_background === true;
        const taskId = `task_${Math.random().toString(36).substr(2, 9)}`;

        console.log(`\n🚀 [Orchestrator] Spawning ${args.agent} for: ${args.task.substring(0, 80)}... (Background: ${runInBackground})`);
        
        const agent = new AgentClass(provider);
        
        if (runInBackground) {
            // Run asynchronously without awaiting
            Promise.resolve().then(async () => {
                let finalResult = '';
                try {
                    const result = await agent.run(args.task);
                    finalResult = `[${args.agent.toUpperCase()} AGENT SUCCESS]:\n${result}`;
                } catch (err: any) {
                    finalResult = `[${args.agent.toUpperCase()} AGENT ERROR]: ${err.message}`;
                }

                // Write to background_tasks folder
                const cwd = (global as any).atcli_project_root || process.cwd();
                const bgDir = path.join(cwd, '.atcli', 'background_tasks');
                if (!fs.existsSync(bgDir)) fs.mkdirSync(bgDir, { recursive: true });
                
                const taskFile = path.join(bgDir, `${taskId}.json`);
                fs.writeFileSync(taskFile, JSON.stringify({
                    id: taskId,
                    agent: args.agent,
                    task: args.task,
                    result: finalResult,
                    completedAt: new Date().toISOString()
                }, null, 2));
                
                console.log(`\n🔔 [BACKGROUND TASK COMPLETED]: ${taskId} (${args.agent})`);
            });

            return `[BACKGROUND TASK STARTED]: Sub-agent '${args.agent}' launched in the background with Task ID: ${taskId}. You will receive a system notification when it completes. You may now proceed with other tasks immediately.`;
        } else {
            // Synchronous block
            try {
                const result = await agent.run(args.task);
                return `[${args.agent.toUpperCase()} AGENT RESULT]:\n${result}`;
            } catch (err: any) {
                return `[${args.agent.toUpperCase()} AGENT ERROR]: ${err.message}`;
            }
        }
    },
};
