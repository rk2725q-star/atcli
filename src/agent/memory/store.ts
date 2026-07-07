import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// ATCLI PERSISTENT MEMORY STORE
// Mirrors Hermes Agent's ~/.hermes/ persistent memory architecture.
// Stores globally at ~/.atcli/memory/ — survives across projects and sessions.
//
// Directory layout:
//   ~/.atcli/memory/
//     AGENTICA_MEMORY.md       ← main persistent facts, preferences, patterns
//     sessions/
//       2026-07-03.md          ← date-stamped session logs
//     skills-learned/          ← auto-generated SKILL.md files
//     index.json               ← keyword→session index for fast recall
// ─────────────────────────────────────────────────────────────────────────────

export const ATCLI_MEMORY_ROOT = path.join(os.homedir(), '.atcli', 'memory');
const MAIN_MEMORY_FILE = path.join(ATCLI_MEMORY_ROOT, 'AGENTICA_MEMORY.md');
const SESSIONS_DIR = path.join(ATCLI_MEMORY_ROOT, 'sessions');
const SKILLS_DIR = path.join(ATCLI_MEMORY_ROOT, 'skills-learned');
const INDEX_FILE = path.join(ATCLI_MEMORY_ROOT, 'index.json');

export interface MemoryEntry {
    date: string;
    task: string;
    outcome: string;
    keywords: string[];
    agentsUsed: string[];
    durationMs?: number;
}

export interface MemoryIndex {
    [keyword: string]: string[]; // keyword → array of session filenames
}

export class MemoryStore {
    constructor() {
        this.ensureDirs();
    }

    // ── Directory bootstrap ──────────────────────────────────────────────────
    private ensureDirs(): void {
        [ATCLI_MEMORY_ROOT, SESSIONS_DIR, SKILLS_DIR].forEach(d => {
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        });
        if (!fs.existsSync(MAIN_MEMORY_FILE)) {
            fs.writeFileSync(MAIN_MEMORY_FILE, [
                '# ATCLI Agentica Memory',
                '> Persistent memory store — global across all projects and sessions.',
                '> Format: Hermes-style markdown. Recall uses keyword index.',
                '',
                '## 🧠 Persistent Facts',
                '> User preferences, recurring patterns, and system knowledge.',
                '',
                '## 📅 Session History',
                '> Chronological log of all completed tasks.',
                '',
                '## 🎓 Learned Patterns',
                '> Tasks that were repeated — distilled into reusable patterns.',
                '',
                '## ⚙️ System Config',
                `> OS: ${process.platform} | Node: ${process.version}`,
            ].join('\n'), 'utf-8');
        }
        if (!fs.existsSync(INDEX_FILE)) {
            fs.writeFileSync(INDEX_FILE, JSON.stringify({} as MemoryIndex, null, 2), 'utf-8');
        }
    }

    // ── Write a session entry ────────────────────────────────────────────────
    public writeSession(entry: MemoryEntry): void {
        const dateStr = entry.date.substring(0, 10);
        const sessionFile = path.join(SESSIONS_DIR, `${dateStr}.md`);

        const block = [
            ``,
            `### ${new Date().toISOString().replace('T', ' ').substring(0, 19)}`,
            `**Task**: ${entry.task.substring(0, 500)}`,
            `**Outcome**: ${entry.outcome.substring(0, 1000)}`,
            `**Agents**: ${entry.agentsUsed.join(', ')}`,
            `**Keywords**: ${entry.keywords.join(', ')}`,
            entry.durationMs ? `**Duration**: ${Math.round(entry.durationMs / 1000)}s` : '',
        ].filter(Boolean).join('\n');

        if (!fs.existsSync(sessionFile)) {
            fs.writeFileSync(sessionFile, `# Session Log: ${dateStr}\n`, 'utf-8');
        }
        fs.appendFileSync(sessionFile, block + '\n', 'utf-8');

        // Update keyword index
        this.updateIndex(entry.keywords, path.basename(sessionFile));

        // Append summary to main memory
        const mainLine = `- ${dateStr} | ${entry.task.substring(0, 80)} → ${entry.outcome.substring(0, 100)}`;
        this.appendToMainSection('📅 Session History', mainLine);
    }

