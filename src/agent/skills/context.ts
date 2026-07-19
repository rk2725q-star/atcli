import { AgentSkill } from './base';

export const TruncateContextSkill: AgentSkill = {
    name: 'truncate_context',
    description: `D-Mail: Send a message to your future self and erase the recent context.
Use this when your context is filled with irrelevant information or failed attempts.
It will reset your conversation history to save tokens and prevent hallucination, injecting your summary as the new starting point.

Arguments:
  summary (required) — A detailed summary of what you've done, what you've learned, and what your past self should do next.
`,
    example: `<tool_call>\n{"action": "truncate_context", "summary": "I tried fixing the API but it failed. I found the issue is in db.js instead. Start by looking at db.js line 40."}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.summary) {
            return 'Error: summary is required.';
        }
        
        // Return a special signal string that loop.ts will intercept
        // to reset the provider context.
        return `[SYSTEM_TRUNCATE_CONTEXT_SIGNAL]::${JSON.stringify({ summary: args.summary })}`;
    }
};
