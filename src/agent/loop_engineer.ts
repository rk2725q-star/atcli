/**
 * LoopEngineer — Visual Review → Fix → Repeat Engine
 *
 * After a project builds and a dev server is detected, LoopEngineer:
 * 1. Takes a full-page Playwright screenshot of the running app
 * 2. Sends to a vision AI for human-like QA review
 * 3. Extracts bugs/issues from the review
 * 4. Injects them back into the agent loop as the next task
 * 5. Repeats until review passes (0 issues) or max rounds reached
 */

import * as path from 'path';
import * as fs from 'fs';
import { ApiKeyStore } from '../providers/api-key-store';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const VISION_MODEL = 'nvidia/llama-3.2-90b-vision-instruct'; // Best NVIDIA vision model
const MAX_LOOP_ROUNDS = 5;
const LOOP_STATE_FILE = '.atcli-tmp/loop_engineer_state.json';

interface LoopState {
    round: number;
    url: string;
    lastIssues: string[];
    passedAt?: string;
}

function loadState(): LoopState | null {
    try {
        const f = path.join(process.cwd(), LOOP_STATE_FILE);
        if (!fs.existsSync(f)) return null;
        return JSON.parse(fs.readFileSync(f, 'utf-8')) as LoopState;
    } catch { return null; }
}

function saveState(state: LoopState): void {
    const f = path.join(process.cwd(), LOOP_STATE_FILE);
    const dir = path.dirname(f);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Take a full-page screenshot of the given URL using Playwright.
 * Returns base64-encoded PNG string.
 */
async function screenshotPage(url: string): Promise<string | null> {
    try {
        const { BrowserManager } = await import('../browser/manager');
        const manager = BrowserManager.getInstance();
        const page = await manager.getOrCreatePage('loop-engineer-review', url);
        
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000)); // let JS settle
        
        const screenshotBuf = await page.screenshot({ fullPage: true, type: 'png' });
        return screenshotBuf.toString('base64');
    } catch (e: any) {
        console.log(`\n⚠️  [LOOP ENGINEER] Screenshot failed: ${e.message}`);
        return null;
    }
}

/**
 * Send screenshot to NVIDIA Vision model for QA review.
 * Returns list of issues found, or empty array if all looks good.
 */
