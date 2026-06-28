import { AgentSkill } from './base';

export const ReasonSkill: AgentSkill = {
    name: 'reason',
    description: 'Auto-call this skill to pause and think step-by-step before making complex architectural decisions, editing large code files, or starting a new phase of vibecoding. This ensures logical reasoning and prevents breaking existing code.',
    example: `<tool_call>\n{"action": "reason", "thought": "Before I overwrite this file, I need to check its imports to ensure I do not break dependencies."}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.thought) return "Error: thought is required";
        console.log(`\n🤔 [ATCLI Reasoning]: ${args.thought}`);
        return "Reasoning recorded successfully. Your context is saved. Proceed with the actual code execution using this logic.";
    }
};
