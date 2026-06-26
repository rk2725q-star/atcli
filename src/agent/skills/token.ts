import { AgentSkill } from './base';

export const TokenTrackerSkill: AgentSkill = {
    name: 'check_context',
    description: 'Check exactly how many tokens you have consumed in the current session. If you are near 180,000, prepare for a memory reset.',
    example: `<tool_call>\n{"action": "check_context"}\n</tool_call>`,
    execute: async (args: any) => {
        const globalTokens = (global as any).atcli_current_tokens || 0;
        const remaining = 180000 - globalTokens;
        return `You have used exactly ${globalTokens} tokens in this session.\\nYou have ${remaining} tokens remaining before a mandatory context refresh.`;
    }
};
