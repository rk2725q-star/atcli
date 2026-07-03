import { AgentProvider } from '../../providers/interface';
import { SkillManager } from '../skillManager';
import { Gatekeeper } from '../gatekeeper';
import { memoryStore } from '../memory/store';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SKILL MANAGER SINGLETON — FIX 6: load skills once, not per sub-agent
// Prevents 25x repeated disk scans when Orchestrator runs all agents
// ─────────────────────────────────────────────────────────────────────────────
let _globalSkillManager: SkillManager | null = null;
async function getGlobalSkillManager(): Promise<SkillManager> {
    if (!_globalSkillManager) {
        _globalSkillManager = new SkillManager();
        await _globalSkillManager.loadAllSkills();
        console.log('[SkillManager] Skills loaded once (singleton).');
    }
    return _globalSkillManager;
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE SUB-AGENT — All 6 gaps fixed:
// FIX 3: results[] collected throughout entire loop (not just at finish)
// FIX 6: shared SkillManager singleton (one disk scan total)
// + Semantic context injection (OpenClaw-style per-message headers)
// + Hermes FTS memory recall (cross-session intelligence)
// + 180k context safety with semantic re-injection
// + Gatekeeper security on every tool call
// ─────────────────────────────────────────────────────────────────────────────
export abstract class BaseSubAgent {
    protected gatekeeper: Gatekeeper;
    protected totalTokens = 0;
    protected maxIterations = 200;
    protected isAgenticaMode = true;
    private taskStartTime = 0;

    abstract readonly agentName: string;
    abstract buildSystemPrompt(): string;
    allowedSkills(): string[] { return []; }

    constructor(protected provider: AgentProvider) {
        this.gatekeeper = new Gatekeeper();
    }

    // ── Semantic Context Block — injected every message (OpenClaw-style) ─────
    private buildSemanticContext(task: string): string {
        const projectIntent = (global as any).ATCLI_PROJECT_INTENT || '';
        const tokenPct = Math.round((this.totalTokens / 180000) * 100);
        const pastMemory = memoryStore.recall(task, 800);

        return [
            `╔══════════════════════════════════════════════════════`,
            `║ SEMANTIC CONTEXT — ${this.agentName}`,
            `║ Role: You are ${this.agentName}. Allowed skills: ${this.allowedSkills().join(', ') || 'ALL'}`,
            projectIntent ? `║ Project Goal: ${projectIntent.substring(0, 150)}` : '',
            pastMemory ? `║ Past Memory (relevant):\n${pastMemory.split('\n').map(l => `║   ${l}`).join('\n')}` : '',
            `║ Context Used: ~${tokenPct}% of 180k limit`,
            `║ Gatekeeper: ACTIVE — destructive cmds blocked, secrets masked`,
            `╚══════════════════════════════════════════════════════`,
        ].filter(Boolean).join('\n');
    }

    /** Run a subtask. Returns aggregated results from ALL tool executions. */
    public async run(task: string): Promise<string> {
        // FIX 6: use shared singleton instead of creating new SkillManager
        const skillManager = await getGlobalSkillManager();
        this.taskStartTime = Date.now();

        console.log(`\n🤖 [${this.agentName}] Starting: ${task.substring(0, 100)}...`);

        const systemPrompt = this.buildSystemPrompt();
        const semanticCtx  = this.buildSemanticContext(task);

        let currentMessage = [systemPrompt, semanticCtx, `[SUBTASK]:\n${task}`].join('\n\n');

        // ── FIX 3: Collect ALL tool results throughout the loop ────────────────
        // Previously: results[] only got data when !toolCall (agent finished) = empty
        // Now: every tool execution pushes to executionLog, final summary always populated
        const executionLog: string[] = [];
        let finalSummary = '';

        for (let i = 1; i <= this.maxIterations; i++) {
            const response = await this.provider.sendMessage(currentMessage);

            if (response.error) {
                const errMsg = `[${this.agentName}] Provider error: ${response.error}`;
                console.log(`❌ ${errMsg}`);
                executionLog.push(errMsg);
                break;
            }

            const aiText = response.text;
            this.totalTokens += aiText.length / 4;
            console.log(`\n[${this.agentName} Iter ${i}]: ${aiText.substring(0, 200)}...`);

            // Parse tool call
            let toolCall: any;
            try { toolCall = this.parseToolCall(aiText); }
            catch (err: any) {
                currentMessage = `<tool_result>\nJSON parse error: ${err.message}. Fix your JSON.\n</tool_result>`;
                continue;
            }

            // No tool call = agent finished — capture final summary
            if (!toolCall) {
                finalSummary = aiText.trim();
                console.log(`\n✅ [${this.agentName}] Finished with summary.`);
                break;
            }

            // Skill allow-list enforcement
            const allowed = this.allowedSkills();
            if (allowed.length > 0 && !allowed.includes(toolCall.action)) {
                const msg = `[${this.agentName}] OUT-OF-SCOPE: "${toolCall.action}" not allowed. Allowed: ${allowed.join(', ')}`;
                console.log(`⚠️ ${msg}`);
                currentMessage = `<tool_result>\n${msg}\nOnly use YOUR assigned skills.\n</tool_result>`;
                continue;
            }

            // Gatekeeper security check
            const gkResult = this.gatekeeper.validate(toolCall, this.agentName);
            if (!gkResult.allowed) {
                console.log(`\n🔒 [GATEKEEPER] ${gkResult.reason}`);
                currentMessage = `<tool_result>\n${gkResult.reason}\nChoose a safer approach.\n</tool_result>`;
                continue;
            }
            const safeToolCall = gkResult.masked || toolCall;

            // Execute skill
            console.log(`\n⚙️ [${this.agentName}] Executing: ${safeToolCall.action}`);
            let result = await skillManager.executeSkill(safeToolCall.action, safeToolCall);
            if (result.length > 15000) result = result.substring(0, 15000) + '\n...[TRUNCATED]';

            // ── FIX 3: Push EVERY tool result to executionLog ─────────────────
            executionLog.push(`[Iter ${i}] ${safeToolCall.action}: ${result.substring(0, 300)}`);

            // 180k context safety — re-inject semantic context on refresh
            if (this.totalTokens > 140000) {
                console.log(`\n🔄 [${this.agentName}] Context near 180k — refreshing...`);
                const refreshCtx = this.buildSemanticContext(task);
                currentMessage = [
                    `[CONTEXT REFRESH — Iter ${i}/${this.maxIterations}]`,
                    `Agent: ${this.agentName} | Task: ${task.substring(0, 150)}`,
                    refreshCtx,
                    `<tool_result>\n${result}\n</tool_result>`,
                    `Continue. Output next <tool_call> or finish with summary.`,
                ].join('\n\n');
                this.totalTokens = 0;
            } else {
                currentMessage = `<tool_result>\n${result}\n</tool_result>\n[Continue as ${this.agentName}. Output next <tool_call> or finish with summary text.]`;
            }
        }

        const durationMs = Date.now() - this.taskStartTime;

        // ── FIX 3: Build final result from BOTH summary + execution log ────────
        // This ensures Orchestrator always gets useful content, not empty string
        const parts: string[] = [];
        if (finalSummary) parts.push(finalSummary);
        if (executionLog.length > 0) {
            parts.push(`\n[${this.agentName} Execution Log — ${executionLog.length} steps]:`);
            // Include last 5 steps (most recent actions) to keep result concise
            const recentLog = executionLog.slice(-5).join('\n');
            parts.push(recentLog);
        }

        const finalResult = parts.join('\n') || `[${this.agentName}] No result returned.`;

        // Write to persistent memory on completion
        if (finalSummary && finalSummary.length > 20) {
            const keywords = task.toLowerCase()
                .split(/\s+/).filter(w => w.length > 4).slice(0, 8);
            memoryStore.writeSession({
                date: new Date().toISOString(),
                task: `[${this.agentName}] ${task.substring(0, 100)}`,
                outcome: finalSummary.substring(0, 200),
                keywords,
                agentsUsed: [this.agentName],
                durationMs,
            });
        }

        console.log(`\n✅ [${this.agentName}] Done in ${Math.round(durationMs / 1000)}s. Log: ${executionLog.length} steps.`);
        return finalResult;
    }

    protected parseToolCall(text: string): any | null {
        const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
        if (!match) return null;
        let jsonStr = match[1].trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
        else if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
        jsonStr = jsonStr.trim()
            .replace(/\u201c/g, '\\"').replace(/\u201d/g, '\\"')
            .replace(/\u2018/g, "'").replace(/\u2019/g, "'");
        jsonStr = jsonStr.replace(/\\([^"\/bfnrtu])/g, '\\\\$1');
        return JSON.parse(jsonStr);
    }
}
