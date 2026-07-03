import { AgentSkill } from './base';

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
  wait_for_result (boolean, optional): default true — wait for agent to complete and return result`,
    example: `<tool_call>\n{"action": "spawn_sub_agent", "agent": "coder", "task": "Create src/components/Button.tsx with a premium glassmorphism style"}\n</tool_call>`,
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

        console.log(`\n🚀 [Orchestrator] Spawning ${args.agent} for: ${args.task.substring(0, 80)}...`);
        
        const agent = new AgentClass(provider);
        
        try {
            const result = await agent.run(args.task);
            return `[${args.agent.toUpperCase()} AGENT RESULT]:\n${result}`;
        } catch (err: any) {
            return `[${args.agent.toUpperCase()} AGENT ERROR]: ${err.message}`;
        }
    },
};
