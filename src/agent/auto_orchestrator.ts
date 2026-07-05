import { AutoModeProvider } from '../providers/auto';
import { SkillManager } from './skillManager';
import { BrowserManager } from '../browser/manager';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// AUTO MODE ORCHESTRATOR — 5-step parallel build + verification loop
//
// Step 1: RESEARCH      → DeepSeek searches task domain (docs, APIs, approach)
// Step 2: TASK SPLIT    → Plans which provider handles which file/feature
// Step 3: PARALLEL BUILD→ DeepSeek + Gemini + Qwen all write code simultaneously
// Step 4: MERGE         → Resolve conflicts, integrate all provider outputs
// Step 5: VERIFY LOOP   → Visit localhost, screenshot (in-memory), fix, repeat
//
// Screenshots in Step 5 are NEVER written to disk — pure in-memory base64
// ─────────────────────────────────────────────────────────────────────────────

const VERIFY_MAX_ATTEMPTS = 5;
const DEV_PORTS = [3000, 5173, 8080, 4000, 3001, 4173, 8000];

interface AutoSubtask {
    id: number;
    providerId: 'deepseek' | 'gemini' | 'qwen';
    taskType: string;
    description: string;
    prompt: string;
    dependsOn?: number[];
}

interface AutoPlan {
    goal: string;
    subtasks: AutoSubtask[];
}

interface BuildResult {
    id: number;
    providerId: string;
    description: string;
    result: string;
}

export class AutoModeOrchestrator {
    private skillManager: SkillManager;

    constructor(private autoProvider: AutoModeProvider) {
        this.skillManager = new SkillManager();
    }

    // ── MAIN ENTRY ────────────────────────────────────────────────────────────
    public async execute(userTask: string): Promise<string> {
        await this.skillManager.loadAllSkills();
        const memPath = path.join((global as any).atcli_project_root || process.cwd(), 'AUTO_MEMORY.md');

        console.log('\n🚀 [AUTO MODE] Starting 5-step parallel build...');
        console.log(`📌 [AUTO MODE] Task: ${userTask.substring(0, 120)}`);

        // Init AUTO_MEMORY.md
        fs.writeFileSync(memPath, [
            '# AUTO MODE MEMORY',
            `**Task**: ${userTask}`,
            `**Started**: ${new Date().toISOString()}`,
            `**Mode**: auto — DeepSeek + Gemini + Qwen parallel`,
            '',
            '## Research',
            '> DeepSeek researching...',
            '',
            '## Provider Assignments',
            '> Pending...',
            '',
            '## Completed Subtasks',
            '',
            '## Verification Log',
        ].join('\n'), 'utf-8');

        // ── STEP 1: RESEARCH ─────────────────────────────────────────────────
        console.log('\n🔍 [AUTO MODE] Step 1: Research (DeepSeek with search)...');
        const research = await this.step1Research(userTask, memPath);
        console.log('✅ [AUTO MODE] Step 1 complete.');

        // ── STEP 2: TASK SPLIT ────────────────────────────────────────────────
        console.log('\n📋 [AUTO MODE] Step 2: Task splitting across providers...');
        const plan = await this.step2PlanSplit(userTask, research, memPath);
        console.log(`✅ [AUTO MODE] Step 2 complete — ${plan.subtasks.length} subtasks across ${new Set(plan.subtasks.map(t => t.providerId)).size} providers.`);

        // ── STEP 3: PARALLEL BUILD ────────────────────────────────────────────
        console.log('\n⚡ [AUTO MODE] Step 3: Parallel build — ALL providers working simultaneously...');
        const buildResults = await this.step3ParallelBuild(plan, memPath);
        console.log(`✅ [AUTO MODE] Step 3 complete — ${buildResults.length} subtasks built.`);

        // ── STEP 4: MERGE + INTEGRATE ─────────────────────────────────────────
        console.log('\n🔀 [AUTO MODE] Step 4: Merging all provider outputs...');
        const mergeResult = await this.step4Merge(userTask, buildResults, memPath);
        console.log('✅ [AUTO MODE] Step 4 complete.');

        // ── STEP 5: VERIFICATION LOOP ─────────────────────────────────────────
        console.log('\n🔬 [AUTO MODE] Step 5: Browser verification loop (in-memory screenshots)...');
        const verifyResult = await this.step5Verify(userTask, memPath);

        const done = buildResults.filter(r => r.result.length > 10).length;
        return [
            '# ✅ Auto Mode Complete',
            `**Task**: ${userTask}`,
            `**Build**: ${done}/${buildResults.length} subtasks completed`,
            `**Providers**: DeepSeek + Gemini + Qwen`,
            '',
            '## Build Summary',
            buildResults.map(r => `- [${r.providerId.toUpperCase()}] ${r.description.substring(0, 80)}`).join('\n'),
            '',
            '## Verification',
            verifyResult,
        ].join('\n');
    }