    // ── Intelligent recall (Hermes FTS-style) ───────────────────────────────
    public recall(taskDescription: string, maxChars = 10000): string {
        const keywords = this.extractKeywords(taskDescription);
        const index = this.loadIndex();

        // Find session files matching any keyword
        const matchedFiles = new Set<string>();
        for (const kw of keywords) {
            const files = index[kw] || [];
            files.forEach(f => matchedFiles.add(f));
        }

        if (matchedFiles.size === 0) {
            // Fallback: return last 10 lines of main memory
            try {
                const content = fs.readFileSync(MAIN_MEMORY_FILE, 'utf-8');
                const lines = content.split('\n').filter(l => l.trim());
                return lines.slice(-10).join('\n');
            } catch { return ''; }
        }

        // Load matching sessions, sorted by date (newest first)
        const sessionFiles = Array.from(matchedFiles)
            .sort()
            .reverse()
            .slice(0, 3); // Top 3 most recent matches

        const recalled: string[] = [`[MEMORY RECALL — ${keywords.join(', ')}]`];
        let totalChars = 0;

        for (const filename of sessionFiles) {
            const filePath = path.join(SESSIONS_DIR, filename);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const chunk = content.substring(0, Math.floor(maxChars / sessionFiles.length));
                recalled.push(`## From ${filename}:\n${chunk}`);
                totalChars += chunk.length;
                if (totalChars >= maxChars) break;
            } catch { /* skip */ }
        }

        return recalled.join('\n\n').substring(0, maxChars);
    }

    // ── Write a learned skill ────────────────────────────────────────────────
    public writeLearnedSkill(name: string, content: string): void {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40);
        const skillDir = path.join(SKILLS_DIR, slug);
        if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
        console.log(`\n📚 [Memory] Skill saved: ${slug}`);
    }

    // ── Append a fact to main memory ─────────────────────────────────────────
    public writeFact(fact: string): void {
        this.appendToMainSection('🧠 Persistent Facts', `- ${new Date().toISOString().substring(0, 10)} | ${fact}`);
    }

    // ── Read the full main memory file ───────────────────────────────────────
    public readMainMemory(): string {
        try { return fs.readFileSync(MAIN_MEMORY_FILE, 'utf-8'); }
        catch { return ''; }
    }

    // ── Private helpers ─────────────────────────────────────────────────────
    private extractKeywords(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 4)
            .slice(0, 20);
    }

    private loadIndex(): MemoryIndex {
        try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8')); }
        catch { return {}; }
    }

    private updateIndex(keywords: string[], sessionFile: string): void {
        const index = this.loadIndex();
        for (const kw of keywords) {
            if (!index[kw]) index[kw] = [];
            if (!index[kw].includes(sessionFile)) {
                index[kw].push(sessionFile);
                if (index[kw].length > 20) index[kw].shift(); // Keep last 20
            }
        }
        fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
    }

    private appendToMainSection(section: string, line: string): void {
        try {
            let content = fs.readFileSync(MAIN_MEMORY_FILE, 'utf-8');
            const header = `## ${section}`;
            const idx = content.indexOf(header);
            if (idx === -1) {
                content += `\n\n## ${section}\n${line}`;
            } else {
                const after = idx + header.length;
                const next = content.slice(after).match(/\n## /);
                const insertAt = next ? after + next.index! : content.length;
                content = content.slice(0, insertAt) + '\n' + line + content.slice(insertAt);
            }
            fs.writeFileSync(MAIN_MEMORY_FILE, content, 'utf-8');
        } catch { /* non-critical */ }
    }
}

// Singleton instance
export const memoryStore = new MemoryStore();
