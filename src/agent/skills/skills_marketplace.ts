import { AgentSkill } from './base';

// ─────────────────────────────────────────────────────────────────────────────
// SKILLS MARKETPLACE SKILL
// Searches skills.sh, GitHub, and the internet for matching SKILL.md skills.
// Auto-installs the best match if requested.
// ─────────────────────────────────────────────────────────────────────────────
export const SkillsMarketplaceSkill: AgentSkill = {
    name: 'search_skills_marketplace',
    description: `Searches skills.sh marketplace and GitHub for ATCLI-compatible SKILL.md skills matching a query.
Use this when:
- You need a capability not covered by existing skills
- User says "find me a skill for X" or "install a skill that can Y"
- Hermes detects a new task type and wants to auto-install the best skill
Arguments:
  query (string): what skill capability to search for
  install (boolean, optional): if true, auto-install the top result
  category (string, optional): filter by category (coding, browser, design, security, deploy, data)`,
    example: `<tool_call>\n{"action": "search_skills_marketplace", "query": "deploy nextjs vercel", "install": false}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.query) return 'Error: query is required';
        const query = args.query.toLowerCase();
        const { exec } = await import('child_process');
        const path = await import('path');
        const fs = await import('fs');
        const https = await import('https');

        // ── 1. Check local .atcli-skills/ for already-installed matching skills ─
        const projectRoot = (global as any).atcli_project_root || process.cwd();
        const localDirs = [
            path.join(projectRoot, '.atcli-skills'),
            path.join(projectRoot, '.agents', 'skills'),
        ];

        const localMatches: string[] = [];
        for (const dir of localDirs) {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                    if (e.isDirectory() && e.name.toLowerCase().includes(query.split(' ')[0])) {
                        localMatches.push(`📦 LOCAL: ${e.name} (at ${path.join(dir, e.name)})`);
                    }
                }
            } catch { /* dir doesn't exist */ }
        }

        // ── 2. Search skills.sh via npx skills find ───────────────────────────
        const skillsShResults = await new Promise<string>((resolve) => {
            exec(`npx skills find "${query}" --json 2>&1`, { timeout: 10000 }, (err, stdout) => {
                if (err || !stdout.trim()) {
                    resolve('');
                } else {
                    resolve(stdout.trim().substring(0, 2000));
                }
            });
        });

        // ── 3. Search GitHub for SKILL.md matching repos ──────────────────────
        const githubQuery = encodeURIComponent(`${query} SKILL.md agent skills filename:SKILL.md`);
        const githubResults = await new Promise<string>((resolve) => {
            const options = {
                hostname: 'api.github.com',
                path: `/search/repositories?q=${githubQuery}&per_page=5&sort=stars`,
                headers: { 'User-Agent': 'ATCLI-SkillsAgent/1.0' },
            };
            let data = '';
            const req = https.get(options, (res) => {
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        const items = (parsed.items || []).slice(0, 5).map((item: any) =>
                            `⭐ ${item.stargazers_count} | ${item.full_name} — ${item.description || 'No description'}\n   Install: npx skills add ${item.full_name}`
                        );
                        resolve(items.join('\n') || 'No GitHub results.');
                    } catch {
                        resolve('GitHub search unavailable.');
                    }
                });
            });
            req.on('error', () => resolve('GitHub search unavailable (offline).'));
            req.setTimeout(8000, () => { req.destroy(); resolve('GitHub search timeout.'); });
        });

        // ── 4. Auto-install if requested ──────────────────────────────────────
        let installResult = '';
        if (args.install && skillsShResults) {
            // Try to extract first install command from skills.sh results
            const installMatch = skillsShResults.match(/npx skills add ([^\s"]+)/);
            if (installMatch) {
                installResult = await new Promise<string>((resolve) => {
                    exec(`npx skills add ${installMatch[1]}`, { cwd: projectRoot, timeout: 30000 }, (err, stdout, stderr) => {
                        if (err) resolve(`Install failed: ${stderr || err.message}`);
                        else resolve(`✅ Installed: ${installMatch[1]}\n${stdout}`);
                    });
                });
            }
        }

        // ── 5. Format and return ──────────────────────────────────────────────
        return [
            `🔍 Skills Marketplace Search: "${args.query}"`,
            ``,
            localMatches.length > 0 ? `## Already Installed:\n${localMatches.join('\n')}` : '',
            skillsShResults ? `## skills.sh Results:\n${skillsShResults}` : '## skills.sh: No results (offline or not installed)',
            `## GitHub Repositories:\n${githubResults}`,
            installResult ? `## Auto-Install Result:\n${installResult}` : '',
            ``,
            `💡 To install: npx skills add <owner/repo>`,
            `💡 To install local zip: use install_skill skill`,
        ].filter(Boolean).join('\n');
    },
};
