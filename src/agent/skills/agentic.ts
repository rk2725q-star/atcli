import { AgentSkill } from './base';
import { exec } from 'child_process';

export const FindExternalSkillsSkill: AgentSkill = {
    name: 'find_external_skills',
    description: 'Searches the skills.sh registry for community agent skills. Use this when you do not know how to complete a specific task (like deploying to AWS, testing, or integrating a specific API).',
    example: `<tool_call>\n{"action": "find_external_skills", "query": "react best practices"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.query) return "Error: query is required";
        return new Promise((resolve) => {
            // Using npx skills find query
            exec(`npx -y skills find "${args.query}"`, { cwd: process.cwd() }, (error, stdout, stderr) => {
                if (error) {
                    resolve(`Error finding skills: ${error.message}\n${stderr}`);
                } else {
                    const output = stdout.trim();
                    if (!output) resolve("No skills found.");
                    else resolve(`Found these packages:\n${output}\n\nTo install one, use the install_external_skill action with the package name.`);
                }
            });
        });
    }
};

export const InstallExternalSkillSkill: AgentSkill = {
    name: 'install_external_skill',
    description: 'Installs a community skill from the skills.sh registry. The skill rules will be immediately added to your knowledge base in the next turn.',
    example: `<tool_call>\n{"action": "install_external_skill", "package": "vercel-labs/agent-skills@vercel-react-best-practices"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.package) return "Error: package is required";
        
        // Safety check to prevent command injection
        if (!/^[a-zA-Z0-9\-_\/@.]+$/.test(args.package)) {
            return "Error: Invalid package name format";
        }
        
        return new Promise((resolve) => {
            // We use --copy to ensure the SKILL.md is physically copied to .agents/skills/
            exec(`npx -y skills add ${args.package} --copy`, { cwd: process.cwd() }, (error, stdout, stderr) => {
                if (error) {
                    resolve(`Error installing skill: ${error.message}\n${stderr}`);
                } else {
                    resolve(`Success! The skill '${args.package}' has been downloaded. Its instructions will be added to your knowledge base starting from the next turn.\n\n${stdout.trim()}`);
                }
            });
        });
    }
};
