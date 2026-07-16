/**
 * SeniorJuniorOrchestrator — "Father of AI" Architecture
 *
 * PRIMARY: Browser DeepSeek + DeepThink ON
 *   → Real reasoning (think block)
 *   → Strip <think>...</think>, use only final answer
 *   → Same browser tab for all escalations (senior has full conversation memory)
 *
 * FALLBACK: NVIDIA / DeepSeek API (if browser unavailable)
 *
 * Flow:
 *   User Task → Senior reasons (browser DeepThink) → structured plan
 *   Local 3b executes step by step
 *   [ESCALATE] signal → SAME senior browser tab → fix → local continues
 */

import { ApiKeyStore } from '../providers/api-key-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Config ────────────────────────────────────────────────────────────────────
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const SENIOR_MODELS = [
    { id: 'deepseek-r1', model: 'deepseek-ai/deepseek-r1-0528', keyAlias: 'nvidia' },
    { id: 'qwen3-235b',  model: 'qwen/qwen3-235b-a22b',         keyAlias: 'nvidia' },
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

// ── Browser Session (persisted across escalations — SAME conversation) ────────

interface SeniorBrowserSession {
    browser: any;      // Playwright Browser
    page: any;         // Playwright Page — stays open for follow-up escalations
    isReady: boolean;
    isFirstMessage: boolean;
    deepthinkEnabled: boolean;
}

let browserSession: SeniorBrowserSession | null = null;

// ── Session Plan State ────────────────────────────────────────────────────────

interface OrchestratorSession {
    plan: OrchestratorPlan | null;
    currentStepId: number;
    escalationCount: number;
    stallCount: number;
    lastToolCall: string;
    seniorModel: string;
}

const SESSION: OrchestratorSession = {
    plan: null,
    currentStepId: 1,
    escalationCount: 0,
    stallCount: 0,
    lastToolCall: '',
    seniorModel: 'deepseek-deepthink-browser',
};

// ── BROWSER SENIOR: DeepSeek + DeepThink (PRIMARY) ───────────────────────────

async function initSeniorBrowser(): Promise<SeniorBrowserSession | null> {
    if (browserSession?.isReady) return browserSession;

    try {
        const { BrowserManager } = await import('../browser/manager');
        const browserManager = BrowserManager.getInstance();
        if (!browserManager.context) {
            await browserManager.initialize();
        }

        const browser = browserManager.context;
        const page = await browserManager.getOrCreatePage('senior_orchestrator', 'https://chat.deepseek.com');

        browserSession = { browser, page, isReady: false, isFirstMessage: true, deepthinkEnabled: false };

        console.log(`\n🌐 [SENIOR BROWSER] Navigating to DeepSeek...`);

        // Wait for page to be interactive
        await page.waitForTimeout(3000);

        // Check if DeepThink button exists and enable it
        await enableDeepThink(page);

        browserSession.isReady = true;
        console.log(`✅ [SENIOR BROWSER] DeepSeek ready with DeepThink — same tab for all escalations`);
        return browserSession;

    } catch (e: any) {
        console.log(`\x1b[33m[SENIOR BROWSER] Could not launch browser: ${e.message}\x1b[0m`);
        return null;
    }
}

async function enableDeepThink(page: any): Promise<void> {
    try {
        // Most reliable: Playwright's getByText — works even when CSS classes change
        const dtByText = page.getByText('DeepThink', { exact: false });
        const count = await dtByText.count();
        if (count > 0) {
            const btn = dtByText.first();
            const isActive = await btn.evaluate((node: Element) =>
                node.getAttribute('class')?.includes('active') ||
                node.getAttribute('aria-pressed') === 'true' ||
                node.closest('[aria-pressed="true"]') !== null
            ).catch(() => false);
            if (!isActive) {
                await btn.click({ timeout: 3000 });
                await page.waitForTimeout(800);
            }
            if (browserSession) browserSession.deepthinkEnabled = true;
            console.log(`✅ [SENIOR] DeepThink enabled (text-match)`);
            return;
        }
    } catch (_) {}

    // Fallback: CSS selector list
    const deepThinkSelectors = [
        'div[class*="deepThink"]',
        'div[class*="deep-think"]',
        'div[class*="deepthink"]',
        'button[class*="deepThink"]',
        '[class*="think"]:not([class*="thinking"])',
    ];

    for (const sel of deepThinkSelectors) {
        try {
            const el = await page.$(sel);
            if (el) {
                const isActive = await el.evaluate((node: Element) =>
                    node.getAttribute('class')?.includes('active') ||
                    node.getAttribute('aria-pressed') === 'true'
                ).catch(() => false);
                if (!isActive) {
                    await el.click();
                    await page.waitForTimeout(800);
                    console.log(`✅ [SENIOR] DeepThink enabled (css-match)`);
                } else {
                    console.log(`✅ [SENIOR] DeepThink already active`);
                }
                if (browserSession) browserSession.deepthinkEnabled = true;
                return;
            }
        } catch (_) {}
    }
    console.log(`\x1b[33m[SENIOR] ⚠️  DeepThink toggle not found — senior using default mode (less reasoning)\x1b[0m`);
}

async function sendMessageToBrowser(prompt: string): Promise<string | null> {
    const session = await initSeniorBrowser();
    if (!session?.isReady) return null;

    const { page, isFirstMessage } = session;

    try {
        // If NOT first message, we're in the same conversation — just type next message
        if (!isFirstMessage) {
            console.log(`\n💬 [SENIOR] Sending follow-up in same conversation...`);
        }

        // Wait for any previous generation to finish before typing the new prompt
        let waitCount = 0;
        let wasGenerating = false;
        while (waitCount < 60) {
            const isGenerating = await page.evaluate(() => {
                if (document.querySelector('[class*="loading"]')) return true;
                if (document.querySelector('[class*="generating"]')) return true;
                if (document.querySelector('span[class*="cursor"]')) return true;
                if (document.querySelector('[class*="stream"]')) return true;
                
                const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
                for (const b of buttons) {
                    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                    if (aria.includes('stop')) return true;
                    
                    const svg = b.querySelector('svg');
                    if (svg) {
                        const html = svg.innerHTML;
                        if (html.includes('rect') && !html.includes('circle')) return true;
                        if (html.includes('M6 6h12v12H6z')) return true;
                    }
                }
                return false;
            }).catch(() => false);

            if (!isGenerating) break;
            
            wasGenerating = true;
            if (waitCount === 0) {
                process.stdout.write(`\n⏳ [SENIOR] Waiting for previous response to finish... `);
            }
            process.stdout.write('.');
            await page.waitForTimeout(3000);
            waitCount++;
        }
        if (wasGenerating) console.log(' Done.');

        // Find the text input
        const inputSelectors = [
            'textarea#chat-input',
            'textarea[placeholder*="Send"]',
            'textarea[placeholder*="message"]',
            'div[contenteditable="true"]',
            'textarea',
        ];

        let input = null;
        for (const sel of inputSelectors) {
            input = await page.$(sel);
            if (input) break;
        }

        if (!input) {
            console.log(`\x1b[33m[SENIOR BROWSER] Input field not found\x1b[0m`);
            return null;
        }

        // Clear and type
        await input.click();
        await page.waitForTimeout(300);

        // Use clipboard for large prompts (faster + avoids typing artifacts)
        await page.evaluate((text: string) => {
            navigator.clipboard.writeText(text).catch(() => {});
        }, prompt);

        // Use page.keyboard to avoid ElementHandle detachment issues during UI re-renders
        await page.keyboard.press('Control+A');
        await page.waitForTimeout(100);
        await page.keyboard.press('Backspace');

        try {
            // Type via keyboard for reliability
            await input.type(prompt.substring(0, 100)); 
            if (prompt.length > 100) {
                // For long prompts, use fill for the rest
                await input.fill(prompt);
            }
        } catch (e) {
            // Fallback if the element detached from the DOM during typing
            await page.keyboard.insertText(prompt);
        }

        await page.waitForTimeout(500);

        // Click send button
        // ── ROBUST SEND BUTTON CLICKER ──
        let sent = await page.evaluate(() => {
            const isStopButton = (b: Element) => {
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                const title = (b.getAttribute('title') || '').toLowerCase();
                if (aria.includes('stop') || title.includes('stop')) return true;
                
                const svg = b.querySelector('svg');
                if (svg) {
                    const html = svg.innerHTML;
                    if (html.includes('rect') && !html.includes('circle')) return true;
                    if (html.includes('M6 6h12v12H6z')) return true;
                }
                return false;
            };

            // Strategy 1: Find the textarea, walk up to its container, find the button inside
            const textareas = document.querySelectorAll('textarea');
            if (textareas.length > 0) {
                const ta = textareas[textareas.length - 1];
                let wrapper = ta.parentElement;
                // Go up to 5 levels to find the chat input container
                for (let i = 0; i < 5; i++) {
                    if (!wrapper) break;
                    // DeepSeek uses a div[role="button"] for send, usually the last button in the wrapper
                    const buttons = Array.from(wrapper.querySelectorAll('div[role="button"], button')).reverse();
                    for (const btn of buttons) {
                        if (btn !== ta && !btn.hasAttribute('disabled')) {
                            // RACE CONDITION FIX: If the button is a Stop button, the prompt auto-submitted!
                            // Do NOT click it, just consider it successfully sent.
                            if (isStopButton(btn)) {
                                return true; 
                            }
                            
                            // The send button usually doesn't have text, but has an SVG
                            if (btn.querySelector('svg')) {
                                (btn as HTMLElement).click();
                                return true;
                            }
                        }
                    }
                    wrapper = wrapper.parentElement;
                }
            }
            
            // Strategy 2: Fallback to aria-label
            const ariaBtns = document.querySelectorAll('[aria-label*="send" i]');
            for (const b of Array.from(ariaBtns)) {
                if (!b.hasAttribute('disabled') && !isStopButton(b)) {
                    (b as HTMLElement).click();
                    return true;
                }
            }
            
            return false;
        }).catch(() => false);

        if (sent) {
            console.log(`\x1b[90m[SENIOR BROWSER] Clicked send button via DOM traversal\x1b[0m`);
        } else {
            console.log(`\x1b[90m[SENIOR BROWSER] Send button not found, falling back to Enter key\x1b[0m`);
            // DeepSeek can sometimes accept Enter if focused
            await page.keyboard.press('Enter');
        }

        session.isFirstMessage = false;

        // ── Wait for response ─────────────────────────────────────────────────
        console.log(`\n⏳ [SENIOR] Thinking... (DeepThink is reasoning — this may take 30-120s)`);

        let lastResponseText = '';
        let stableCount = 0;
        let thinkingDone = false;
        const startTime = Date.now();
        const maxWait = 180 * 1000; // 3 minutes max

        while (Date.now() - startTime < maxWait) {
            await page.waitForTimeout(3000);

            // Get the last assistant message text
            const rawText = await page.evaluate(() => {
                // Try multiple selectors for the response content
                const selectors = [
                    '[class*="markdown"] > *',
                    '[class*="message-content"]',
                    '[class*="chat-message"]:last-child',
                    '[class*="ds-message-content"]',
                    '[class*="response"]',
                ];

                for (const sel of selectors) {
                    const elements = document.querySelectorAll(sel);
                    if (elements.length > 0) {
                        const last = elements[elements.length - 1];
                        return last?.textContent || '';
                    }
                }

                // Fallback: get all text from last message div
                const msgs = document.querySelectorAll('[class*="message"]');
                const lastMsg = msgs[msgs.length - 1];
                return lastMsg?.textContent || '';
            }).catch(() => '');

            // Check if thinking is done (</think> or thinking block collapsed)
            const thinkDone = await page.evaluate(() => {
                // Look for think block completion indicators
                return (
                    document.querySelector('[class*="think-complete"]') !== null ||
                    document.querySelector('[class*="thinking-complete"]') !== null ||
                    // Common pattern: thinking collapsed/done
                    document.querySelector('[class*="think"][class*="done"]') !== null ||
                    document.querySelector('[class*="think"][class*="collapse"]') !== null
                );
            }).catch(() => false);

            if (thinkDone && !thinkingDone) {
                thinkingDone = true;
                console.log(`\n💡 [SENIOR] Thinking complete — reading final answer...`);
            }

            // Check if still generating (loading spinner)
            const isGenerating = await page.evaluate(() => {
                if (document.querySelector('[class*="loading"]')) return true;
                if (document.querySelector('[class*="generating"]')) return true;
                if (document.querySelector('span[class*="cursor"]')) return true;
                if (document.querySelector('[class*="stream"]')) return true;
                
                // DeepSeek "Stop generating" button check via SVG path (most reliable)
                const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
                for (const b of buttons) {
                    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                    if (aria.includes('stop')) return true;
                    
                    const svg = b.querySelector('svg');
                    if (svg) {
                        const html = svg.innerHTML;
                        // Stop buttons are usually a square (rect) or specific path like M6 6h12v12H6z
                        if (html.includes('rect') && !html.includes('circle')) return true;
                        if (html.includes('M6 6h12v12H6z')) return true;
                    }
                }
                return false;
            }).catch(() => false);

            // Any valid JSON tool call is at least ~15 chars. Do not block if < 10 chars!
            if (!isGenerating && rawText.length > 10) {
                if (rawText === lastResponseText) {
                    stableCount++;
                    if (stableCount >= 2) {
                        // Response stable for 6 seconds — done
                        break;
                    }
                } else {
                    stableCount = 0;
                    lastResponseText = rawText;
                }
            } else {
                stableCount = 0;
                lastResponseText = rawText;
                if (rawText.length > 0) {
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    process.stdout.write(`\r\x1b[90m   [SENIOR] Reasoning... ${elapsed}s (${rawText.length} chars so far)\x1b[0m`);
                }
            }
        }

        console.log(''); // newline after progress

        if (!lastResponseText) {
            console.log(`\x1b[33m[SENIOR BROWSER] No response received\x1b[0m`);
            return null;
        }

        // ── Extract final answer: strip think blocks ───────────────────────────
        let finalAnswer = lastResponseText;

        // Strip <think>...</think> content (DeepSeek R1 thinking)
        finalAnswer = finalAnswer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        // Also strip "Thinking..." prefix sections
        finalAnswer = finalAnswer.replace(/^[\s\S]*?(?=\{|Step 1|##|The|To|I |Let|First|Here)/i, '').trim();

        // If we stripped too much, try getting just the last paragraph
        if (finalAnswer.length < 50) {
            const parts = lastResponseText.split('\n\n');
            finalAnswer = parts.slice(-Math.min(3, parts.length)).join('\n\n').trim();
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ [SENIOR] Response received in ${elapsed}s (${finalAnswer.length} chars)`);

        return finalAnswer;

    } catch (e: any) {
        console.log(`\x1b[33m[SENIOR BROWSER] Error: ${e.message}\x1b[0m`);
        return null;
    }
}

// ── API SENIOR: NVIDIA / DeepSeek API (FALLBACK) ──────────────────────────────

async function callSeniorViaApi(
    systemPrompt: string,
    userMessage: string,
    maxTokens = 4000
): Promise<string | null> {
    const nvidiaKey = ApiKeyStore.get('nvidia') || ApiKeyStore.get('nvidia2');
    const deepseekKey = ApiKeyStore.get('deepseek');

    if (nvidiaKey) {
        const model = SENIOR_MODELS[0];
        try {
            const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${nvidiaKey}` },
                body: JSON.stringify({
                    model: model.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    temperature: 0.2,
                    max_tokens: maxTokens,
                    stream: false,
                }),
            });
            if (res.ok) {
                const data = await res.json() as any;
                let raw: string = data.choices?.[0]?.message?.content || '';
                raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                SESSION.seniorModel = model.model;
                return raw;
            }
        } catch (_) {}
    }

    if (deepseekKey) {
        try {
            const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
                body: JSON.stringify({
                    model: 'deepseek-reasoner',  // R1 — actual reasoning model
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    temperature: 0.2,
                    max_tokens: maxTokens,
                    stream: false,
                }),
            });
            if (res.ok) {
                const data = await res.json() as any;
                let raw: string = data.choices?.[0]?.message?.content || '';
                // DeepSeek reasoner returns reasoning_content separately
                const reasoning = (data.choices?.[0]?.message as any)?.reasoning_content;
                if (reasoning) {
                    console.log(`\x1b[90m   [SENIOR API] Reasoning: ${reasoning.length} chars (stripped)\x1b[0m`);
                }
                raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                SESSION.seniorModel = 'deepseek-reasoner-api';
                return raw;
            }
        } catch (_) {}
    }

    return null;
}

// ── UNIFIED SENIOR CALL: Browser first, API fallback ─────────────────────────

async function callSenior(prompt: string, systemHint?: string): Promise<string | null> {
    // PRIMARY: Browser DeepSeek with DeepThink (real reasoning)
    const fullPrompt = systemHint ? `${systemHint}\n\n${prompt}` : prompt;
    const browserResult = await sendMessageToBrowser(fullPrompt);
    if (browserResult && browserResult.length > 50) return browserResult;

    // FALLBACK: API if browser failed
    console.log(`\x1b[90m[SENIOR] Browser unavailable — falling back to API\x1b[0m`);
    const apiSystem = systemHint || 'You are a senior software architect. Be precise and concise.';
    return await callSeniorViaApi(apiSystem, prompt, 4000);
}

// ── FUNCTION 1: Generate Task Plan ───────────────────────────────────────────

const PLANNING_PROMPT_PREFIX = `You are a SENIOR PRINCIPAL ENGINEER — the reasoning brain of an AI system.
A junior 3b local model will execute your plan step-by-step.
The junior has limited reasoning — YOUR JOB: perfect atomic plan, no ambiguity.

OUTPUT ONLY VALID JSON (no text outside the JSON):
{
  "task": "one-sentence summary",
  "tech_stack": "exact stack (e.g. Next.js 14 + TypeScript + Tailwind + Prisma)",
  "architecture": "2-sentence architecture overview",
  "warnings": ["critical pitfall 1", "pitfall 2"],
  "steps": [
    {
      "id": 1,
      "title": "short action",
      "what": "EXACT instruction — name exact files, imports, code patterns",
      "tool": "write_file|run_command|browser_goto|replace|read_file",
      "file": "src/path/to/file.ts",
      "command": "npm install pkg1 pkg2",
      "critical": true
    }
  ]
}

RULES: 5-25 steps. Each = 1 tool call. crystal clear. critical:true = escalate on failure.
Final step: browser_screenshot to verify.`;

export async function orchestratePlan(userTask: string): Promise<OrchestratorPlan | null> {
    const isSimple = userTask.length < 25 ||
        /^(hello|hi|hey|thanks|ok|yes|no|done|good|test|ping)\b/i.test(userTask.trim());
    if (isSimple) return null;

    console.log(`\n🧠 [SENIOR BRAIN] Opening DeepSeek with DeepThink for project planning...`);

    const prompt = `${PLANNING_PROMPT_PREFIX}\n\nUSER TASK: "${userTask}"`;
    const raw = await callSenior(prompt);

    if (!raw) {
        console.log(`\x1b[33m[SENIOR] No response — local model will self-plan\x1b[0m`);
        return null;
    }

    try {
        let jsonStr = raw;

        // Extract JSON if wrapped in markdown
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];

        // Find first { and last } if raw has surrounding text
        const start = jsonStr.indexOf('{');
        const end = jsonStr.lastIndexOf('}');
        if (start !== -1 && end !== -1) jsonStr = jsonStr.substring(start, end + 1);

        const plan: OrchestratorPlan = JSON.parse(jsonStr);
        plan.createdAt = new Date().toISOString();
        plan.seniorModel = SESSION.seniorModel;

        SESSION.plan = plan;
        SESSION.currentStepId = 1;
        SESSION.escalationCount = 0;
        SESSION.stallCount = 0;

        // Cache to disk
        const cacheDir = path.join(process.cwd(), '.atcli-tmp');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(
            path.join(process.cwd(), PLAN_CACHE_FILE),
            JSON.stringify({ plan, session: { currentStepId: 1 } }, null, 2),
            'utf-8'
        );

        console.log(`\n✅ [SENIOR BRAIN] Plan ready: ${plan.steps.length} steps | ${plan.tech_stack}`);
        console.log(`\x1b[90m   Architecture: ${plan.architecture}\x1b[0m`);
        return plan;

    } catch (e: any) {
        console.log(`\x1b[33m[SENIOR] Plan parse failed: ${e.message} — showing raw:\x1b[0m`);
        console.log(raw.substring(0, 500));
        return null;
    }
}