    // ── STEP 1: DeepSeek Research ─────────────────────────────────────────────
    private async step1Research(userTask: string, memPath: string): Promise<string> {
        const deepseek = await this.autoProvider.getPool().getProvider('deepseek');

        const prompt = [
            `You are a senior research engineer. For this task, provide:`,
            `1. Best technologies/frameworks/libraries to use`,
            `2. Key APIs, URLs, file structure, patterns`,
            `3. Potential pitfalls and how to avoid them`,
            `4. Recommended architecture`,
            ``,
            `Task: "${userTask}"`,
            ``,
            `Be concise and actionable. Use your search capability if needed. Output as structured markdown.`,
        ].join('\n');

        const result = await deepseek.sendMessage(prompt);
        const research = result.text || 'No research results';

        // Update AUTO_MEMORY.md research section
        const mem = fs.readFileSync(memPath, 'utf-8');
        fs.writeFileSync(memPath, mem.replace('> DeepSeek researching...', research.substring(0, 2000)), 'utf-8');

        return research;
    }

    // ── STEP 2: Plan Split ────────────────────────────────────────────────────
    private async step2PlanSplit(userTask: string, research: string, memPath: string): Promise<AutoPlan> {
        const deepseek = await this.autoProvider.getPool().getProvider('deepseek');

        const prompt = [
            `You are a parallel task planner. Split this task into subtasks for 3 AI providers working simultaneously.`,
            ``,
            `Provider capabilities:`,
            `- "deepseek" → backend logic, APIs, TypeScript/JavaScript, data processing, React components`,
            `- "gemini"   → CSS styling, HTML layout, visual design, UI polish`,
            `- "qwen"     → package.json, vite.config, README, utility files, tests`,
            ``,
            `Research findings: ${research.substring(0, 800)}`,
            ``,
            `Task: "${userTask}"`,
            ``,
            `Output ONLY valid JSON, no markdown fences, no explanation:`,
            `{"goal":"brief goal","subtasks":[{"id":1,"providerId":"deepseek","taskType":"code","description":"...","prompt":"Full detailed self-contained prompt with all context needed","dependsOn":[]},{"id":2,"providerId":"gemini","taskType":"design","description":"...","prompt":"...","dependsOn":[]},{"id":3,"providerId":"qwen","taskType":"config","description":"...","prompt":"...","dependsOn":[]}]}`,
        ].join('\n');

        const result = await deepseek.sendMessage(prompt);

        try {
            const jsonMatch = result.text.match(/\{[\s\S]*"subtasks"[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No valid JSON in response');
            const plan = JSON.parse(jsonMatch[0]) as AutoPlan;
            if (!plan.subtasks || !Array.isArray(plan.subtasks)) throw new Error('No subtasks array');

            // Save assignments to AUTO_MEMORY.md
            const assignments = plan.subtasks.map(t =>
                `- [${t.providerId.toUpperCase()}] → ${t.description.substring(0, 80)}`
            ).join('\n');
            const mem = fs.readFileSync(memPath, 'utf-8');
            fs.writeFileSync(memPath, mem.replace('> Pending...', assignments), 'utf-8');

            return plan;
        } catch (e) {
            console.log('[AUTO MODE] Plan JSON parse failed — using fallback single-provider plan');
            return {
                goal: userTask,
                subtasks: [{
                    id: 1,
                    providerId: 'deepseek',
                    taskType: 'code',
                    description: 'Complete full task',
                    prompt: `Research:\n${research.substring(0, 500)}\n\nTask: ${userTask}\n\nWrite all files needed. Be thorough.`,
                }]
            };
        }
    }

    // ── STEP 3: Parallel Build ────────────────────────────────────────────────
    private async step3ParallelBuild(plan: AutoPlan, memPath: string): Promise<BuildResult[]> {
        const pool = this.autoProvider.getPool();
        const completedIds = new Set<number>();
        let remaining = [...plan.subtasks];
        const allResults: BuildResult[] = [];
        let safetyCounter = 0;

        while (remaining.length > 0 && safetyCounter < 20) {
            safetyCounter++;

            // Find all tasks whose dependencies are done
            const ready = remaining.filter(t =>
                !t.dependsOn || t.dependsOn.length === 0 ||
                t.dependsOn.every(dep => completedIds.has(dep))
            );

            if (ready.length === 0) {
                console.log('[AUTO MODE] Dependency deadlock — running remaining as independent');
                remaining.forEach(t => t.dependsOn = []);
                continue;
            }

            const providerNames = [...new Set(ready.map(t => t.providerId.toUpperCase()))];
            console.log(`\n⚡ [AUTO MODE] Batch: ${ready.length} tasks in PARALLEL [${providerNames.join(' + ')}]`);

            const batchResults = await Promise.all(ready.map(async (subtask): Promise<BuildResult> => {
                console.log(`  → [${subtask.providerId.toUpperCase()}] ${subtask.description.substring(0, 60)}...`);

                const provider = await pool.getProvider(subtask.providerId);
                const response = await provider.sendMessage(subtask.prompt);
                const result = response.text || response.error || 'No output';

                // Each provider appends their completion to shared AUTO_MEMORY.md
                try {
                    const mem = fs.readFileSync(memPath, 'utf-8');
                    const completionLine = `\n- [✅ ${subtask.providerId.toUpperCase()}] ${subtask.description.substring(0, 70)}`;
                    fs.writeFileSync(memPath, mem.replace('## Completed Subtasks', `## Completed Subtasks${completionLine}`), 'utf-8');
                } catch { /* non-fatal */ }

                console.log(`  ✅ [${subtask.providerId.toUpperCase()}] Done.`);
                return { id: subtask.id, providerId: subtask.providerId, description: subtask.description, result };
            }));

            batchResults.forEach(r => {
                completedIds.add(r.id);
                allResults.push(r);
            });
            remaining = remaining.filter(t => !ready.some(r => r.id === t.id));
        }

        return allResults;
    }

    // ── STEP 4: Merge + Integrate ─────────────────────────────────────────────
    private async step4Merge(userTask: string, buildResults: BuildResult[], memPath: string): Promise<string> {
        const deepseek = await this.autoProvider.getPool().getProvider('deepseek');

        const summaries = buildResults.map(r =>
            `### [${r.providerId.toUpperCase()}] ${r.description}\n${r.result.substring(0, 1500)}`
        ).join('\n\n---\n\n');

        const prompt = [
            `You are an integration engineer. Multiple AI providers wrote different parts of this project in parallel.`,
            `Review all outputs, then write any missing integration files (imports, main entry, config).`,
            `Ensure: no import conflicts, all files reference each other correctly, project runs with npm run dev.`,
            ``,
            `Original task: "${userTask}"`,
            ``,
            `Provider outputs:`,
            summaries.substring(0, 6000),
            ``,
            `Write the final integration using write_file tool calls. Fix any issues you see.`,
        ].join('\n');

        const result = await deepseek.sendMessage(prompt);
        return result.text || 'Integration complete';
    }

    // ── STEP 5: Verification Loop ─────────────────────────────────────────────
    // Screenshots are ONLY in-memory base64 — never written to disk
    private async step5Verify(userTask: string, memPath: string): Promise<string> {
        const pool = this.autoProvider.getPool();
        const gemini = await pool.getProvider('gemini');
        const deepseek = await pool.getProvider('deepseek');
        const verifyLog: string[] = [];

        for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
            console.log(`\n🔬 [AUTO MODE] Verification attempt ${attempt}/${VERIFY_MAX_ATTEMPTS}...`);

            try {
                const manager = BrowserManager.getInstance();
                await manager.initialize();

                if (!manager.context) {
                    verifyLog.push(`Attempt ${attempt}: Browser context not available`);
                    break;
                }

                const verifyPage = await manager.context.newPage();

                try {
                    // Try all common dev server ports
                    let serverPort: number | null = null;
                    for (const port of DEV_PORTS) {
                        try {
                            await verifyPage.goto(`http://localhost:${port}`, {
                                waitUntil: 'domcontentloaded',
                                timeout: 4000
                            });
                            serverPort = port;
                            break;
                        } catch { continue; }
                    }

                    if (!serverPort) {
                        verifyLog.push(`Attempt ${attempt}: No dev server found on ports ${DEV_PORTS.join(', ')}. Start your dev server first.`);
                        await verifyPage.close();
                        break;
                    }

                    console.log(`  🌐 App loaded at localhost:${serverPort}`);

                    // Wait for app to fully render
                    await verifyPage.waitForTimeout(2500);

                    // ── IN-MEMORY SCREENSHOT — never written to disk ──────────
                    const screenshotBuffer = await verifyPage.screenshot({ fullPage: true });
                    const base64 = screenshotBuffer.toString('base64');
                    // original Buffer is now eligible for GC — only base64 string kept momentarily
                    await verifyPage.close(); // close verify tab — keeps browser clean

                    console.log(`  📸 Screenshot captured in-memory (${Math.round(base64.length / 1024)}kb) — never saved to disk`);

                    // Send to Gemini (vision-strong) for analysis
                    // The base64 string is passed inline in the message, discarded after response
                    const verifyPrompt = [
                        `You are a strict QA engineer. Analyze this screenshot of a running web app.`,
                        `Compare it PRECISELY against the original requirements.`,
                        ``,
                        `Original requirement: "${userTask}"`,
                        ``,
                        `Screenshot (base64 PNG embedded): data:image/png;base64,${base64}`,
                        ``,
                        `Answer these questions:`,
                        `1. VERIFIED: YES or NO — does the app match the requirement?`,
                        `2. Working features (be specific)`,
                        `3. Missing or broken features (be specific with element names/values)`,
                        `4. If issues exist, what EXACT code change fixes them?`,
                        ``,
                        `Start your response with "VERIFIED: YES" or "VERIFIED: NO"`,
                    ].join('\n');

                    const verifyResponse = await gemini.sendMessage(verifyPrompt);
                    const verifyText = verifyResponse.text || 'No verification response';

                    const isVerified = verifyText.toUpperCase().includes('VERIFIED: YES');

                    const logEntry = `Attempt ${attempt}: ${isVerified ? '✅' : '❌'} ${verifyText.substring(0, 200)}`;
                    verifyLog.push(logEntry);
                    console.log(`  ${isVerified ? '✅' : '❌'} Gemini says: ${verifyText.substring(0, 100)}`);

                    // Update AUTO_MEMORY.md
                    try {
                        const mem = fs.readFileSync(memPath, 'utf-8');
                        fs.writeFileSync(memPath,
                            mem.replace('## Verification Log',
                                `## Verification Log\n- ${logEntry.substring(0, 150)}`),
                            'utf-8'
                        );
                    } catch { /* non-fatal */ }

                    if (isVerified) {
                        console.log(`\n✅ [AUTO MODE] VERIFIED on attempt ${attempt}!`);
                        return `✅ VERIFIED on attempt ${attempt}/${VERIFY_MAX_ATTEMPTS}\n\n${verifyLog.join('\n')}`;
                    }

                    // Issues found — DeepSeek fixes them before next attempt
                    if (attempt < VERIFY_MAX_ATTEMPTS) {
                        console.log(`  🔧 Issues found. DeepSeek fixing...`);
                        const fixPrompt = [
                            `QA verification failed. These issues were found:`,
                            verifyText.substring(0, 2000),
                            ``,
                            `Original requirement: "${userTask}"`,
                            ``,
                            `Fix ALL issues. Write corrected files using write_file tool calls.`,
                            `After fixing, the app must pass: "${userTask}"`,
                        ].join('\n');

                        await deepseek.sendMessage(fixPrompt);
                        console.log(`  ✅ Fixes applied. Waiting for dev server to reload...`);
                        await new Promise(r => setTimeout(r, 3000)); // wait for HMR reload
                    }

                } catch (pageErr: any) {
                    await verifyPage.close().catch(() => {});
                    verifyLog.push(`Attempt ${attempt}: Page error — ${pageErr.message}`);
                    console.log(`  ❌ Attempt ${attempt} page error: ${pageErr.message}`);
                }

            } catch (browserErr: any) {
                verifyLog.push(`Attempt ${attempt}: Browser error — ${browserErr.message}`);
                console.log(`  ❌ Attempt ${attempt} browser error: ${browserErr.message}`);
            }
        }

        return [
            `⚠️ Verification ran ${verifyLog.length} attempts. Manual review may be needed.`,
            '',
            verifyLog.join('\n'),
        ].join('\n');
    }
}
