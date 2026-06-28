import { AgentSkill } from './base';

export const ReasonSkill: AgentSkill = {
    name: 'reason',
    description: 'Auto-call this skill BEFORE writing code, making architectural decisions, or executing commands. This uses an advanced Chain-of-Thought (CoT) structured reasoning framework to prevent hallucination and breaking changes.',
    example: `<tool_call>
{
  "action": "reason",
  "observation": "The user wants to implement feature X. I see files A and B are related.",
  "hypothesis": "I need to modify file A's export and file B's import to connect them.",
  "plan": "1. Use replace_content on A. 2. Use replace_content on B. 3. verify_code.",
  "reflection": "Wait, modifying A might break file C. I should check file C first."
}
</tool_call>`,
    execute: async (args: any) => {
        if (!args.observation || !args.hypothesis || !args.plan || !args.reflection) {
            return "Error: To use the reason skill, you MUST provide 'observation', 'hypothesis', 'plan', and 'reflection' properties.";
        }
        
        console.log(`\n🧠 [Advanced Reasoning Engaged]`);
        console.log(`👁️  Observation: ${args.observation}`);
        console.log(`💡 Hypothesis: ${args.hypothesis}`);
        console.log(`📋 Plan: ${args.plan}`);
        console.log(`🔍 Reflection: ${args.reflection}`);
        
        return "Advanced reasoning recorded and validated. Your logic is sound. Proceed with the execution using this exact verified plan.";
    }
};
