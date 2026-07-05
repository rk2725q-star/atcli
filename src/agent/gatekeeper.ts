import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// GATEKEEPER — ATCLI Security Wall
// Every sub-agent task passes through here before execution.
// Blocks dangerous commands, detects secrets, validates semantic scope.
// ─────────────────────────────────────────────────────────────────────────────

export interface GatekeeperResult {
    allowed: boolean;
    reason?: string;
    masked?: any; // sanitized toolCall if secrets were found
}

const DESTRUCTIVE_PATTERNS = [
    /rm\s+-rf\s+[/\\]/i,
    /del\s+\/[fqs]+\s+[/\\]/i,
    /format\s+[a-z]:/i,
    /mkfs\./i,
    /dd\s+if=/i,
    /shutdown\s+-[rsh]/i,
    /taskkill.*\/f.*atcli/i,
    /reg\s+delete\s+HKLM/i,
    /bcdedit/i,
    /diskpart/i,
    /Remove-Item.*-Recurse.*Force.*[A-Z]:\\/i,
];

const SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9_\-]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /ghp_[a-zA-Z0-9]{36}/,
    /xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/,
    /AIza[0-9A-Za-z\-_]{35}/,
    /ya29\.[0-9A-Za-z\-_]+/,
];

const PROTECTED_SYSTEM_PATHS = [
    'C:\\Windows', 'C:\\Program Files', 'C:\\System32',
    '/etc', '/usr/bin', '/bin', '/sbin',
];

export class Gatekeeper {
    private logPath: string;
    private projectRoot: string;

    constructor(projectRoot?: string) {
        this.projectRoot = projectRoot || (global as any).atcli_project_root || process.cwd();
        this.logPath = path.join(this.projectRoot, 'GATEKEEPER_LOG.md');
    }

    /** Main validation — call before ANY sub-agent executes a tool call */
    public validate(toolCall: any, agentName: string): GatekeeperResult {
        const action = toolCall.action || '';

        // 1. Destructive command check
        if (['run_command', 'run_background_command', 'sandbox_command'].includes(action)) {
            const cmd = toolCall.command || toolCall.cmd || '';
            if (DESTRUCTIVE_PATTERNS.some(p => p.test(cmd))) {
                this.log(`🚨 BLOCKED [${agentName}] destructive command: ${cmd.substring(0, 100)}`);
                return { allowed: false, reason: `BLOCKED: Destructive command — "${cmd.substring(0, 80)}"` };
            }
        }

        // 1.5 Process Kill Safety Check
        if (action === 'process_kill') {
            const targetName = (toolCall.name || '').toLowerCase();
            const forbidden = ['system', 'svchost', 'lsass', 'csrss', 'smss', 'wininit', 'services', 'explorer'];
            
            if (targetName === 'node' || targetName === 'node.exe') {
                this.log(`🚨 BLOCKED [${agentName}] attempt to kill ATCLI (node)`);
                return { allowed: false, reason: `BLOCKED: Cannot kill 'node' by name as it will terminate the ATCLI agent itself. Use 'process_list' to find the exact PID of your target server, and kill it using {"action": "process_kill", "pid": 1234}` };
            }
            
            if (targetName && forbidden.some(f => targetName.includes(f))) {
                this.log(`🚨 BLOCKED [${agentName}] attempt to kill system process: ${targetName}`);
                return { allowed: false, reason: `BLOCKED: Cannot kill critical system process "${targetName}"` };
            }
        }


        // 2. Protected system path write check
        if (['write_file', 'create_file', 'replace'].includes(action)) {
            const fp = toolCall.path || toolCall.file || '';
            const norm = fp.replace(/\//g, '\\').toLowerCase();
            if (PROTECTED_SYSTEM_PATHS.some(p => norm.startsWith(p.toLowerCase()))) {
                this.log(`🚨 BLOCKED [${agentName}] system path write: ${fp}`);
                return { allowed: false, reason: `BLOCKED: Write to protected system path: ${fp}` };
            }
        }

        // 3. Secret detection — mask but allow
        const allText = JSON.stringify(toolCall);
        const hasSecret = SECRET_PATTERNS.some(p => p.test(allText));
        if (hasSecret) {
            const masked = this.maskSecrets(toolCall);
            this.log(`⚠️ MASKED [${agentName}] secret detected in ${action}`);
            return { allowed: true, reason: 'Secret masked before cloud AI', masked };
        }

        // 4. ATCLI self-modification block
        if (['write_file', 'replace', 'delete_file'].includes(action)) {
            const fp = toolCall.path || toolCall.file || '';
            const absPath = path.resolve(this.projectRoot, fp);
            const atcliSrc = path.resolve(__dirname, '..');
            if (absPath.startsWith(atcliSrc) && (fp.endsWith('.ts') || fp.endsWith('.js'))) {
                this.log(`🚨 BLOCKED [${agentName}] self-modification: ${fp}`);
                return { allowed: false, reason: `BLOCKED: Agents cannot modify ATCLI source files: ${fp}` };
            }
        }

        return { allowed: true };
    }

    /** Warn (not block) if task seems off-scope vs project intent */
    public warnIfOffScope(taskDescription: string, projectIntent: string): void {
        if (!projectIntent || projectIntent.length < 10) return;
        const intentWords = new Set(
            projectIntent.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 4)
        );
        const taskWords = taskDescription.toLowerCase().split(/\s+/);
        const overlap = taskWords.filter(w => intentWords.has(w)).length;
        if (overlap === 0 && taskWords.length > 8) {
            this.log(`⚠️ OFF-SCOPE WARNING: Task "${taskDescription.substring(0, 60)}" may not align with intent`);
        }
    }

    private maskSecrets(toolCall: any): any {
        let str = JSON.stringify(toolCall);
        for (const p of SECRET_PATTERNS) str = str.replace(new RegExp(p.source, 'g'), '[REDACTED]');
        try { return JSON.parse(str); } catch { return toolCall; }
    }

    private log(msg: string): void {
        const line = `- ${new Date().toISOString()} | ${msg}\n`;
        try {
            if (!fs.existsSync(this.logPath)) fs.writeFileSync(this.logPath, '# GATEKEEPER LOG\n\n', 'utf-8');
            fs.appendFileSync(this.logPath, line, 'utf-8');
        } catch { /* non-critical */ }
        console.log(`\n🔒 [GATEKEEPER] ${msg}`);
    }
}
