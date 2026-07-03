import { AgentProvider } from '../../providers/interface';
import { SkillManager } from '../skillManager';
import { Gatekeeper } from '../gatekeeper';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// BASE SUB-AGENT
// All 15 specialist agents extend this class.
// Provides: isolated skill loading, Gatekeeper integration, tool call parsing,
// 180k context safety, and result reporting back to Orchestrator.
// ─────────────────────────────────────────────────────────────────────────────
export abstract class BaseSubAgent {
    protected skillManager: SkillManager;
    protected gatekeeper: Gatekeeper;
    protected totalTokens = 0;
    protected maxIterations = 200;
    protected isAgenticaMode = true;

    /** Human-readable name for this sub-agent (used in logs and Gatekeeper) */
    abstract readonly agentName: string;

    /** The focused system prompt for this specialist agent */
    abstract buildSystemPrompt(): string;

    /** Which skill names this agent is allowed to use (empty = all) */
    allowedSkills(): string[] { return []; }

    constructor(protected provider: AgentProvider) {
        this.skillManager = new SkillManager();
        this.gatekeeper = new Gatekeeper();
    }

    /** Run a subtask. Returns string result for Orchestrator to aggregate. */
    public async run(task: string): Promise<string> {
        await this.skillManager.loadAllSkills();

        console.log(`\n🤖 [${this.agentName}] Starting subtask: ${task.substring(0, 100)}...`);

        const systemPrompt = this.buildSystemPrompt();
        const projectIntent = (global as any).ATCLI_PROJECT_INTENT || '';
        const initialMessage = `${systemPrompt}\n\n[SUBTASK FROM ORCHESTRATOR]:\n${task}\n\n[PROJECT INTENT]: ${projectIntent}`;

        let currentMessage = initialMessage;
        const results: string[] = [];

        for (let i = 1; i <= this.maxIterations; i++) {
            const response = await this.provider.sendMessage(currentMessage);

            if (response.error) {
                const errMsg = `[${this.agentName}] Provider error: ${response.error}`;
                console.log(`❌ ${errMsg}`);
                results.push(errMsg);
                break;
            }

            const aiText = response.text;
            this.totalTokens += aiText.length / 4; // approx token count
            console.log(`\n[${this.agentName} Iter ${i}]: ${aiText.substring(0, 200)}...`);

            // Parse tool call
            let toolCall: any;
            try {
                toolCall = this.parseToolCall(aiText);
            } catch (err: any) {
                currentMessage = `<tool_result>\nJSON parse error: ${err.message}. Fix your JSON.\n</tool_result>`;
                continue;
            }

            // No tool call = task complete
            if (!toolCall) {
                results.push(`[${this.agentName}] Completed: ${aiText.substring(0, 500)}`);
                break;
            }

            // Skill allow-list enforcement
            const allowed = this.allowedSkills();
            if (allowed.length > 0 && !allowed.includes(toolCall.action)) {
                const msg = `[${this.agentName}] Tried to use out-of-scope skill "${toolCall.action}". Allowed: ${allowed.join(', ')}`;
                console.log(`⚠️ ${msg}`);
                currentMessage = `<tool_result>\n${msg}\nYou are a specialist. Only use your assigned skills.\n</tool_result>`;
                continue;
            }

            // Gatekeeper security check
            const gatekeeperResult = this.gatekeeper.validate(toolCall, this.agentName);
            if (!gatekeeperResult.allowed) {
                const msg = gatekeeperResult.reason || 'Blocked by Gatekeeper';
                console.log(`\n🔒 [GATEKEEPER] ${msg}`);
                currentMessage = `<tool_result>\n${msg}\nChoose a safer approach.\n</tool_result>`;
                continue;
            }

            // Use masked version if secrets were found
            const safeToolCall = gatekeeperResult.masked || toolCall;

            // Execute
            console.log(`\n⚙️ [${this.agentName}] Executing: ${safeToolCall.action}`);
            let result = await this.skillManager.executeSkill(safeToolCall.action, safeToolCall);

            if (result.length > 15000) result = result.substring(0, 15000) + '\n...[TRUNCATED]';

            currentMessage = `<tool_result>\n${result}\n</tool_result>\n[REMINDER: You are ${this.agentName}. Continue your subtask. Output next <tool_call> or finish with text.]`;

            // 180k context safety
            if (this.totalTokens > 140000) {
                console.log(`\n🔄 [${this.agentName}] Context near limit — reinjecting system prompt...`);
                currentMessage = `${systemPrompt}\n\n[CONTEXT REFRESH]\n\n${currentMessage}`;
                this.totalTokens = 0;
            }
        }

        const finalResult = results.join('\n');
        console.log(`\n✅ [${this.agentName}] Subtask complete.`);
        return finalResult || `[${this.agentName}] No result returned.`;
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
