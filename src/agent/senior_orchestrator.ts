/**
 * SeniorJuniorOrchestrator
 *
 * Architecture: "Father of AI" pattern
 *
 *   [User Task]
 *       ↓
 *   SENIOR (cloud AI) → generates structured plan + reasoning
 *       ↓
 *   LOCAL 3b → executes step by step, fast file writes
 *       ↓
 *   [Error / Stall detected]
 *       ↓
 *   SENIOR (same API session) → fixes reasoning → local resumes
 *
 * The local model is the HANDS. The senior is the BRAIN.
 * Between them: 90%+ of top model quality at local model speed.
 */

import { ApiKeyStore } from '../providers/api-key-store';
import * as fs from 'fs';
import * as path from 'path';

// ── Senior AI Config ──────────────────────────────────────────────────────────
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// Priority order: best reasoning model first
const SENIOR_MODELS = [
    { id: 'deepseek-r1',     model: 'deepseek-ai/deepseek-r1-0528',            keyAlias: 'nvidia'   },
    { id: 'qwen3-235b',      model: 'qwen/qwen3-235b-a22b',                    keyAlias: 'nvidia'   },
    { id: 'llama4-maverick', model: 'meta/llama-4-maverick-17b-128e-instruct', keyAlias: 'nvidia'   },
];

const PLAN_CACHE_FILE = '.atcli-tmp/orchestrator_session.json';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrchestratorPlan {
    task: string;
    tech_stack: string;
    architecture: string;
    warnings: string[];
    steps: OrchestratorStep[];
    createdAt: string;
    seniorModel: string;
}

export interface OrchestratorStep {
    id: number;
    title: string;
    what: string;
    tool: string;
    file?: string;
    command?: string;
    critical: boolean;
}

export interface EscalationResult {
    solution: string;
    code?: string;
    explanation: string;
}

// ── Session State (singleton per ATCLI process) ───────────────────────────────

interface OrchestratorSession {
    plan: OrchestratorPlan | null;
    currentStepId: number;
    escalationCount: number;
    stallCount: number;
    lastToolCall: string;
    seniorModel: typeof SENIOR_MODELS[0] | null;
}

const SESSION: OrchestratorSession = {
    plan: null,
    currentStepId: 1,
    escalationCount: 0,
    stallCount: 0,
    lastToolCall: '',
    seniorModel: null,
};

// ── Core Senior API Call ──────────────────────────────────────────────────────

