import { AgentSkill } from './skills/base';
import * as fs from 'fs/promises';
import * as path from 'path';

export class SkillManager {
    private skills: Map<string, AgentSkill> = new Map();

    public async loadAllSkills() {
        // 1. Load Built-in Skills
        const builtInDir = path.join(__dirname, 'skills');
        await this.loadSkillsFromDirectory(builtInDir);

        // 2. Load Custom Workspace Skills (User can drop .js files in .atcli-skills/)
        const customDir = path.resolve(process.cwd(), '.atcli-skills');
        try { await this.loadSkillsFromDirectory(customDir); } catch (e) {}

        // 3. Load Global Skills from skills.sh (e.g., ~/.atcli/skills or ~/.agents/skills)
        const homeDir = require('os').homedir();
        const globalAtcliDir = path.join(homeDir, '.atcli', 'skills');
        const globalAgentsDir = path.join(process.cwd(), '.agents', 'skills');
        
        try { await this.loadSkillsFromDirectory(globalAtcliDir); } catch (e) {}
        try { await this.loadSkillsFromDirectory(globalAgentsDir); } catch (e) {}
    }

    private async loadSkillsFromDirectory(dirPath: string) {
        try {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                if ((file.endsWith('.js') || file.endsWith('.ts')) && !file.includes('base.')) {
                    try {
                        const module = await import(path.join(dirPath, file));
                        for (const key in module) {
                            const obj = module[key];
                            if (obj && obj.name && typeof obj.execute === 'function') {
                                this.registerSkill(obj);
                            }
                        }
                    } catch (err: any) {
                        console.log(`⚠️ Failed to load dynamic skill from ${file}: ${err.message}`);
                    }
                }
            }
        } catch (e) {
            // Directory read error
        }
    }

    public registerSkill(skill: AgentSkill) {
        this.skills.set(skill.name, skill);
    }

    public getSkill(name: string): AgentSkill | undefined {
        return this.skills.get(name);
    }

    public async executeSkill(name: string, args: any): Promise<string> {
        const skill = this.skills.get(name);
        if (!skill) {
            return `Error: Unknown tool action '${name}'`;
        }
        try {
            return await skill.execute(args);
        } catch (error: any) {
            return `Error executing skill '${name}': ${error.message}`;
        }
    }

    public getSkillsPromptSection(): string {
        let section = "Available Tools:\n\n";
        let index = 1;
        for (const skill of this.skills.values()) {
            section += `${index}. \`${skill.name}\`\n`;
            section += `${skill.description}\n`;
            section += `${skill.example}\n\n`;
            index++;
        }
        return section.trim();
    }
}
