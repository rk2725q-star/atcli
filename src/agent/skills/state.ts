import { AgentSkill } from './base';
import * as fs from 'fs/promises';
import * as path from 'path';

export const ManageStateSkill: AgentSkill = {
    name: 'manage_state',
    description: `Manages an internal JSON state tracker for your tasks. This is much faster and more reliable than writing to markdown files. Use this to break down complex tasks and track progress.

Modes:
- 'update': Pass a 'todos' array to replace the entire state.
- 'query': Omit 'todos' to retrieve the current state without changes.
- 'clear': Pass an empty array '[]' to clear all todos.

Arguments:
  todos (optional) — Array of objects with { id, description, status: 'pending'|'in_progress'|'done' }.
`,
    example: `<tool_call>\n{"action": "manage_state", "todos": [{"id": 1, "description": "Fix bug", "status": "in_progress"}]}\n</tool_call>`,
    execute: async (args: any) => {
        const cwd = (global as any).atcli_project_root || process.cwd();
        const statePath = path.join(cwd, '.atcli-state.json');

        try {
            if (args.todos === undefined) {
                // Query mode
                try {
                    const content = await fs.readFile(statePath, 'utf8');
                    return `Current State:\n${content}`;
                } catch {
                    return `State is empty. No .atcli-state.json found.`;
                }
            } else if (Array.isArray(args.todos) && args.todos.length === 0) {
                // Clear mode
                await fs.writeFile(statePath, JSON.stringify([], null, 2), 'utf8');
                return `Success: State cleared.`;
            } else {
                // Update mode
                const stateData = Array.isArray(args.todos) ? args.todos : [args.todos];
                await fs.writeFile(statePath, JSON.stringify(stateData, null, 2), 'utf8');
                return `Success: State updated. You can check your progress anytime by calling manage_state without arguments.`;
            }
        } catch (e: any) {
            return `Error managing state: ${e.message}`;
        }
    }
};