async function reviewWithVision(base64Png: string, projectContext: string): Promise<string[]> {
    const nvidiaKey = ApiKeyStore.get('nvidia') || ApiKeyStore.get('nvidia2');
    
    if (!nvidiaKey) {
        // Fallback: use local vision model (qwen3-vl:2b)
        return await reviewWithLocalVision(base64Png, projectContext);
    }

    try {
        const reviewPrompt = `You are a senior QA engineer reviewing a web application screenshot.

Project context: ${projectContext}

Review the screenshot and provide a JSON response with this EXACT format:
{
  "passed": false,
  "issues": [
    "Specific issue 1: describe exactly what is wrong and where",
    "Specific issue 2: ..."
  ],
  "summary": "One sentence overall assessment"
}

If everything looks correct and complete, set "passed": true and "issues": [].

Look for:
1. Broken layout or missing sections
2. Placeholder text (Lorem ipsum, "TODO", "Coming Soon")
3. Missing images or broken image links
4. Buttons that appear non-functional
5. Console errors visible in UI
6. Incomplete features mentioned in the project context
7. Accessibility issues (missing labels, poor contrast)
8. Mobile-unfriendly elements

Be specific — name exact elements, sections, or components that need fixing.`;

        const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${nvidiaKey}`,
            },
            body: JSON.stringify({
                model: VISION_MODEL,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: `data:image/png;base64,${base64Png}` }
                        },
                        { type: 'text', text: reviewPrompt }
                    ]
                }],
                temperature: 0.1,
                max_tokens: 1500,
                stream: false,
            }),
        });

        if (!response.ok) {
            console.log(`\n⚠️  [LOOP ENGINEER] Vision API error (${response.status}). Skipping visual review.`);
            return [];
        }

        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        let raw = data.choices?.[0]?.message?.content || '';
        raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        const review = JSON.parse(raw) as { passed: boolean; issues: string[] };
        return review.passed ? [] : (review.issues || []);

    } catch (e: any) {
        console.log(`\n⚠️  [LOOP ENGINEER] Vision review failed: ${e.message}`);
        return [];
    }
}

/**
 * Fallback: use local Ollama vision model for review.
 */
async function reviewWithLocalVision(base64Png: string, projectContext: string): Promise<string[]> {
    try {
        const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'qwen3-vl:2b',
                messages: [{
                    role: 'user',
                    content: `Review this web app screenshot. Project: ${projectContext}. List any bugs, missing features, broken UI, or placeholder text. Respond with a JSON object: {"passed": boolean, "issues": ["issue1", "issue2"]}`,
                    images: [base64Png]
                }],
                stream: false,
                options: { num_ctx: 8192 }
            })
        });

        if (!response.ok) return [];
        const data = await response.json() as { message?: { content?: string } };
        let raw = data.message?.content || '';
        raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        const review = JSON.parse(raw) as { passed: boolean; issues: string[] };
        return review.passed ? [] : (review.issues || []);
    } catch {
        return [];
    }
}

/**
 * Main entry point — runs one round of Loop Engineering.
 * Returns the issues found (empty = passed, null = skipped).
 */
export async function runLoopEngineerRound(url: string, projectContext: string): Promise<{
    issues: string[];
    round: number;
    passed: boolean;
} | null> {
    const state = loadState() || { round: 0, url, lastIssues: [] };
    
    if (state.round >= MAX_LOOP_ROUNDS) {
        console.log(`\n🔁 [LOOP ENGINEER] Max rounds (${MAX_LOOP_ROUNDS}) reached. Stopping visual review loop.`);
        return null;
    }

    if (state.passedAt) {
        console.log(`\n✅ [LOOP ENGINEER] Project already passed visual review at round ${state.round}.`);
        return { issues: [], round: state.round, passed: true };
    }

    state.round += 1;
    state.url = url;
    
    console.log(`\n🔁 [LOOP ENGINEER] Round ${state.round}/${MAX_LOOP_ROUNDS} — Taking screenshot of ${url}...`);

    const screenshot = await screenshotPage(url);
    if (!screenshot) {
        console.log(`\n⚠️  [LOOP ENGINEER] Could not take screenshot. Skipping visual review.`);
        return null;
    }

    console.log(`\n🔍 [LOOP ENGINEER] Sending screenshot to vision AI for review...`);
    const issues = await reviewWithVision(screenshot, projectContext);

    if (issues.length === 0) {
        state.passedAt = new Date().toISOString();
        saveState(state);
        console.log(`\n✅ [LOOP ENGINEER] Visual review PASSED! No issues found.`);
        return { issues: [], round: state.round, passed: true };
    }

    state.lastIssues = issues;
    saveState(state);

    console.log(`\n🐛 [LOOP ENGINEER] Found ${issues.length} issue(s) in round ${state.round}:`);
    issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));

    return { issues, round: state.round, passed: false };
}

/**
 * Formats loop engineering findings into a message to inject back into the agent.
 */
export function formatLoopEngineerInjection(result: { issues: string[]; round: number; passed: boolean }): string {
    if (result.passed) {
        return `\n\n[LOOP ENGINEER REVIEW ✅ PASSED — Round ${result.round}]\nVisual QA review complete. No issues detected. Project is visually verified.`;
    }

    return `\n\n[LOOP ENGINEER REVIEW 🔁 Round ${result.round} — ${result.issues.length} Issues Found]

The ATCLI visual review engine took a screenshot of your running app and found these issues.
You MUST fix ALL of them before the project can be marked complete:

${result.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

NEXT STEP: Fix each issue above using replace/write_file tools, then restart the dev server and let ATCLI take another screenshot to verify.`;
}

/**
 * Reset loop engineer state for a fresh project.
 */
export function resetLoopEngineer(): void {
    const f = path.join(process.cwd(), LOOP_STATE_FILE);
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { }
}
