import { AgentSkill } from './base';

// ─────────────────────────────────────────────────────────────────────────────
// COMPRESSION SKILL — Context compression and summarization (Hermes context management)
// ─────────────────────────────────────────────────────────────────────────────
export const CompressContextSkill: AgentSkill = {
    name: 'compress_context',
    description: `Compresses long content by extracting key information and removing noise.
Hermes context management — prevents context overflow in long sessions.
Arguments:
  content (string): the long text to compress
  max_chars (number, optional): target output size (default 2000)
  mode ("summary" | "bullets" | "headlines", optional): compression style (default "bullets")`,
    example: `<tool_call>\n{"action": "compress_context", "content": "...", "max_chars": 1500, "mode": "bullets"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.content) return 'Error: content is required';
        const maxChars = args.max_chars || 2000;
        const mode = args.mode || 'bullets';
        const content: string = args.content;

        if (content.length <= maxChars) return content; // Already short enough

        // Split into lines and paragraphs
        const lines = content.split('\n').filter(l => l.trim().length > 20);
        const ratio = maxChars / content.length;
        const keepN = Math.max(5, Math.floor(lines.length * ratio));

        if (mode === 'headlines') {
            // Keep lines that look like headers or key statements
            const important = lines.filter(l =>
                l.startsWith('#') || l.startsWith('**') || l.includes('Error') ||
                l.includes('✅') || l.includes('❌') || l.includes('→') ||
                l.trim().endsWith(':')
            ).slice(0, keepN);
            return `[COMPRESSED — ${Math.round(ratio * 100)}% of original]\n${important.join('\n')}`;
        }

        if (mode === 'summary') {
            // Keep first paragraph + last paragraph + middle snippets
            const first = lines.slice(0, 3).join('\n');
            const last = lines.slice(-3).join('\n');
            const middle = lines.slice(Math.floor(lines.length * 0.4), Math.floor(lines.length * 0.6)).slice(0, 3).join('\n');
            return `[COMPRESSED SUMMARY]\n${first}\n...\n${middle}\n...\n${last}`.substring(0, maxChars);
        }

        // Default: bullets — take evenly spaced lines
        const step = Math.max(1, Math.floor(lines.length / keepN));
        const selected = lines.filter((_, i) => i % step === 0).slice(0, keepN);
        return `[COMPRESSED — ${selected.length} key lines from ${lines.length} total]\n${selected.map(l => `• ${l.trim()}`).join('\n')}`.substring(0, maxChars);
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// REFLECTION SKILL — Self-critique and improvement (Hermes self-improvement loop)
// ─────────────────────────────────────────────────────────────────────────────
export const ReflectAndImproveSkill: AgentSkill = {
    name: 'reflect_and_improve',
    description: `Analyzes an agent's output and identifies improvements.
Hermes self-improvement loop — evaluates quality and suggests corrections.
Arguments:
  output (string): the output to evaluate
  task (string): what the original task was
  criteria (string[], optional): specific evaluation criteria`,
    example: `<tool_call>\n{"action": "reflect_and_improve", "task": "Write a React component", "output": "const App = () => <div>Hello</div>"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.output || !args.task) return 'Error: output and task required';
        const output: string = args.output;
        const task: string = args.task;

        const issues: string[] = [];
        const suggestions: string[] = [];

        // Check output completeness
        if (output.length < 50) issues.push('Output is very short — likely incomplete');
        if (output.includes('TODO') || output.includes('placeholder')) issues.push('Contains TODO/placeholder — not production ready');
        if (output.includes('...') && !output.includes('example')) issues.push('May contain ellipsis placeholders');

        // Check for error signals
        if (output.toLowerCase().includes('error:')) issues.push('Output contains error messages');
        if (output.toLowerCase().includes('undefined')) issues.push('Output contains "undefined" — possible runtime issue');

        // Task-specific checks
        if (task.toLowerCase().includes('typescript') && !output.includes(':')) {
            suggestions.push('Add TypeScript type annotations');
        }
        if (task.toLowerCase().includes('test') && !output.includes('expect')) {
            suggestions.push('Add assertion/expect statements to tests');
        }
        if (task.toLowerCase().includes('api') && !output.includes('error')) {
            suggestions.push('Add error handling for API failures');
        }

        const score = Math.max(0, 100 - (issues.length * 20));
        const report = [
            `## Reflection Report`,
            `**Task**: ${task.substring(0, 100)}`,
            `**Quality Score**: ${score}/100`,
            issues.length > 0 ? `\n### Issues Found:\n${issues.map(i => `- ❌ ${i}`).join('\n')}` : '\n### ✅ No Issues Found',
            suggestions.length > 0 ? `\n### Suggestions:\n${suggestions.map(s => `- 💡 ${s}`).join('\n')}` : '',
            `\n### Verdict: ${score >= 80 ? '✅ PASS — Output looks good' : score >= 50 ? '⚠️ NEEDS IMPROVEMENT' : '❌ FAIL — Requires significant rework'}`,
        ].filter(Boolean).join('\n');

        return report;
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// SQLITE SKILL — Local SQLite database access (Hermes data persistence)
// ─────────────────────────────────────────────────────────────────────────────
export const SqliteQuerySkill: AgentSkill = {
    name: 'sqlite_query',
    description: `Executes SQLite queries on a local .db file using the sqlite3 CLI.
Hermes data persistence capability.
Arguments:
  db_path (string): path to .db file (relative to project root)
  query (string): SQL query to execute
  create_if_missing (boolean, optional): create DB if it doesn't exist`,
    example: `<tool_call>\n{"action": "sqlite_query", "db_path": "data.db", "query": "SELECT * FROM users LIMIT 10"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.db_path || !args.query) return 'Error: db_path and query required';
        const { execFile } = await import('child_process');
        const path = await import('path');
        const fs = await import('fs');
        const projectRoot = (global as any).atcli_project_root || process.cwd();
        const dbPath = path.resolve(projectRoot, args.db_path);
        
        if (!dbPath.startsWith(projectRoot + path.sep) && dbPath !== projectRoot) {
            return "Error: Security violation. Path traversal outside the workspace is strictly prohibited.";
        }

        if (!fs.existsSync(dbPath) && !args.create_if_missing) {
            return `Error: Database not found at ${dbPath}. Set create_if_missing: true to create it.`;
        }

        // Safety: block DROP and dangerous queries
        const lower = args.query.toLowerCase().trim();
        if (lower.startsWith('drop table') || lower.startsWith('drop database')) {
            return 'BLOCKED: DROP TABLE/DATABASE requires explicit user confirmation. Use run_command instead.';
        }

        return new Promise(resolve => {
            execFile('sqlite3', [dbPath, args.query], { timeout: 10000, shell: false }, (e, out, err) => {
                if (e) resolve(`SQLite Error: ${err || e.message}`);
                else resolve(out.trim() || '(no rows returned)');
            });
        });
    },
};
