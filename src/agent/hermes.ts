import { AgentProvider } from '../providers/interface';
import { OrchestratorAgent, OrchestratorPlan } from './orchestrator';
import { SkillManager } from './skillManager';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// HERMES — Master Brain + Self-Learning Agent
// Named after the Greek messenger god — receives user intent, creates a plan,
// delegates to Orchestrator, then LEARNS from every session to improve.
// ─────────────────────────────────────────────────────────────────────────────

const HERMES_SYSTEM_PROMPT = `You are HERMES, the Master Brain of ATCLI — a self-improving, self-learning AI orchestrator.

## Your Role
You receive a user task, PLAN it into structured subtasks, then delegate to the Orchestrator which runs 15 specialist sub-agents.
You also LEARN: after every session, you write what you learned into a SKILL.md file for future use.

## Step 1: Load Memory
Always start by reading AGENTICA_MEMORY.md (if it exists) to recall past patterns for this type of task.

## Step 2: Search for Relevant Skills
Before planning, search for existing skills that could accelerate the task using search_skills_marketplace.

## Step 3: Create a Plan
Output a JSON plan in this EXACT format inside a <tool_call> block:

<tool_call>
{"action": "execute_plan", "plan": {
  "goal": "brief description of overall goal",
  "subtasks": [
    {"id": 1, "agent": "security", "task": "Audit the task for dangerous operations", "dependsOn": []},
    {"id": 2, "agent": "coder", "task": "Create src/index.ts with ...", "dependsOn": [1]},
    {"id": 3, "agent": "openclaw", "task": "Open browser and ...", "dependsOn": [2]}
  ]
}}
</tool_call>

## Available Agents (use exact names):
- openclaw: Full browser OS control (clicks, types, screenshots, Word Online)
- coder: Write/edit code files only
- terminal: Run terminal commands only
- fileops: File system operations (read, list, move, delete)
- git: Git and GitHub operations
- package: npm/yarn/pip installs and skills.sh installs
- search: Web search and local code search
- word: MS Word document creation
- security: Security audit (always run FIRST for dangerous tasks)
- skills: Find and install skills from skills.sh
- devserver: Start/stop dev servers
- audit: Code quality and TypeScript error checking
- design: Visual UI/UX checking via browser screenshots
- data: Data analysis and extraction
- deploy: Deploy to Vercel, Netlify, Railway etc.

## Step 4: After Execution — Learn
After the Orchestrator returns results, write what you learned to .atcli-skills/auto-learned/<task-type>/SKILL.md
using write_file. This teaches future HERMES sessions to be faster.

## Rules
- Security agent MUST run first (id: 1) for any task involving file writes or terminal commands.
- dependsOn ensures correct order — always declare dependencies.
- For simple single-step tasks (e.g., search, read), use just one subtask.
- NEVER put more than 20 subtasks in one plan — break large tasks into phases.
- Output EXACTLY ONE <tool_call> per turn.`;

export class HermesAgent {
    private skillManager: SkillManager;
    private orchestrator: OrchestratorAgent;
    private learningDir: string;
    public isAgenticaMode = true;

    constructor(private provider: AgentProvider) {
        this.skillManager = new SkillManager();
        this.orchestrator = new OrchestratorAgent(provider);
        this.learningDir = path.join(
            (global as any).atcli_project_root || process.cwd(),
            '.atcli-skills', 'auto-learned'
        );
    }

