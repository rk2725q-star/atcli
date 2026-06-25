import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(exec);

export const FindExternalSkillsSkill: AgentSkill = {
    name: 'find_external_skills',
    description: 'Searches the skills.sh registry for community-created procedural knowledge or best practices for specific frameworks (e.g., React, Vercel, Tailwind). Use this when you are asked to implement something new, before you write code.',
    example: `<tool_call>\n{"action": "find_external_skills", "query": "vercel react"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.query) return "Error: query is required";
        try {
            console.log(`\n[ATCLI] Searching skills.sh for '${args.query}'...`);
            const { stdout, stderr } = await execAsync(`npx -y skills search ${args.query}`, { cwd: process.cwd() });
            
            if (stderr && stderr.toLowerCase().includes('err!')) {
                return `Error searching skills: ${stderr}`;
            }

            if (!stdout.trim()) {
                return `No skills found for query: ${args.query}`;
            }

            return `Search Results for '${args.query}':\n\n${stdout}\n\nTo install a skill, use the install_skill tool with the full identifier (e.g., vercel-labs/agent-skills@vercel-react-best-practices).`;
        } catch (error: any) {
            return `Execution error: ${error.message}`;
        }
    }
};

export const InstallSkillSkill: AgentSkill = {
    name: 'install_skill',
    description: 'Installs a specific skill from the skills.sh registry into your .agents/skills directory. You must provide the full identifier (e.g., owner/repo@skill-name). Once installed, the knowledge will be immediately available in your prompt on the next turn.',
    example: `<tool_call>\n{"action": "install_skill", "identifier": "vercel-labs/agent-skills@vercel-react-best-practices"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.identifier) return "Error: identifier is required (e.g., owner/repo@skill-name)";
        try {
            console.log(`\n[ATCLI] Installing skill '${args.identifier}' from skills.sh...`);
            const { stdout, stderr } = await execAsync(`npx -y skills add ${args.identifier}`, { cwd: process.cwd() });
            
            if (stderr && stderr.toLowerCase().includes('err!')) {
                return `Error installing skill: ${stderr}`;
            }

            return `Successfully installed skill '${args.identifier}'.\n\nOutput:\n${stdout}\n\nThe knowledge from this skill has been added to your workspace. You may proceed with the task using this new knowledge.`;
        } catch (error: any) {
            return `Execution error: ${error.message}`;
        }
    }
};
