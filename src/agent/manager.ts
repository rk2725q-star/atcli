import { BaseBrowserAdapter } from '../providers/baseBrowser';
import { SkillManager } from './skillManager';

export async function generateManagerPrompt(skillManager: SkillManager): Promise<string> {
    const basePrompt = `
You are the ATCLI Tech Lead Agent (Manager).
Unlike the normal coding agent that "vibecodes", your job is strictly Management, Code Review, Architecture Scaling, and Task Delegation.

Your responsibilities:
1. Review Code: You MUST use the \`caveman-review\` or \`review\` skills to analyze pull requests or local code changes.
2. Delegate Bugs: If you find a bug, do NOT write the code to fix it yourself. You MUST instruct a sub-agent or output a plan for the normal ATCLI agent to fix it.
3. Architecture: Answer questions about system design, scaling, and best practices.
4. Issue Tracking: Track bugs using any available kanban skills (like jarvis-mission-control) if asked.

To execute tasks, you use the EXACT SAME <tool_call> XML syntax as the coding agent. 
You must output EXACTLY ONE XML <tool_call> block per turn.

Here are your available tools:
`;

    const dynamicSkills = skillManager.getSkillsPromptSection();

    const rules = `
# MANAGER RULES & CONSTRAINTS
- CRITICAL: You are the Tech Lead. Do not blindly write massive files of code. Use your skills to REVIEW and MANAGE.
- PERSISTENT MEMORY: Use the \`read_file\` tool to read \`ATCLI_MEMORY.md\` to understand the current project state, architecture, and known bugs before making decisions.
- AUDITING: For a full codebase audit, use the \`audit\`, \`improve-codebase-architecture\`, \`convex-performance-audit\`, and \`architecture-blueprint-generator\` skills.
- To review code against standards, search for and use the \`review\` or \`caveman-review\` skills by reading their SKILL.md documentation first.
- For TASK MANAGEMENT and KANBAN tracking, use the \`persona-project-manager\` or \`task-management\` skills.
- For SCALING and DEPLOYMENT (e.g. Vercel), use the \`deploy-to-vercel\` skill to automate devops.
- Always wait for the <tool_result> before proceeding.
- Once you have fully completed the user's management/review request, reply with your normal text explaining your findings or decisions.
`;

    return basePrompt + dynamicSkills + rules;
}

export class ManagerLoop {
    private maxIterations = 50;
    private skillManager: SkillManager;

    constructor(private provider: BaseBrowserAdapter, private isFirstMessage: boolean = true) {
        this.skillManager = new SkillManager();
    }

    public async run(userMessage: string): Promise<void> {
        console.log(`\n👔 Starting Tech Lead Manager Loop...`);
        
        await this.skillManager.loadAllSkills();
        const systemPrompt = await generateManagerPrompt(this.skillManager);
        
        let currentMessage = this.isFirstMessage 
            ? `${systemPrompt}\n\nUser Request:\n${userMessage}`
            : `${userMessage}\n\n[SYSTEM REMINDER: You are the Tech Lead Agent. Output a <tool_call> block to manage/review.]`;

        for (let i = 1; i <= this.maxIterations; i++) {
            console.log(`\n[Manager Iteration ${i}/${this.maxIterations}] Thinking...`);
            
            const response = await this.provider.sendMessage(currentMessage);
            
            if (response.error) {
                if (!response.error.includes('Target page, context or browser has been closed')) {
                    console.log(`❌ Provider Error: ${response.error}`);
                }
                break;
            }

            const aiText = response.text;
            console.log(`\n[TECH LEAD]:\n${aiText}`);

            let toolCall;
            try {
                toolCall = this.parseToolCall(aiText);
            } catch (err: any) {
                currentMessage = `<tool_result>\nFailed to parse JSON inside <tool_call>: ${err.message}.\n</tool_result>\n[SYSTEM REMINDER: Fix your JSON syntax and output the next <tool_call>.]`;
                continue;
            }
            
            if (!toolCall) {
                console.log(`\n✅ Manager task completed.`);
                break;
            }

            const dangerousTools = ['run_command', 'run_background_command'];
            if (dangerousTools.includes(toolCall.action)) {
                console.log(`\n⚠️  [Manager Action Request]: ${toolCall.action}`);
                console.log(`Arguments: ${JSON.stringify(toolCall, null, 2)}`);
                
                const readline = require('readline');
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                const answer: string = await new Promise((resolve) => {
                    rl.question('Allow Tech Lead to execute this? (y/n): ', (ans: string) => {
                        rl.close();
                        resolve(ans.trim());
                    });
                });

                if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes' && answer !== '') {
                    currentMessage = `<tool_result>\nUser denied permission.\n</tool_result>\n[SYSTEM REMINDER: Output next <tool_call>.]`;
                    continue;
                }
            }

            console.log(`\n⚙️ Executing Manager Skill: ${toolCall.action}`);
            let result = await this.skillManager.executeSkill(toolCall.action, toolCall);
            
            if (result.length > 20000) {
                result = result.substring(0, 20000) + "\n\n...[TRUNCATED]...";
            }

            currentMessage = `<tool_result>\n${result}\n</tool_result>\n[SYSTEM REMINDER: What is your next management step? Output next <tool_call>.]`;
        }
    }

    private parseToolCall(text: string): any | null {
        const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
        if (!match) return null;
        let jsonStr = match[1].trim();
        if (jsonStr.startsWith('\`\`\`json')) jsonStr = jsonStr.substring(7);
        else if (jsonStr.startsWith('\`\`\`')) jsonStr = jsonStr.substring(3);
        if (jsonStr.endsWith('\`\`\`')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        
        jsonStr = jsonStr.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
        return JSON.parse(jsonStr.trim());
    }
}