// ── FUNCTION 2: Mid-Task Escalation (SAME browser tab = full context) ─────────

export async function escalateToSenior(
    issue: string,
    context: { errorOutput?: string; fileContent?: string; stepId?: number }
): Promise<EscalationResult | null> {
    SESSION.escalationCount++;

    // Use SAME browser session → senior remembers the full plan and previous conversation!
    const prompt = [
        `I'm on Step ${context.stepId || SESSION.currentStepId} of the plan.`,
        `Problem: ${issue}`,
        context.errorOutput ? `\nError output:\n${context.errorOutput.substring(0, 1000)}` : '',
        context.fileContent ? `\nCurrent file:\n\`\`\`\n${context.fileContent.substring(0, 1000)}\n\`\`\`` : '',
        `\nProvide the EXACT fix. Output JSON: {"solution":"exact fix code or command","explanation":"why","code":"full corrected content if needed"}`,
    ].filter(Boolean).join('\n');

    console.log(`\n🆘 [SENIOR RESCUE] Escalation #${SESSION.escalationCount} — asking senior (same conversation)...`);

    const raw = await callSenior(prompt,
        `You are the senior engineer helping with the project we just planned. Give a precise, copy-pasteable fix.`);

    if (!raw) return null;

    try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]) as EscalationResult;
        return { solution: raw, explanation: 'Senior provided direct answer', code: undefined };
    } catch {
        return { solution: raw, explanation: 'Senior provided direct answer', code: undefined };
    }
}

