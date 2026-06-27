import { AgentSkill } from './base';

export const WaitSkill: AgentSkill = {
    name: 'wait',
    description: 'Pauses the agent for a specified number of seconds. Use this to intelligently wait for a background task to finish initializing (e.g. waiting 5 or 10 seconds for a server to boot or a heavy install to finish) before checking its status again.',
    example: `<tool_call>\n{"action": "wait", "seconds": 5}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.seconds || typeof args.seconds !== 'number') {
            return "Error: 'seconds' must be a valid number.";
        }
        
        const seconds = Math.min(Math.max(1, args.seconds), 300); // cap between 1s and 5m
        console.log(`\n⏳ [ATCLI Timer] AI requested a pause. Waiting for ${seconds} seconds...`);
        
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        
        return `Wait completed successfully after ${seconds} seconds. You may now proceed with your next tool call (e.g. check_background_task).`;
    }
};
