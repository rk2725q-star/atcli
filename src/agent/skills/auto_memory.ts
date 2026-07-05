import { AgentSkill } from './base';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// AUTO MEMORY SKILLS — shared memory for all providers in Auto Mode
// All providers (DeepSeek, Gemini, Qwen) read/write to AUTO_MEMORY.md
// Atomic writes via temp-file + rename — prevents file corruption if two
// providers write simultaneously
// ─────────────────────────────────────────────────────────────────────────────

function getAutoMemoryPath(): string {
    const root = (global as any).atcli_project_root || process.cwd();
    return path.join(root, 'AUTO_MEMORY.md');
}

function atomicWrite(filePath: string, content: string): void {
    const tmp = filePath + '.tmp.' + process.pid + '.' + Date.now();
    fs.writeFileSync(tmp, content, 'utf-8');
    fs.renameSync(tmp, filePath);
}

// ── Skills ────────────────────────────────────────────────────────────────────

export const AutoMemoryReadSkill: AgentSkill = {
    name: 'auto_memory_read',
    description: 'Read the shared AUTO_MEMORY.md — contains research findings, provider assignments, and build progress shared across ALL parallel AI providers.',
    example: `<tool_call>\n{"action": "auto_memory_read"}\n</tool_call>`,
    execute: async () => {
        const p = getAutoMemoryPath();
        if (!fs.existsSync(p)) {
            return 'AUTO_MEMORY.md does not exist yet. Use auto_memory_write to initialize it.';
        }
        return fs.readFileSync(p, 'utf-8');
    }
};

export const AutoMemoryWriteSkill: AgentSkill = {
    name: 'auto_memory_write',
    description: 'Initialize or fully replace AUTO_MEMORY.md.',
    example: `<tool_call>\n{"action": "auto_memory_write", "content": "# AUTO MODE MEMORY\\n**Task**: Build weather app..."}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.content) return 'Error: content is required';
        const p = getAutoMemoryPath();
        atomicWrite(p, args.content);
        return `AUTO_MEMORY.md initialized (${args.content.length} chars).`;
    }
};

export const AutoMemoryUpdateSectionSkill: AgentSkill = {
    name: 'auto_memory_update_section',
    description: 'Append content to a specific section in AUTO_MEMORY.md without overwriting other providers\' work. Safe for parallel writes.',
    example: `<tool_call>\n{"action": "auto_memory_update_section", "section": "## Completed Subtasks", "content": "- [✅ DeepSeek] wrote weather.ts"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.section || !args.content) return 'Error: section and content required';
        const p = getAutoMemoryPath();
        let existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '# AUTO MODE MEMORY\n';

        const sectionIdx = existing.indexOf(args.section);
        if (sectionIdx === -1) {
            // Section doesn't exist — append it at end
            existing += `\n\n${args.section}\n${args.content}`;
        } else {
            // Find end of section (next ## heading or EOF)
            const afterSection = sectionIdx + args.section.length;
            const nextSectionMatch = existing.slice(afterSection).search(/\n## /);
            const insertAt = nextSectionMatch === -1 
                ? existing.length 
                : afterSection + nextSectionMatch;
            existing = existing.slice(0, insertAt) + '\n' + args.content + existing.slice(insertAt);
        }

        atomicWrite(p, existing);
        return `Updated section "${args.section}" in AUTO_MEMORY.md.`;
    }
};
