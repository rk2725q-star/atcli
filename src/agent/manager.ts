import { AgentProvider } from '../providers/interface';
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

# ARCHITECTURE UPGRADE PROTOCOLS (LAZY LOADED)
As the Tech Lead Agent, to operate at maximum efficiency, you MUST read and follow the instructions in these two global skills before making major architectural decisions:
1. \`atcli-phase7-architecture\` (For RAG, Token Management, and LSP Integration)
2. \`atcli-phase8-overdrive\` (For Strategic Planning, TDD, and Agent Coordination)
Use the \`read_file\` tool to read their \`SKILL.md\` files.
`;

    let customKnowledgeList = "";
    
    async function scanForSkillDirectories(dir: string) {
        try {
            const fs = require('fs/promises');
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    customKnowledgeList += `- ${entry.name}\n`;
                }
            }
        } catch (e) {
            // Ignore if directory doesn't exist
        }
    }

    const path = require('path');
    const atcliSkillsDir = path.resolve(process.cwd(), '.atcli-skills');
    const skillsShDir = path.resolve(process.cwd(), '.agents', 'skills');
    const globalKnowledgeDir = path.resolve(__dirname, '..', '..', 'src', 'agent', 'knowledge', '.agents', 'skills');
    const osGlobalSkillsDir = path.resolve(process.cwd(), '.agents', 'skills');
    const geminiGlobalSkillsDir = path.resolve(require('os').homedir(), '.gemini', 'config', 'skills');
    
    await scanForSkillDirectories(atcliSkillsDir);
    await scanForSkillDirectories(skillsShDir);
    await scanForSkillDirectories(globalKnowledgeDir);
    await scanForSkillDirectories(osGlobalSkillsDir);
    await scanForSkillDirectories(geminiGlobalSkillsDir);

    let customKnowledge = "";
    if (customKnowledgeList) {
        customKnowledge = `
# PROJECT SPECIFIC KNOWLEDGE & SKILLS (LAZY LOADED)
We have 40+ custom skills available. To save context space, only their folder names are listed below.
The skills are physically located in the following absolute paths on this machine:
- ${atcliSkillsDir}
- ${skillsShDir}
- ${globalKnowledgeDir}
- ${osGlobalSkillsDir}
- ${geminiGlobalSkillsDir}

You MUST use the \`grep_search\` tool to search for keywords inside those EXACT absolute paths to find them.
Once you identify a relevant skill folder, you MUST use \`list_dir\` to explore it using its absolute path, and \`read_file\` to read its \`SKILL.md\` or \`README.md\` documentation before making decisions.

Available Skill Folders:
${customKnowledgeList}
`;
    }

    return basePrompt + dynamicSkills + rules + customKnowledge;
}

export class ManagerLoop {
    private maxIterations = 500;
    private skillManager: SkillManager;
    public isAgenticaMode: boolean = false;

    constructor(private provider: AgentProvider, private isFirstMessage: boolean = true) {
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

            const dangerousTools = ['run_command', 'run_background_command', 'install_skill'];
            if (dangerousTools.includes(toolCall.action)) {
                console.log(`\n⚠️  [Manager Action Request]: ${toolCall.action}`);
                console.log(`Arguments: ${JSON.stringify(toolCall, null, 2)}`);
                
                if (this.isAgenticaMode) {
                    console.log(`\n🛡️ [Agentica Autonomy] Auto-approving dangerous command for Tech Lead Auditor due to Memory Lockdown restrictions.`);
                } else {
                    const rawAnswer = await (global as any).askQuestion('Allow Tech Lead to execute this? (Y/n/feedback): ');
                    const answer = rawAnswer.trim();

                    if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
                        console.log(`\n🚫 Action rejected by user.`);
                        currentMessage = `<tool_result>\nUser denied permission.\n</tool_result>\n[SYSTEM REMINDER: Output next <tool_call>.]`;
                        continue;
                    } else if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes' && answer !== '') {
                        console.log(`\n💬 Sending user feedback to Tech Lead...`);
                        currentMessage = `<tool_result>\nUser rejected with feedback: ${answer}\n</tool_result>\n[SYSTEM REMINDER: Correct your tool call based on feedback and output next <tool_call>.]`;
                        continue;
                    }
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
        // Scrub internal model tokens that leak into the stream (e.g. Minimax)
        text = text.replace(/\]<\]minimax\[>\[?/g, '');

        // Look for <tool_call> ... </tool_call>
        const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
        if (!match) return null; // No tool call means conversational response

        // Remove markdown code block syntax if the AI included it (e.g., ```json ... ```)
        let jsonStr = match[1].trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
        else if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        
        jsonStr = jsonStr.trim();

        if (jsonStr.startsWith('<invoke')) {
            throw new Error(`CRITICAL FORMAT ERROR: You output XML <invoke> tags inside <tool_call>. I DO NOT accept XML tools. You MUST output a pure JSON object inside <tool_call>. Example: <tool_call>{"action": "run_command", "command": "pwd"}</tool_call>`);
        }

        // ── Universal Smart Quote Sanitizer ──────────────────────────────────
        // AIs write "word" (curly quotes) inside JSON — causes parse errors.
        jsonStr = jsonStr
            .replace(/\u201c/g, '\\"')   // " → escaped "
            .replace(/\u201d/g, '\\"')   // " → escaped "
            .replace(/\u2018/g, "'")     // ' → plain '
            .replace(/\u2019/g, "'")     // ' → plain '
            .replace(/\u2033/g, '\\"')   // ″ → escaped "
            .replace(/\u00ab/g, '\\"')   // « → escaped "
            .replace(/\u00bb/g, '\\"');  // » → escaped "

        // Custom robust auto-fix for write_file tool which often contains unescaped quotes/newlines
        if (jsonStr.includes('"write_file"')) {
            const contentRegex = /"content"\s*:\s*"([\s\S]*)"\s*}/;
            const contentMatch = jsonStr.match(contentRegex);
            if (contentMatch) {
                let rawContent = contentMatch[1];
                // Unescape first to avoid double escaping if the AI partially escaped it
                rawContent = rawContent
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\t/g, '\t')
                    .replace(/\\\\/g, '\\');
                
                // Re-escape perfectly for JSON
                let safeContent = rawContent
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t');
                
                // Replace the broken content with the perfectly escaped content
                jsonStr = jsonStr.replace(contentRegex, `"content": "${safeContent}"}`);
            }
        }
        
        function repairJsonEscapes(str: string): string {
            let repaired = str.replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u');
            repaired = repaired.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
            return repaired;
        }

        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            try {
                return JSON.parse(repairJsonEscapes(jsonStr));
            } catch (e2) {
                try {
                    const { jsonrepair } = require('jsonrepair');
                    const repaired = jsonrepair(repairJsonEscapes(jsonStr));
                    return JSON.parse(repaired);
                } catch (e3) {
                    throw e2;
                }
            }
        }
    }
}
