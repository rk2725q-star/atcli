import { AgentProvider } from '../providers/interface';
import { OrchestratorAgent, OrchestratorPlan } from './orchestrator';
import { SkillManager } from './skillManager';
import { memoryStore, ATCLI_MEMORY_ROOT } from './memory/store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// HERMES — Master Brain + Self-Learning Agent
// Named after the Greek messenger god — receives user intent, creates a plan,
// delegates to Orchestrator, then LEARNS from every session to improve.
// ─────────────────────────────────────────────────────────────────────────────

const HERMES_SYSTEM_PROMPT = `You are HERMES, the Master Brain of ATCLI — a self-improving, self-learning AI orchestrator.
Modelled after the Hermes Agent (Nous Research) and OpenClaw persistent agent architecture.

## Your Role
You receive a user task, PLAN it into structured subtasks via execute_plan, delegate to Orchestrator (25 specialist sub-agents), then LEARN.
Persistent memory is stored globally at ~/.atcli/memory/ — survives all sessions and projects.

## Step 1: Intelligent Memory Recall
Use memory_recall to search past sessions for relevant patterns BEFORE planning.
If recall returns results, use them to create a FASTER, SMARTER plan.

## Step 2: Search for Relevant Skills (optional)
If the task needs external capabilities, use search_skills_marketplace.

## Step 3: Create a Structured Plan
Output a JSON plan in this EXACT format:

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

## All 25 Available Agents (use exact names):
### Original 15:
- openclaw: Full browser OS control (clicks, types, screenshots, Word Online, self-healing)
- coder: Write/edit/fix code files only
- terminal: Run safe terminal commands
- fileops: File system operations (read, list, move, delete)
- git: Git and GitHub operations
- package: npm/yarn/pip installs and skills.sh installs
- search: Web search and local code search
- word: MS Word document creation (Times New Roman 14pt headings, Arial 12pt body)
- security: Security audit (ALWAYS run id:1 for destructive tasks)
- skills: Find and install skills from skills.sh marketplace
- devserver: Start/stop development servers in background
- audit: Code quality and TypeScript error checking via aecl_check
- design: Visual UI/UX checking via browser screenshots
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

            // ── Handle memory_recall (Hermes FTS recall) ─────────────────────
            if (toolCall.action === 'memory_recall') {
                const recalled = memoryStore.recall(toolCall.query || '', 2000);
                currentMessage = `<tool_result>\n${recalled || 'No past sessions found.'}\n</tool_result>\n[Use this context to create your plan. Output <tool_call> with execute_plan.]`;
                continue;
            }

            // ── Handle memory_write (Hermes learning) ────────────────────────
            if (toolCall.action === 'memory_write') {
                const result = await this.skillManager.executeSkill('memory_write', toolCall);
                currentMessage = `<tool_result>\n${result}\n</tool_result>\n[Continue.]`;
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
        // Hermes-style persistent learning — writes to ~/.atcli/memory/ globally
        try {
            const keywords = task.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 8);
            memoryStore.writeSession({
                date: new Date().toISOString(),
                task: task.substring(0, 150),
                outcome: summary.substring(0, 300),
                keywords,
                agentsUsed: ['hermes', 'orchestrator'],
            });
            console.log(`\n📚 [HERMES] Session written to ${ATCLI_MEMORY_ROOT}`);
        } catch { /* non-critical */ }
    }

    private listAutoLearnedSkills(): string {
        // List from persistent memory's skills-learned/ dir
        try {
            const skillsDir = path.join(ATCLI_MEMORY_ROOT, 'skills-learned');
            if (!fs.existsSync(skillsDir)) return '';
            return fs.readdirSync(skillsDir, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => `- ${e.name}`)
                .join('\n');
        } catch { return ''; }
    }

    private slugify(text: string): string {
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40);
    }
}
