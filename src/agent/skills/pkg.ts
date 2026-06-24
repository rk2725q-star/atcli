import { AgentSkill } from './base';
import { exec } from 'child_process';

export const NpmSearchSkill: AgentSkill = {
    name: 'npm_search',
    description: 'Searches the NPM registry for a package. Returns the package name, description, and latest version.',
    example: `<tool_call>\n{"action": "npm_search", "query": "express"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.query) return "Error: query is required";
        try {
            const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(args.query)}&size=5`;
            const response = await fetch(url);
            if (!response.ok) return `HTTP Error: ${response.status}`;
            const data = await response.json();
            
            if (!data.objects || data.objects.length === 0) return "No packages found.";
            
            return data.objects.map((obj: any) => 
                `- ${obj.package.name} (v${obj.package.version}): ${obj.package.description}`
            ).join('\n');
        } catch (e: any) {
            return `Error searching NPM: ${e.message}`;
        }
    }
};

export const NpmInstallSkill: AgentSkill = {
    name: 'npm_install',
    description: 'Installs an NPM package and adds it to package.json. Use isDev=true for devDependencies.',
    example: `<tool_call>\n{"action": "npm_install", "package": "express", "isDev": false}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.package) return "Error: package is required";
        const devFlag = args.isDev ? '--save-dev' : '--save';
        // Safe package name regex to prevent command injection
        if (!/^[a-zA-Z0-9\-_\/@.]+$/.test(args.package)) {
            return "Error: Invalid package name format";
        }
        
        return new Promise((resolve) => {
            exec(`npm install ${args.package} ${devFlag}`, { cwd: process.cwd() }, (error, stdout, stderr) => {
                if (error) {
                    resolve(`NPM Error: ${error.message}\n${stderr}`);
                } else {
                    resolve(`Successfully installed ${args.package}.\n${stdout.trim()}`);
                }
            });
        });
    }
};