async function callSenior(
    systemPrompt: string,
    userMessage: string,
    maxTokens = 3000,
    temperature = 0.2
): Promise<string | null> {
    const nvidiaKey = ApiKeyStore.get('nvidia') || ApiKeyStore.get('nvidia2');
    const deepseekKey = ApiKeyStore.get('deepseek');

    // Try NVIDIA first (access to DeepSeek-R1, Qwen3, LLaMA4)
    if (nvidiaKey) {
        const senior = SESSION.seniorModel || SENIOR_MODELS[0];
        SESSION.seniorModel = senior;
        try {
            const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${nvidiaKey}` },
                body: JSON.stringify({
                    model: senior.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    temperature,
                    max_tokens: maxTokens,
                    stream: false,
                }),
            });
            if (res.ok) {
                const data = await res.json() as any;
                let raw: string = data.choices?.[0]?.message?.content || '';
                raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim(); // strip R1 reasoning
                return raw;
            }
        } catch (_) { /* fall through */ }
    }

    // Fallback: DeepSeek direct API
    if (deepseekKey) {
        try {
            const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    temperature,
                    max_tokens: maxTokens,
                    stream: false,
                }),
            });
            if (res.ok) {
                const data = await res.json() as any;
                SESSION.seniorModel = { id: 'deepseek-api', model: 'deepseek-chat', keyAlias: 'deepseek' };
                return data.choices?.[0]?.message?.content || null;
            }
        } catch (_) { /* fall through */ }
    }

    return null; // No senior available — local model works alone
}

// ── FUNCTION 1: Generate Task Plan (call ONCE at project start) ───────────────

export async function orchestratePlan(userTask: string): Promise<OrchestratorPlan | null> {
    // Skip simple conversational messages
    const isSimple = userTask.length < 25 ||
        /^(hello|hi|hey|thanks|ok|yes|no|done|good|test|ping)\b/i.test(userTask.trim());
    if (isSimple) return null;

    const systemPrompt = `You are a SENIOR PRINCIPAL ENGINEER — the BRAIN of an AI system.
A junior 3b local model (HANDS) will execute your plan step by step.
The junior can write files, run commands, use browser — but CANNOT reason or architect.
YOUR JOB: Generate a perfect, atomic execution plan.

OUTPUT ONLY VALID JSON (no text before or after):
{
  "task": "one-sentence summary",
  "tech_stack": "exact stack (e.g. Next.js 14 + TypeScript + Tailwind + Prisma)",
  "architecture": "2-sentence architecture overview",
  "warnings": ["critical pitfall 1", "pitfall 2"],
  "steps": [
    {
      "id": 1,
      "title": "short action title",
      "what": "EXACT instruction — name files, imports, exact code patterns",
      "tool": "write_file|run_command|browser_goto|replace|read_file|list_dir",
      "file": "src/path/to/file.ts",
      "command": "npm install pkg1 pkg2",
      "critical": true
    }
  ]
}

PLANNING RULES:
1. 5-25 atomic steps. Each step = exactly 1 tool call.
2. Be CRYSTAL CLEAR — junior cannot interpret ambiguity.
3. Sequence: scaffold → install → core files → features → tests → run & verify.
4. Include exact package names, import paths, and code patterns.
5. critical:true = escalate to senior AI if this step fails.
6. Final step: browser_screenshot to confirm it works.`;

    console.log(`\n🧠 [SENIOR BRAIN] Generating plan via ${SENIOR_MODELS[0].id}...`);
    const t0 = Date.now();

    const raw = await callSenior(systemPrompt, `USER TASK: "${userTask}"`, 4000, 0.2);
    if (!raw) {
        console.log(`\x1b[90m[SENIOR] No API key available — local model working independently\x1b[0m`);
        return null;
    }

    try {
        const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const plan: OrchestratorPlan = JSON.parse(jsonStr);
        plan.createdAt = new Date().toISOString();
        plan.seniorModel = SESSION.seniorModel?.model || 'unknown';

        // Reset session
        SESSION.plan = plan;
        SESSION.currentStepId = 1;
        SESSION.escalationCount = 0;
        SESSION.stallCount = 0;

        // Persist to disk
        const cacheDir = path.join(process.cwd(), '.atcli-tmp');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(
            path.join(process.cwd(), PLAN_CACHE_FILE),
            JSON.stringify({ plan, session: { currentStepId: SESSION.currentStepId } }, null, 2),
            'utf-8'
        );

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`✅ [SENIOR BRAIN] Plan ready in ${elapsed}s — ${plan.steps.length} steps | ${plan.tech_stack}`);
        console.log(`\x1b[90m   Architecture: ${plan.architecture}\x1b[0m`);
        return plan;

    } catch (e: any) {
        console.log(`\x1b[33m[SENIOR] Plan parse failed: ${e.message} — local model will self-plan\x1b[0m`);
        return null;
    }
}

// ── FUNCTION 2: Mid-Task Escalation (call when local model is stuck) ──────────

export async function escalateToSenior(
    issue: string,
    context: { errorOutput?: string; fileContent?: string; stepId?: number }
): Promise<EscalationResult | null> {
    SESSION.escalationCount++;

    const systemPrompt = `You are a SENIOR ENGINEER rescuing a stuck junior AI model.
Give a PRECISE, COPY-PASTEABLE solution. Be specific. No filler.
Output JSON: {"solution":"exact fix","explanation":"why","code":"full corrected content if needed"}`;

    const userMsg = [
        `TASK: ${SESSION.plan?.task || 'unknown'}`,
        `STACK: ${SESSION.plan?.tech_stack || 'unknown'}`,
        `STEP: ${context.stepId || SESSION.currentStepId}`,
        `ESCALATION #${SESSION.escalationCount}`,
        ``,
        `PROBLEM: ${issue}`,
        context.errorOutput ? `\nERROR:\n${context.errorOutput.substring(0, 1500)}` : '',
        context.fileContent ? `\nFILE:\n\`\`\`\n${context.fileContent.substring(0, 1500)}\n\`\`\`` : '',
    ].filter(Boolean).join('\n');

    console.log(`\n🆘 [SENIOR RESCUE] Escalation #${SESSION.escalationCount} — asking senior for step ${context.stepId || SESSION.currentStepId}...`);

    const raw = await callSenior(systemPrompt, userMsg, 2000, 0.1);
    if (!raw) return null;

    try {
        const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        if (jsonStr.startsWith('{')) return JSON.parse(jsonStr) as EscalationResult;
        return { solution: raw, explanation: 'Senior provided direct answer', code: undefined };
    } catch {
        return { solution: raw, explanation: 'Senior provided direct answer', code: undefined };
    }
}

// ── FUNCTION 3: Reasoning On-Demand ──────────────────────────────────────────

export async function seniorReason(question: string, context?: string): Promise<string | null> {
    const sys = `You are a senior software architect. Answer with precise technical detail.
Give exact code, commands, and patterns. No padding.`;
    const msg = context ? `CONTEXT:\n${context}\n\nQUESTION: ${question}` : question;
    return await callSenior(sys, msg, 1500, 0.1);
}

// ── FUNCTION 4: Format Plan for Local Model's System Prompt ──────────────────

export function formatOrchestratorPlan(plan: OrchestratorPlan): string {
    const stepLines = plan.steps.map(s => {
        let line = `Step ${s.id}: [${s.tool}] ${s.title}`;
        line += `\n  → ${s.what}`;
        if (s.file) line += `\n  → File: ${s.file}`;
        if (s.command) line += `\n  → Run: ${s.command}`;
        if (s.critical) line += `\n  ⚠️ CRITICAL — output [ESCALATE] + error if this fails`;
        return line;
    }).join('\n\n');

    const warnings = plan.warnings?.length > 0
        ? `\n⚠️ AVOID:\n${plan.warnings.map(w => `- ${w}`).join('\n')}\n`
        : '';

    return `
╔══════════════════════════════════════════════╗
║  🧠 SENIOR BRAIN PLAN — Follow exactly       ║
╚══════════════════════════════════════════════╝
TASK: ${plan.task}
STACK: ${plan.tech_stack}
HOW: ${plan.architecture}
${warnings}
STEPS (one tool call per step, in order):
${stepLines}

RULES: ONE step per turn. If CRITICAL step fails → write "[ESCALATE]: <error>".
After ALL steps done → aecl_check → browser_screenshot.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ── FUNCTION 5: Stall Detection ───────────────────────────────────────────────

export function detectStall(toolCallAction: string): boolean {
    if (toolCallAction === SESSION.lastToolCall) {
        SESSION.stallCount++;
    } else {
        SESSION.stallCount = 0;
        SESSION.lastToolCall = toolCallAction;
    }
    return SESSION.stallCount >= 2;
}

// ── FUNCTION 6: Session Accessors ─────────────────────────────────────────────

export function getSessionPlan(): OrchestratorPlan | null { return SESSION.plan; }
export function getCurrentStep(): number { return SESSION.currentStepId; }
export function advanceStep(): void { SESSION.currentStepId++; }
export function resetSession(): void {
    SESSION.plan = null;
    SESSION.currentStepId = 1;
    SESSION.escalationCount = 0;
    SESSION.stallCount = 0;
}

// ── FUNCTION 7: Resume from cached plan ───────────────────────────────────────

export function loadCachedPlan(): OrchestratorPlan | null {
    try {
        const p = path.join(process.cwd(), PLAN_CACHE_FILE);
        if (!fs.existsSync(p)) return null;
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        const age = Date.now() - new Date(data.plan.createdAt).getTime();
        if (age > 2 * 60 * 60 * 1000) return null; // 2 hours max
        SESSION.plan = data.plan;
        SESSION.currentStepId = data.session?.currentStepId ?? 1;
        return data.plan;
    } catch { return null; }
}
