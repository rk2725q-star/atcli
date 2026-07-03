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
You receive a user task, PLAN it into structured subtasks via execute_plan, delegate to the Orchestrator (which runs 25 specialist sub-agents), then LEARN from the outcome.
Persistent memory is stored globally at ~/.atcli/memory/ — survives ALL sessions and projects.

## Step 1: Intelligent Memory Recall (MANDATORY FIRST STEP)
Use memory_recall BEFORE planning to find relevant past sessions:
<tool_call>
{"action": "memory_recall", "query": "<keywords from the task>"}
</tool_call>
Use recalled results to create a FASTER, SMARTER plan (avoid repeating past mistakes).

## Step 2: Create a Structured Plan
After recall, output a JSON plan in this EXACT format:
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

## All 25 Available Agents (use EXACT names):

### Core Agents (1-15):
- openclaw: Full autonomous browser OS control — clicks, types, scrolls, screenshots, DOM extraction, Word Online, self-healing
- coder: Write/edit/fix code files only (TypeScript, Python, JS, etc.) — no terminal, no browser
- terminal: Run safe terminal commands (npm, git, python, etc.) — Gatekeeper blocks destructive cmds
- fileops: File system operations — read, list, grep, move files within project root only
- git: Git and GitHub operations — add, commit, push, pull, branch, merge
- package: Package manager — npm/yarn/pip installs, skills.sh skill installation
- search: Web search (internet_search) and local code search (grep_search)
- word: MS Word document creation — Times New Roman 14pt headings, Arial 12pt body, offline + Word Online
- security: Security audit — ALWAYS use as id:1 for tasks with file writes or terminal commands
- skills: Skills marketplace — search_skills_marketplace, install skills from skills.sh
- devserver: Dev server management — start/stop servers in background, report localhost URL
- audit: Code quality audit — aecl_check TypeScript errors, verify_code, grep anti-patterns
- design: UI/UX visual checker — screenshot, compare with design spec, report issues
- data: Data analysis — read CSV/JSON/XML, extract patterns, web data scraping
- deploy: Deployment automation — Vercel, Netlify, Railway, build → verify → deploy → URL

### Extended Agents (16-25) — OpenClaw + Hermes Level:
- memory: Persistent memory management — memory_recall, memory_write (facts/sessions/skills), memory_read at ~/.atcli/memory/
- vision: Visual understanding via cloud AI — screenshot + annotated DOM, base64 sent to active AI provider for analysis
- reflection: Self-improvement loop — reflect_and_improve evaluates output quality (0-100 score), reports specific issues
- network: HTTP/REST API calls — GET/POST/PUT/DELETE/PATCH, full headers, response processing, no real API keys
- keyboard: PC keyboard control — keyboard_shortcut, clipboard_read/write
- process: System process management — process_list (CPU/RAM), process_kill (safe, Gatekeeper-protected)
- notification: System notifications — Windows toast / macOS banner / Linux notify-send
- heartbeat: Cron-style background scheduler — recurring tasks at set intervals
- database: Local SQLite queries — sqlite_query on .db files, read CSV/JSON/YAML
- compression: Context management — compress_context (bullets/summary/headlines) to prevent context overflow

## Step 3: After Execution — Learn (Hermes Protocol)
After Orchestrator returns results:
1. Write what you learned to memory using:
   <tool_call>{"action": "memory_write", "type": "session", "content": "Task: ..., Outcome: ..., Learned: ..."}</tool_call>
2. If a reusable pattern was found, write it as a SKILL.md:
   <tool_call>{"action": "write_file", "path": ".atcli-skills/auto-learned/<task-slug>/SKILL.md", "content": "..."}</tool_call>
3. Output your final summary to the user WITHOUT a <tool_call> block.

