import { AgentProvider } from '../providers/interface';
import { SkillManager } from './skillManager';
import { Gatekeeper } from './gatekeeper';
import { AGENT_REGISTRY, ALL_AGENT_NAMES } from './subagents/agents';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR AGENT
// Receives a structured plan from Hermes, executes subtasks by spawning
// the appropriate specialist sub-agents, and aggregates results.
// ─────────────────────────────────────────────────────────────────────────────

export interface SubTask {
    id: number;
    agent: string;        // which specialist to use
    task: string;         // what to do
    dependsOn?: number[]; // task IDs that must complete first
    result?: string;
    status: 'pending' | 'running' | 'done' | 'failed';
}

export interface OrchestratorPlan {
    goal: string;
    subtasks: SubTask[];
}

export class OrchestratorAgent {
    private skillManager: SkillManager;
    private gatekeeper: Gatekeeper;

    constructor(private provider: AgentProvider) {
        this.skillManager = new SkillManager();
        this.gatekeeper = new Gatekeeper();
    }

    /** Execute a full plan produced by Hermes */
    public async executePlan(plan: OrchestratorPlan): Promise<string> {
        console.log(`\n🦅 [Orchestrator] Executing plan: "${plan.goal}"`);
        console.log(`📋 [Orchestrator] ${plan.subtasks.length} subtasks queued.`);

        const completedIds = new Set<number>();
        const allResults: string[] = [`# Orchestrator Results\n**Goal:** ${plan.goal}\n`];

        // Execute subtasks respecting dependencies (sequential for now, parallel-ready)
        let remaining = [...plan.subtasks];
        let safetyCounter = 0;

        while (remaining.length > 0 && safetyCounter < 100) {
            safetyCounter++;

            // Find all tasks whose dependencies are satisfied
            const ready = remaining.filter(t =>
                !t.dependsOn || t.dependsOn.every(dep => completedIds.has(dep))
            );

            if (ready.length === 0) {
                console.log(`\n⚠️ [Orchestrator] Dependency deadlock detected. Aborting remaining tasks.`);
                break;
            }

            // Execute all ready tasks (sequential — extend to parallel later)
            for (const subtask of ready) {
                console.log(`\n▶️  [Orchestrator] Running Subtask ${subtask.id}: [${subtask.agent}] ${subtask.task.substring(0, 80)}`);

                const AgentClass = AGENT_REGISTRY[subtask.agent.toLowerCase()];
                if (!AgentClass) {
                    subtask.result = `Error: Unknown agent type "${subtask.agent}"`;
                    subtask.status = 'failed';
                    allResults.push(`## Subtask ${subtask.id} [${subtask.agent}] ❌\n${subtask.result}`);
                    completedIds.add(subtask.id);
                    continue;
                }

                subtask.status = 'running';
                try {
                    const agent = new AgentClass(this.provider);
                    subtask.result = await agent.run(subtask.task);
                    subtask.status = 'done';
                    console.log(`\n✅ [Orchestrator] Subtask ${subtask.id} done.`);
                    allResults.push(`## Subtask ${subtask.id} [${subtask.agent}] ✅\n${subtask.result}`);
                } catch (err: any) {
                    subtask.status = 'failed';
                    subtask.result = `Error: ${err.message}`;
                    allResults.push(`## Subtask ${subtask.id} [${subtask.agent}] ❌\n${subtask.result}`);
                    console.log(`\n❌ [Orchestrator] Subtask ${subtask.id} failed: ${err.message}`);
                }

                completedIds.add(subtask.id);
                remaining = remaining.filter(t => t.id !== subtask.id);
            }
        }

        const summary = [
            `\n---`,
            `## Orchestrator Summary`,
            `- Total subtasks: ${plan.subtasks.length}`,
            `- Completed: ${plan.subtasks.filter(t => t.status === 'done').length}`,
            `- Failed: ${plan.subtasks.filter(t => t.status === 'failed').length}`,
        ].join('\n');

        allResults.push(summary);
        return allResults.join('\n\n');
    }

    /** Parse a plan JSON from Hermes's output */
    public parsePlan(json: string): OrchestratorPlan | null {
        try {
            const cleaned = json.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (!parsed.goal || !Array.isArray(parsed.subtasks)) return null;
            // Validate and default each subtask
            parsed.subtasks = parsed.subtasks.map((t: any, i: number) => ({
                id: t.id ?? (i + 1),
                agent: t.agent || 'coder',
                task: t.task || '',
                dependsOn: t.dependsOn || [],
                status: 'pending' as const,
            }));
            return parsed as OrchestratorPlan;
        } catch { return null; }
    }
}
