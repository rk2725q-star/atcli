import { AgentSkill } from './base';
import * as fs from 'fs';
import * as path from 'path';

function splitSections(content: string): Array<{ heading: string; body: string }> {
    const matches = [...content.matchAll(/^##\s+(.+)$/gm)];
    if (matches.length === 0) return [];

    return matches.map((match, index) => {
        const start = match.index ?? 0;
        const nextStart = index + 1 < matches.length ? (matches[index + 1].index ?? content.length) : content.length;
        return {
            heading: match[1].trim(),
            body: content.slice(start, nextStart).trim()
        };
    });
}

function scoreSection(body: string, queryTokens: string[]): number {
    const haystack = body.toLowerCase();
    return queryTokens.reduce((score, token) => score + (haystack.includes(token) ? 3 : 0), 0);
}

export const LocalModelRecallSkill: AgentSkill = {
    name: 'local_model_recall',
    description: 'Searches ATCLI_MEMORY.md and returns the most relevant project-memory sections for smaller local models. Use this at task start, when context feels weak, or before making architectural decisions.',
    example: `<tool_call>\n{"action": "local_model_recall", "query": "current auth flow and next steps"}\n</tool_call>`,
    execute: async (args: any) => {
        const memoryPath = path.join(process.cwd(), 'ATCLI_MEMORY.md');
        if (!fs.existsSync(memoryPath)) {
            return 'No ATCLI_MEMORY.md found yet. Start by inspecting the workspace and then create memory checkpoints as you build.';
        }

        const content = fs.readFileSync(memoryPath, 'utf-8');
        const sections = splitSections(content);
        const query = String(args?.query || '').trim().toLowerCase();
        const queryTokens = query.split(/[^a-z0-9_.:-]+/i).filter(token => token.length >= 3);

        const ranked = sections
            .map(section => ({
                ...section,
                score: queryTokens.length === 0
                    ? (/Project Summary|Next Steps|Architecture Notes|Completed Features/i.test(section.heading) ? 5 : 1)
                    : scoreSection(section.heading + '\n' + section.body, queryTokens)
            }))
            .filter(section => section.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 4);

        const chosen = ranked.length > 0 ? ranked : sections.filter(section =>
            /Project|Project Summary|Completed Features|Next Steps|Architecture Notes/i.test(section.heading)
        ).slice(0, 4);

        const response = chosen
            .map(section => {
                const trimmedBody = section.body.length > 2200
                    ? `${section.body.slice(0, 2200)}\n...[truncated, read ATCLI_MEMORY.md for more]`
                    : section.body;
                return `## ${section.heading}\n${trimmedBody}`;
            })
            .join('\n\n');

        return query
            ? `Relevant ATCLI memory for "${query}":\n\n${response}\n\nIf this is still not enough, use grep_search or read_file on ATCLI_MEMORY.md for the full detail.`
            : `Priority ATCLI memory snapshot:\n\n${response}\n\nIf you need deeper detail, use grep_search or read_file on ATCLI_MEMORY.md.`;
    }
};

export const LocalModelBoostSkill: AgentSkill = {
    name: 'local_model_boost',
    description: 'Builds a compact execution checklist for weaker local models so they stay systematic: what to read first, when to research, how to edit, and how to validate before finalizing.',
    example: `<tool_call>\n{"action": "local_model_boost", "task": "add billing dashboard with stripe docs lookup"}\n</tool_call>`,
    execute: async (args: any) => {
        const task = String(args?.task || 'current task').trim();
        const isResearchHeavy = /(docs|api|unknown|research|search|stripe|integration|oauth|auth|deployment|cloud|sdk)/i.test(task);
        const isLargeChange = /(build|feature|dashboard|refactor|architecture|system|page|workflow|product)/i.test(task);

        const checklist = [
            `Task: ${task}`,
            '1. Recall context first: call local_model_recall with the current task or feature name.',
            '2. Inspect the workspace truthfully: use list_dir, grep_search, and read_file before editing.',
            isResearchHeavy
                ? '3. Research before guessing: use find_external_skills, search_skills_marketplace, search_internet, or browser_goto + browser_get_annotated_state.'
                : '3. If anything is unclear, research before guessing instead of inventing details.',
            isLargeChange
                ? '4. Keep a short explicit plan in ATCLI_MEMORY.md before major edits.'
                : '4. Keep the edit scope small and local.',
            '5. Prefer replace over write_file unless you are creating a new file or replacing a broken scaffold.',
            '6. After a logical group of edits, run aecl_check. Before finalization, run workspace_analyze too.',
            '7. Update ATCLI_MEMORY.md with what changed, what is complete, and what remains next.'
        ];

        return checklist.join('\n');
    }
};