    public async run(userTask: string): Promise<void> {
        console.log(`\n👑 [HERMES] Master Brain activated.`);
        console.log(`📌 [HERMES] Task: ${userTask.substring(0, 100)}`);

        await this.skillManager.loadAllSkills();

        // Store provider globally for sub-agents to use
        (global as any).atcli_current_provider = this.provider;

        // Load Agentica memory if it exists
        const memPath = path.join(
            (global as any).atcli_project_root || process.cwd(),
            'AGENTICA_MEMORY.md'
        );
        let memory = '';
        if (fs.existsSync(memPath)) {
            memory = fs.readFileSync(memPath, 'utf-8').substring(0, 3000);
            console.log(`\n📖 [HERMES] Loaded Agentica memory (${memory.length} chars)`);
        }

        // Check auto-learned skills
        const autoLearnedSkills = this.listAutoLearnedSkills();

        const contextMessage = [
            HERMES_SYSTEM_PROMPT,
            memory ? `\n## Past Session Memory:\n${memory}` : '',
            autoLearnedSkills ? `\n## Auto-Learned Skills Available:\n${autoLearnedSkills}` : '',
            `\n## User Task:\n${userTask}`,
            `\n## Instruction:\nStart by planning this task. Output your plan as a <tool_call> with action "execute_plan".`,
        ].join('\n');

        let currentMessage = contextMessage;
        let iterationCount = 0;
        const maxIterations = 50;

        while (iterationCount < maxIterations) {
            iterationCount++;
            console.log(`\n[HERMES Iteration ${iterationCount}/${maxIterations}]`);

            const response = await this.provider.sendMessage(currentMessage);

            if (response.error) {
                console.log(`❌ [HERMES] Provider error: ${response.error}`);
                break;
            }

            const aiText = response.text;
            console.log(`\n[HERMES PLAN]:\n${aiText.substring(0, 500)}`);

            // Parse tool call
            const toolCallMatch = aiText.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
            if (!toolCallMatch) {
                // No tool call = Hermes finished (learning phase or final summary)
                console.log(`\n✅ [HERMES] Task complete.`);
                this.triggerLearning(userTask, aiText);
                break;
            }

            let toolCall: any;
            try {
                let jsonStr = toolCallMatch[1].trim();
                jsonStr = jsonStr.replace(/\u201c/g, '\\"').replace(/\u201d/g, '\\"')
                    .replace(/\u2018/g, "'").replace(/\u2019/g, "'");
                jsonStr = jsonStr.replace(/\\([^"\/bfnrtu])/g, '\\\\$1');
                toolCall = JSON.parse(jsonStr);
            } catch (err: any) {
                currentMessage = `<tool_result>\nJSON parse error: ${err.message}. Fix your plan JSON.\n</tool_result>`;
                continue;
            }

            // ── Handle execute_plan (main flow) ─────────────────────────────
            if (toolCall.action === 'execute_plan') {
                const plan: OrchestratorPlan = toolCall.plan;

                if (!plan || !Array.isArray(plan.subtasks)) {
                    currentMessage = `<tool_result>\nInvalid plan format. Must include "goal" and "subtasks" array.\n</tool_result>`;
                    continue;
                }

                console.log(`\n🗺️  [HERMES] Plan received with ${plan.subtasks.length} subtasks. Handing to Orchestrator...`);
                const orchestratorResult = await this.orchestrator.executePlan(plan);

                // Feed results back to Hermes for learning phase
                currentMessage = [
                    `<tool_result>\n${orchestratorResult.substring(0, 20000)}\n</tool_result>`,
                    `[HERMES LEARNING PHASE]:`,
                    `The Orchestrator has completed the plan. Now:`,
                    `1. Summarize what was accomplished for the user.`,
                    `2. If you learned a reusable pattern, write it as a SKILL.md using write_file to:`,
                    `   .atcli-skills/auto-learned/${this.slugify(plan.goal)}/SKILL.md`,
                    `3. Update AGENTICA_MEMORY.md with key lessons from this session.`,
                    `4. Then output your final summary to the user WITHOUT a <tool_call> block.`,
                ].join('\n');
                continue;
            }

            // ── Handle write_file (learning phase) ──────────────────────────
            if (toolCall.action === 'write_file' || toolCall.action === 'create_file') {
                const result = await this.skillManager.executeSkill(toolCall.action, toolCall);
                currentMessage = `<tool_result>\n${result}\n</tool_result>\n[Continue with next step.]`;
                continue;
            }

            // ── Handle search_skills_marketplace ───────────────────────────
            if (toolCall.action === 'search_skills_marketplace') {
                const result = await this.skillManager.executeSkill('search_skills_marketplace', toolCall);
                currentMessage = `<tool_result>\n${result}\n</tool_result>\n[Now create your plan.]`;
                continue;
            }

            // ── Unknown tool — pass to skill manager ────────────────────────
            const result = await this.skillManager.executeSkill(toolCall.action, toolCall);
            currentMessage = `<tool_result>\n${result}\n</tool_result>\n[Continue.]`;
        }
    }

    private triggerLearning(task: string, summary: string): void {
        // Background learning — write compressed lesson to AGENTICA_MEMORY.md
        try {
            const memPath = path.join(
                (global as any).atcli_project_root || process.cwd(),
                'AGENTICA_MEMORY.md'
            );
            const entry = `\n## Session: ${new Date().toISOString().substring(0, 10)}\n**Task**: ${task.substring(0, 100)}\n**Outcome**: ${summary.substring(0, 300)}\n`;
            if (!fs.existsSync(memPath)) {
                fs.writeFileSync(memPath, '# AGENTICA MEMORY\n> Hermes self-learning log.\n', 'utf-8');
            }
            fs.appendFileSync(memPath, entry, 'utf-8');
            console.log(`\n📚 [HERMES] Learning written to AGENTICA_MEMORY.md`);
        } catch { /* non-critical */ }
    }

    private listAutoLearnedSkills(): string {
        try {
            if (!fs.existsSync(this.learningDir)) return '';
            const skills = fs.readdirSync(this.learningDir, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => `- ${e.name}`)
                .join('\n');
            return skills || '';
        } catch { return ''; }
    }

    private slugify(text: string): string {
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40);
    }
}