## Rules
- Security agent MUST be id:1 for any task with file writes or terminal commands
- dependsOn ensures correct order — always declare dependencies between subtasks
- For simple single-step tasks, use just one subtask
- NEVER put more than 20 subtasks in one plan — break large tasks into phases
- Output EXACTLY ONE <tool_call> per turn`;

// ─────────────────────────────────────────────────────────────────────────────
// Shared SkillManager singleton — loaded once, reused across all Hermes calls
// FIX 6 (partial): avoids repeated disk scans on every sub-agent creation
// ─────────────────────────────────────────────────────────────────────────────
let _sharedSkillManager: SkillManager | null = null;
async function getSharedSkillManager(): Promise<SkillManager> {
    if (!_sharedSkillManager) {
        _sharedSkillManager = new SkillManager();
        await _sharedSkillManager.loadAllSkills();
    }
    return _sharedSkillManager;
}

export class HermesAgent {
    private orchestrator: OrchestratorAgent;
    private learningDir: string;
    public isAgenticaMode = true;

    constructor(private provider: AgentProvider) {
        this.orchestrator = new OrchestratorAgent(provider);
        this.learningDir = path.join(
            (global as any).atcli_project_root || process.cwd(),
            '.atcli-skills', 'auto-learned'
        );
    }

    public async run(userTask: string): Promise<void> {
        console.log(`\n👑 [HERMES] Master Brain activated.`);
        console.log(`📌 [HERMES] Task: ${userTask.substring(0, 150)}`);

        // FIX 6 (partial): use shared skill manager (loaded once)
        const skillManager = await getSharedSkillManager();

        // Store provider globally for sub-agents to use
        (global as any).atcli_current_provider = this.provider;

        // ── FIX 2+5: Unified memory recall — use memoryStore (global ~/.atcli/memory/)
        // AND old project AGENTICA_MEMORY.md, merge both for maximum context
        let memoryContext = '';

        // a) Global persistent memory (FTS keyword recall — the RIGHT approach)
        const recalled = memoryStore.recall(userTask, 2000);
        if (recalled) {
            memoryContext += `## Past Session Memory (Global — recalled by keyword):\n${recalled}\n\n`;
            console.log(`\n🧠 [HERMES] Recalled ${recalled.length} chars from ~/.atcli/memory/`);
        }

        // b) Project-level AGENTICA_MEMORY.md (legacy — keep for backward compatibility)
        const memPath = path.join(
            (global as any).atcli_project_root || process.cwd(),
            'AGENTICA_MEMORY.md'
        );
        if (fs.existsSync(memPath)) {
            const projectMemory = fs.readFileSync(memPath, 'utf-8').substring(0, 1500);
            memoryContext += `## Project Memory (AGENTICA_MEMORY.md):\n${projectMemory}\n\n`;
            console.log(`\n📖 [HERMES] Loaded project memory (${projectMemory.length} chars)`);
        }

        // Check auto-learned skills
        const autoLearnedSkills = this.listAutoLearnedSkills();

        const contextMessage = [
            HERMES_SYSTEM_PROMPT,
            memoryContext ? `\n${memoryContext}` : '',
            autoLearnedSkills ? `\n## Auto-Learned Skills Available:\n${autoLearnedSkills}` : '',
            `\n## User Task:\n${userTask}`,
            `\n## Instruction:\nStart by using memory_recall to search for relevant past sessions. Then create your plan with execute_plan.`,
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
                // No tool call = Hermes finished (final summary)
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

            // ── Handle execute_plan (main flow) ──────────────────────────────
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
                    `1. Write what you learned to memory using memory_write.`,
                    `2. If you found a reusable pattern, write it as SKILL.md using write_file.`,
                    `3. Output your final summary to the user WITHOUT a <tool_call> block.`,
                ].join('\n');
                continue;
            }

            // ── Handle memory_recall — FIX 2: now properly handled ──────────
            if (toolCall.action === 'memory_recall') {
                const query = toolCall.query || userTask;
                const recalled = memoryStore.recall(query, 2000);
                console.log(`\n🔍 [HERMES] Memory recall for: "${query.substring(0, 60)}"`);
                currentMessage = `<tool_result>\n${recalled || 'No past sessions found for this topic. Proceed with planning.'}\n</tool_result>\n[Now create your plan with execute_plan. Use recalled context to be faster and smarter.]`;
                continue;
            }

            // ── Handle memory_write (Hermes learning) ────────────────────────
            if (toolCall.action === 'memory_write') {
                const result = await skillManager.executeSkill('memory_write', toolCall);
                currentMessage = `<tool_result>\n${result}\n</tool_result>\n[Continue with next step.]`;
                continue;
            }

            // ── Handle write_file (SKILL.md learning) ────────────────────────
            if (toolCall.action === 'write_file' || toolCall.action === 'create_file') {
                const result = await skillManager.executeSkill(toolCall.action, toolCall);
                currentMessage = `<tool_result>\n${result}\n</tool_result>\n[Continue with next step.]`;
                continue;
            }

            // ── Handle search_skills_marketplace ─────────────────────────────
            if (toolCall.action === 'search_skills_marketplace') {
                const result = await skillManager.executeSkill('search_skills_marketplace', toolCall);
                currentMessage = `<tool_result>\n${result}\n</tool_result>\n[Now create your plan with execute_plan.]`;
                continue;
            }

            // ── Unknown tool — pass to skill manager ─────────────────────────
            const result = await skillManager.executeSkill(toolCall.action, toolCall);
            currentMessage = `<tool_result>\n${result}\n</tool_result>\n[Continue.]`;
        }
    }

    // ── FIX 5: triggerLearning now writes to BOTH systems ────────────────────
    private triggerLearning(task: string, summary: string): void {
        try {
            // 1. Write to global persistent memory (new system — cross-project recall)
            const keywords = task.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 8);
            memoryStore.writeSession({
                date: new Date().toISOString(),
                task: task.substring(0, 150),
                outcome: summary.substring(0, 300),
                keywords,
                agentsUsed: ['hermes', 'orchestrator'],
            });
            console.log(`\n📚 [HERMES] Session written to ${ATCLI_MEMORY_ROOT}`);

            // 2. Also write summary to project AGENTICA_MEMORY.md (backward compat)
            const memPath = path.join(
                (global as any).atcli_project_root || process.cwd(),
                'AGENTICA_MEMORY.md'
            );
            const entry = `\n## Session: ${new Date().toISOString().substring(0, 10)}\n**Task**: ${task.substring(0, 100)}\n**Outcome**: ${summary.substring(0, 300)}\n`;
            if (!fs.existsSync(memPath)) {
                fs.writeFileSync(memPath, '# AGENTICA MEMORY\n> Hermes self-learning log.\n', 'utf-8');
            }
            fs.appendFileSync(memPath, entry, 'utf-8');
        } catch { /* non-critical */ }
    }

    private listAutoLearnedSkills(): string {
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
