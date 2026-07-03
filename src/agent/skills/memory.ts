import { AgentSkill } from './base';
import { memoryStore } from '../memory/store';

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY SKILLS — Hermes-style persistent memory read/write/recall
// ─────────────────────────────────────────────────────────────────────────────

export const MemoryRecallSkill: AgentSkill = {
    name: 'memory_recall',
    description: `Recalls relevant past sessions from ATCLI persistent memory (~/.atcli/memory/).
Uses keyword-based FTS search over all past sessions. Returns most relevant past context.
Arguments: query (string) — what to search for in past memory`,
    example: `<tool_call>\n{"action": "memory_recall", "query": "nextjs deployment vercel"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.query) return 'Error: query is required';
        const recalled = memoryStore.recall(args.query, 3000);
        return recalled || 'No relevant past sessions found for this query.';
    },
};

export const MemoryWriteSkill: AgentSkill = {
    name: 'memory_write',
    description: `Writes a fact, lesson, or note to ATCLI persistent memory (~/.atcli/memory/).
Survives across all projects and sessions.
Arguments: fact (string) — what to remember, type ("fact" | "session" | "skill"), task (string, for session), outcome (string, for session)`,
    example: `<tool_call>\n{"action": "memory_write", "type": "fact", "fact": "User prefers Tailwind CSS over plain CSS for all projects"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (args.type === 'session' && args.task && args.outcome) {
            memoryStore.writeSession({
                date: new Date().toISOString(),
                task: args.task,
                outcome: args.outcome,
                keywords: (args.keywords || '').split(',').map((k: string) => k.trim()).filter(Boolean),
                agentsUsed: (args.agents || '').split(',').map((a: string) => a.trim()).filter(Boolean),
            });
            return `✅ Session written to ~/.atcli/memory/sessions/`;
        }
        if (args.type === 'skill' && args.name && args.content) {
            memoryStore.writeLearnedSkill(args.name, args.content);
            return `✅ Skill "${args.name}" written to ~/.atcli/memory/skills-learned/`;
        }
        if (args.fact) {
            memoryStore.writeFact(args.fact);
            return `✅ Fact written to ~/.atcli/memory/AGENTICA_MEMORY.md`;
        }
        return 'Error: provide either fact or type+task+outcome';
    },
};

export const MemoryReadSkill: AgentSkill = {
    name: 'memory_read',
    description: `Reads the full ATCLI persistent memory file (~/.atcli/memory/AGENTICA_MEMORY.md).
Use this at the start of a session to load all past context.`,
    example: `<tool_call>\n{"action": "memory_read"}\n</tool_call>`,
    execute: async (_args: any): Promise<string> => {
        const content = memoryStore.readMainMemory();
        return content || 'Memory is empty — first session.';
    },
};