// ── FUNCTION 3: Format Plan for Local Model ───────────────────────────────────

export function formatOrchestratorPlan(plan: OrchestratorPlan): string {
    const stepLines = plan.steps.map(s => {
        let line = `Step ${s.id}: [${s.tool}] ${s.title}`;
        line += `\n  → ${s.what}`;
        if (s.file) line += `\n  → File: ${s.file}`;
        if (s.command) line += `\n  → Run: ${s.command}`;
        if (s.critical) line += `\n  ⚠️ CRITICAL — write [ESCALATE]: <error> if this fails`;
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

RULES: ONE step per turn. If CRITICAL step fails → write "[ESCALATE]: <exact error>".
After ALL steps → aecl_check → browser_screenshot.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ── FUNCTION 4: Stall Detection ───────────────────────────────────────────────

export function detectStall(toolCallAction: string): boolean {
    if (toolCallAction === SESSION.lastToolCall) {
        SESSION.stallCount++;
    } else {
        SESSION.stallCount = 0;
        SESSION.lastToolCall = toolCallAction;
    }
    return SESSION.stallCount >= 2;
}

// ── FUNCTION 5: Session Accessors ─────────────────────────────────────────────

export function getSessionPlan(): OrchestratorPlan | null { return SESSION.plan; }
export function getCurrentStep(): number { return SESSION.currentStepId; }
export function advanceStep(): void { SESSION.currentStepId++; }
export function resetSession(): void {
    SESSION.plan = null;
    SESSION.currentStepId = 1;
    SESSION.escalationCount = 0;
    SESSION.stallCount = 0;
    // Don't close browser — keep for next project
}

// ── FUNCTION 6: Resume cached plan ────────────────────────────────────────────

export function loadCachedPlan(): OrchestratorPlan | null {
    try {
        const p = path.join(process.cwd(), PLAN_CACHE_FILE);
        if (!fs.existsSync(p)) return null;
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        const age = Date.now() - new Date(data.plan.createdAt).getTime();
        if (age > 2 * 60 * 60 * 1000) return null; // 2 hour max
        SESSION.plan = data.plan;
        SESSION.currentStepId = data.session?.currentStepId ?? 1;
        console.log(`\x1b[90m[ORCHESTRATOR] Resumed cached plan (step ${SESSION.currentStepId}/${SESSION.plan?.steps.length})\x1b[0m`);
        return data.plan;
    } catch { return null; }
}

// ── FUNCTION 7: Cleanup ───────────────────────────────────────────────────────

export async function closeSeniorBrowser(): Promise<void> {
    if (browserSession) {
        browserSession = null;
        // Actual browser close is now handled by BrowserManager.closeAll()
    }
}
