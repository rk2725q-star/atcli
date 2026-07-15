/**
 * SeniorPlanner — Cloud AI Brain for Local Model Execution
 *
 * When running on a local model (Ollama 3b/7b), the model lacks deep planning
 * ability. This module calls a cloud AI (NVIDIA/DeepSeek API) as a "Senior Dev"
 * to create a structured, numbered plan. The local model then executes each step
 * without needing to plan at a high level.
 */

import { ApiKeyStore } from '../../providers/api-key-store';
import * as fs from 'fs';
import * as path from 'path';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_PLAN_MODEL = 'deepseek-ai/deepseek-r1-0528'; // deep reasoner for planning
const PLAN_CACHE_DIR = '.atcli-tmp';
const PLAN_CACHE_FILE = 'senior_plan.json';

export interface SeniorStep {
    step: number;
    title: string;
    description: string;
    tool_hint?: string;   // e.g. "write_file", "run_command"
    file_path?: string;   // file to create/modify if applicable
}

export interface SeniorPlan {
    task: string;
    steps: SeniorStep[];
    tech_stack?: string;
    warnings?: string[];
    createdAt: string;
}

/**
 * Uses NVIDIA/DeepSeek API to produce a structured execution plan for the task.
 * Falls back gracefully if no API key is available.
 */
export async function createSeniorPlan(userTask: string): Promise<SeniorPlan | null> {
    const nvidiaKey = ApiKeyStore.get('nvidia') || ApiKeyStore.get('nvidia2');
    if (!nvidiaKey) {
        return null; // No cloud key — skip planning, local model will do its best
    }

    const planningPrompt = `You are a SENIOR SOFTWARE ENGINEER acting as the planning brain for a JUNIOR LOCAL AI MODEL (qwen2.5-coder:3b).

The junior model has limited reasoning ability. Your job is to create a DETAILED, NUMBERED EXECUTION PLAN so the junior model only needs to follow steps — not think.

USER TASK: "${userTask}"

OUTPUT RULES:
- Respond ONLY with valid JSON. No prose before or after.
- The JSON must match this schema exactly:
{
  "task": "one-sentence summary of the task",
  "tech_stack": "what tech will be used (e.g. HTML/CSS/JS, React+Vite, Python Flask)",
  "warnings": ["any pitfall the junior model should know"],
  "steps": [
    {
      "step": 1,
      "title": "Short action title",
      "description": "Exact instruction. Be specific. Name exact files, commands, imports.",
      "tool_hint": "write_file|run_command|browser_goto|read_file|replace",
      "file_path": "path/to/file.ext (if applicable)"
    }
  ]
}

PLANNING RULES:
1. Break the task into 5-20 atomic steps. Each step = 1 tool call for the junior.
2. Start with project scaffold (mkdir, package.json, install) then work top-down.
3. Name exact file paths relative to the project root.
4. For web projects: always include index.html, CSS, JS as separate steps.
5. Include a final step: "Start dev server and verify with browser screenshot".
6. If browser research is needed (API docs, library syntax): add a step using browser_goto.`;

    try {
        console.log(`\n🧠 [SENIOR PLANNER] Consulting cloud AI for execution plan...`);
        
        const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${nvidiaKey}`,
            },
            body: JSON.stringify({
                model: NVIDIA_PLAN_MODEL,
                messages: [{ role: 'user', content: planningPrompt }],
                temperature: 0.2,
                max_tokens: 3000,
                stream: false,
            }),
        });

        if (!response.ok) {
            console.log(`\n⚠️  [SENIOR PLANNER] Cloud AI unavailable (${response.status}). Junior will proceed independently.`);
            return null;
        }

        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        let raw = data.choices?.[0]?.message?.content || '';

        // Strip markdown code blocks if the model wrapped it
        raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Strip <think>...</think> reasoning blocks from deepseek-r1
        raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        const plan: SeniorPlan = JSON.parse(raw);
        plan.createdAt = new Date().toISOString();

        // Cache to disk so the loop can reference it
        const cacheDir = path.join(process.cwd(), PLAN_CACHE_DIR);
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, PLAN_CACHE_FILE), JSON.stringify(plan, null, 2), 'utf-8');

        return plan;
    } catch (e: any) {
        console.log(`\n⚠️  [SENIOR PLANNER] Planning failed: ${e.message}. Junior will proceed independently.`);
        return null;
    }
}

/**
 * Formats the senior plan into a compact prompt injection for the local model.
 */
export function formatPlanForLocalModel(plan: SeniorPlan): string {
    const stepLines = plan.steps.map(s => {
        let line = `  Step ${s.step}: [${s.tool_hint || 'action'}] ${s.title}\n    → ${s.description}`;
        if (s.file_path) line += `\n    → File: ${s.file_path}`;
        return line;
    }).join('\n');

    const warnings = plan.warnings && plan.warnings.length > 0
        ? `\n⚠️  PITFALLS TO AVOID:\n${plan.warnings.map(w => `  - ${w}`).join('\n')}`
        : '';

    return `
╔══════════════════════════════════════════════════════════════╗
║            🧠 SENIOR DEV PLAN (Follow This Exactly)         ║
╚══════════════════════════════════════════════════════════════╝

TASK: ${plan.task}
TECH STACK: ${plan.tech_stack || 'auto-detect'}
${warnings}

EXECUTION STEPS (execute in order, ONE step per tool call):
${stepLines}

EXECUTION RULES:
1. Execute EXACTLY ONE step per turn using a <tool_call> block.
2. After each <tool_result>, move to the NEXT step.
3. Do NOT skip steps. Do NOT add steps not in the plan.
4. If a step fails, fix it before proceeding.
5. After all steps done, run aecl_check, then take a browser screenshot.
╚══════════════════════════════════════════════════════════════╝
`;
}

/**
 * Read the last cached plan from disk (for recovery across turns).
 */
export function loadCachedPlan(): SeniorPlan | null {
    try {
        const file = path.join(process.cwd(), PLAN_CACHE_DIR, PLAN_CACHE_FILE);
        if (!fs.existsSync(file)) return null;
        return JSON.parse(fs.readFileSync(file, 'utf-8')) as SeniorPlan;
    } catch {
        return null;
    }
}
