import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
    // File system destruction
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
    // Execution of remote scripts (supply chain attack)
    /curl.+\|.*(bash|sh|python|node)/i,
    /wget.+\|.*(bash|sh|python|node)/i,
    /Invoke-Expression.*Invoke-WebRequest/i,
    /iex.*\(New-Object.*WebClient\)/i,
    // Base64-encoded payload execution (obfuscation attack)
    /base64.*\|.*(bash|sh|eval)/i,
    /echo.*[A-Za-z0-9+\/]{40,}.*\|.*base64/i,
    /powershell.*-EncodedCommand/i,
    // Python/Node inline code execution via -c flag
    /python[0-9]?\s+-c\s+["'].*os\.system/i,
    /node\s+-e\s+["'].*require\(['"](child_process|fs)/i,
    // Network exfiltration (sending data to external servers)
    /curl.*(-d|--data).*http[s]?:\/\//i,
    /wget.*--post-data.*http[s]?:\/\//i,
    // SSH key/credential theft
    /cat.*\.ssh.*(id_rsa|authorized_keys)/i,
    // Crontab/scheduled task abuse
    /crontab\s+-[el]/i,
    /schtasks.*\/create/i,
];

// Command injection: chaining to bypass single-command checks
const COMMAND_INJECTION_PATTERNS = [
    // Only flag if dangerous commands appear AFTER the chain operator
    /[;&|`]\s*(rm\s+-rf|del\s+\/|format\s+|curl.*\|\s*bash|wget.*\|\s*sh)/i,
];

const SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9_\-]{20,}/,           // OpenAI API key
    /AKIA[0-9A-Z]{16}/,                   // AWS Access Key
    /ghp_[a-zA-Z0-9]{36}/,               // GitHub Personal Access Token
    /xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/,  // Slack Bot Token
    /AIza[0-9A-Za-z\-_]{35}/,            // Google API Key
    /ya29\.[0-9A-Za-z\-_]+/,             // Google OAuth Token
    /['"]?password['"]?\s*[:=]\s*['"][^'"]{8,}['"]/i,  // Inline password
    /['"]?secret['"]?\s*[:=]\s*['"][^'"]{8,}['"]/i,    // Inline secret
    /BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/,  // Private key material
];

// ── Dynamic system path protection (no hardcoded drive letters) ──────────────
// Windows: uses process.env.SystemDrive (C:, D:, E: — whatever the OS drive is)
// macOS/Linux: uses standard Unix paths
function buildProtectedSystemPaths(): string[] {
    const paths: string[] = [];
    if (process.platform === 'win32') {
        // SystemDrive env var is set by Windows itself — auto-detects D:, E:, etc.
        const sysDrive = (process.env.SystemDrive || 'C:').replace(/\\$/, '');
        const sysRoot  = process.env.SystemRoot || `${sysDrive}\\Windows`;
        paths.push(
            sysRoot,                               // C:\Windows or D:\Windows etc.
            `${sysDrive}\\Program Files`,
            `${sysDrive}\\Program Files (x86)`,
            `${sysDrive}\\System32`,
            `${sysDrive}\\Windows\\System32`,
        );
        // User-sensitive Windows dirs (relative — work regardless of C: or D:)
        paths.push(
            'AppData\\Roaming\\Microsoft',
            'AppData\\Local\\Microsoft',
        );
    } else {
        // macOS / Linux
        paths.push('/etc', '/usr/bin', '/bin', '/sbin', '/usr/sbin', '/usr/lib', '/lib');
    }
    // Cross-platform sensitive dirs
    paths.push('.ssh');
    return paths;
}

const PROTECTED_SYSTEM_PATHS = buildProtectedSystemPaths();

// Files that MUST NOT be modified by the AI (sensitive configs)
const PROTECTED_FILE_PATTERNS = [
    /\.env(\.local|\.production|\.staging)?$/,  // .env files — contain secrets
    /\.ssh\/(id_rsa|authorized_keys|known_hosts)$/,  // SSH keys
    /\/etc\/(passwd|shadow|sudoers)$/,              // Linux auth files
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
            // 1b. Command injection check (chained dangerous commands)
            if (COMMAND_INJECTION_PATTERNS.some(p => p.test(cmd))) {
                this.log(`🚨 BLOCKED [${agentName}] command injection attempt: ${cmd.substring(0, 100)}`);
                return { allowed: false, reason: `BLOCKED: Command injection detected — chained dangerous command in: "${cmd.substring(0, 80)}"` };
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
            // Normalize both sides: collapse C:\\\\Windows → C:\Windows, forward-slash → backslash, lowercase
            const norm = path.normalize(fp.replace(/\//g, '\\')).toLowerCase();
            const isSystemPath = PROTECTED_SYSTEM_PATHS.some(p => {
                const normProtected = path.normalize(p).toLowerCase();
                return norm.startsWith(normProtected) || norm.includes(normProtected);
            });
            if (isSystemPath) {
                this.log(`🚨 BLOCKED [${agentName}] system path write: ${fp}`);
                return { allowed: false, reason: `BLOCKED: Write to protected system path: ${fp}` };
            }

            // 2b. Sensitive file protection (.env, SSH keys, etc.)
            if (PROTECTED_FILE_PATTERNS.some(p => p.test(fp))) {
                this.log(`🚨 BLOCKED [${agentName}] sensitive file write: ${fp}`);
                return { allowed: false, reason: `BLOCKED: Cannot overwrite sensitive file: ${fp}. Use environment variable managers instead of hardcoding secrets.` };
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
        // Only applies to ABSOLUTE paths that explicitly target ATCLI's src/ or dist/.
        // Relative paths (e.g., "src/index.ts") are ALWAYS user project files — never block them.
        if (['write_file', 'create_file', 'replace', 'delete_file'].includes(action)) {
            const fp = toolCall.path || toolCall.file || '';
            // Only check absolute paths — relative paths are user project files, not ATCLI source
            if (path.isAbsolute(fp)) {
                const atcliRoot = path.resolve(__dirname, '..', '..');
                const atcliSrcDir = path.join(atcliRoot, 'src');
                const atcliDistDir = path.join(atcliRoot, 'dist');
                const normFp = fp.replace(/\\/g, '/');
                const normSrc = atcliSrcDir.replace(/\\/g, '/');
                const normDist = atcliDistDir.replace(/\\/g, '/');
                const isAtcliSrc = normFp.startsWith(normSrc) && (fp.endsWith('.ts') || fp.endsWith('.js'));
                const isAtcliDist = normFp.startsWith(normDist) && fp.endsWith('.js');
                if (isAtcliSrc || isAtcliDist) {
                    this.log(`🚨 BLOCKED [${agentName}] self-modification: ${fp}`);
                    return { allowed: false, reason: `BLOCKED: Agents cannot modify ATCLI source files: ${fp}` };
                }
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
