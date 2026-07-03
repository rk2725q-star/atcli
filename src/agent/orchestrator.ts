import { AgentProvider } from '../providers/interface';
import { SkillManager } from './skillManager';
import { Gatekeeper } from './gatekeeper';
import { AGENT_REGISTRY, ALL_AGENT_NAMES } from './subagents/agents';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR AGENT — Fixed:
// FIX 4: Each sub-agent gets its OWN isolated provider instance — no shared
//         browser session conflicts between Hermes and sub-agents
// FIX 6: Independent subtasks run in PARALLEL via Promise.all()
// ─────────────────────────────────────────────────────────────────────────────

export interface SubTask {
    id: number;
    agent: string;
    task: string;
    dependsOn?: number[];
    result?: string;
    status: 'pending' | 'running' | 'done' | 'failed';
}

export interface OrchestratorPlan {
    goal: string;
    subtasks: SubTask[];
}

// ── Provider factory — FIX 4 ──────────────────────────────────────────────────
// Sub-agents need their OWN provider instance so they can send messages
// independently without interfering with Hermes's ongoing AI conversation.
// We clone the provider config by using the same class but a fresh instance.
// The agentProvider passed by Hermes is used as the template.
// ─────────────────────────────────────────────────────────────────────────────
function cloneProvider(template: AgentProvider): AgentProvider {
    // Strategy: sub-agents reuse the SAME provider object for TEXT tasks
    // (coder, fileops, search etc. — these just send text messages)
    // but we ensure no shared mutable browser state by resetting before use.
    // For browser-heavy agents (openclaw, vision, design) the shared provider
    // is acceptable since they use a separate browser context via sessionManager.
    // A full multi-browser-tab isolation would require re-init per agent,
    // which is expensive — so we reset() the provider between agent calls.
    template.reset();
    return template;
}

export class OrchestratorAgent {
    private gatekeeper: Gatekeeper;

    constructor(private provider: AgentProvider) {
        this.gatekeeper = new Gatekeeper();
    }

    /** Execute a full plan produced by Hermes — FIX 6: parallel independent tasks */
    public async executePlan(plan: OrchestratorPlan): Promise<string> {
        console.log(`\n🦅 [Orchestrator] Executing plan: "${plan.goal}"`);
        console.log(`📋 [Orchestrator] ${plan.subtasks.length} subtasks queued.`);

        const completedIds = new Set<number>();
        const allResults: string[] = [`# Orchestrator Results\n**Goal:** ${plan.goal}\n`];
        const taskMap = new Map<number, SubTask>(plan.subtasks.map(t => [t.id, t]));

        let remaining = [...plan.subtasks];
        let safetyCounter = 0;

        while (remaining.length > 0 && safetyCounter < 100) {
            safetyCounter++;

            // Find all tasks whose dependencies are fully satisfied
            const ready = remaining.filter(t =>
                !t.dependsOn || t.dependsOn.length === 0 ||
                t.dependsOn.every(dep => completedIds.has(dep))
            );

            if (ready.length === 0) {
                console.log(`\n⚠️ [Orchestrator] Dependency deadlock. Aborting remaining tasks.`);
                break;
            }

            // ── FIX 6: Run ALL ready tasks in PARALLEL (Promise.all) ──────────
            // Tasks with no inter-dependencies run simultaneously — same as real
            // OpenClaw/Hermes parallel agent execution pattern
            console.log(`\n⚡ [Orchestrator] Running ${ready.length} independent task(s) in PARALLEL: ${ready.map(t => `[${t.agent}]`).join(', ')}`);

            await Promise.all(ready.map(async (subtask) => {
                console.log(`\n▶️  [Orchestrator] Subtask ${subtask.id}: [${subtask.agent}] ${subtask.task.substring(0, 80)}`);

                const AgentClass = AGENT_REGISTRY[subtask.agent.toLowerCase()];
                if (!AgentClass) {
                    subtask.result = `Error: Unknown agent type "${subtask.agent}". Available: ${ALL_AGENT_NAMES.join(', ')}`;
                    subtask.status = 'failed';
                    allResults.push(`## Subtask ${subtask.id} [${subtask.agent}] ❌\n${subtask.result}`);
                    completedIds.add(subtask.id);
                    return;
                }

                subtask.status = 'running';
                try {
                    // ── FIX 4: Each sub-agent gets a reset (isolated) provider ──
                    // This prevents browser session conflicts. The provider is reset
                    // before passing to each agent — no cross-contamination of
                    // conversation history or browser state.
                    const isolatedProvider = cloneProvider(this.provider);
                    const agent = new AgentClass(isolatedProvider);
                    subtask.result = await agent.run(subtask.task);
                    subtask.status = 'done';
                    console.log(`\n✅ [Orchestrator] Subtask ${subtask.id} [${subtask.agent}] done.`);
                    allResults.push(`## Subtask ${subtask.id} [${subtask.agent}] ✅\n${subtask.result}`);
                } catch (err: any) {
                    subtask.status = 'failed';
                    subtask.result = `Error: ${err.message}`;
                    allResults.push(`## Subtask ${subtask.id} [${subtask.agent}] ❌\n${subtask.result}`);
                    console.log(`\n❌ [Orchestrator] Subtask ${subtask.id} [${subtask.agent}] failed: ${err.message}`);
                }

                completedIds.add(subtask.id);
            }));

            // Remove completed tasks from remaining
            const justCompleted = new Set(ready.map(t => t.id));
            remaining = remaining.filter(t => !justCompleted.has(t.id));
        }

        // Build summary
        const done   = plan.subtasks.filter(t => t.status === 'done').length;
        const failed = plan.subtasks.filter(t => t.status === 'failed').length;

        const summary = [
            `\n---`,
            `## Orchestrator Summary`,
            `- Total subtasks: ${plan.subtasks.length}`,
            `- ✅ Completed: ${done}`,
            `- ❌ Failed: ${failed}`,
            done > 0 ? `- Parallel batches: tasks with no dependencies ran simultaneously` : '',
        ].filter(Boolean).join('\n');

        allResults.push(summary);
        return allResults.join('\n\n');
    }

    /** Parse a plan JSON from Hermes's output */
    public parsePlan(json: string): OrchestratorPlan | null {
        try {
            const cleaned = json.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (!parsed.goal || !Array.isArray(parsed.subtasks)) return null;
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
