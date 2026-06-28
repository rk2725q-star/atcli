import * as fs from 'fs';
import * as path from 'path';

export interface AppState {
    currentProvider: string;
    currentModel: string;
}

export function handleSlashCommand(input: string, state: AppState): { handled: boolean, action?: 'manage' | 'upload' | 'agentica', args?: string } {
    const parts = input.trim().split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    switch (command) {
        case '/agentica':
            return { handled: true, action: 'agentica', args: args.length > 0 ? args.join(' ') : 'Activate OpenClaw continuous autonomous mode and execute tasks.' };

        case '/upload':
            return { handled: true, action: 'upload', args: args.length > 0 ? args.join(' ') : 'Analyze the uploaded file(s).' };
            
        case '/audit':
            return { handled: true, action: 'manage', args: args.length > 0 ? args.join(' ') : 'Perform a full deep architectural and bug audit on the entire codebase using all your available auditing skills.' };
            
        case '/manage':
        case '/review':
            if (args.length === 0) {
                console.log(`\n❌ Error: Please provide a task for the Tech Lead (e.g. /manage review the latest changes)`);
                return { handled: true };
            }
            return { handled: true, action: 'manage', args: args.join(' ') };

        case '/provider':
            if (args.length > 0) {
                state.currentProvider = args[0];
                console.log(`\n✅ Provider switched to: ${state.currentProvider}`);
            } else {
                console.log(`\nℹ️ Current provider is: ${state.currentProvider}`);
            }
            return { handled: true };
        
        case '/model':
            if (args.length > 0) {
                state.currentModel = args[0];
                console.log(`\n✅ Model switched to: ${state.currentModel}`);
            } else {
                console.log(`\nℹ️ Current model is: ${state.currentModel}`);
            }
            return { handled: true };
            
        case '/rename':
            if (args.length < 3) {
                console.log(`\n❌ Error: Usage: /rename <file_path> <old_string> <new_string>`);
                console.log(`Example: /rename src/algo.js Var_A accountBalance`);
                return { handled: true };
            }
            try {
                const targetFile = args[0];
                const oldStr = args[1];
                const newStr = args[2];
                const filePath = path.resolve(process.cwd(), targetFile);
                
                if (!fs.existsSync(filePath)) {
                    console.log(`\n❌ Error: File not found: ${filePath}`);
                    return { handled: true };
                }
                
                let content = fs.readFileSync(filePath, 'utf-8');
                if (!content.includes(oldStr)) {
                    console.log(`\n⚠️ Warning: '${oldStr}' not found in ${targetFile}`);
                    return { handled: true };
                }
                
                const regex = new RegExp(oldStr.replace(/[.*+?^$\{}()|[\]\\]/g, '\\$&'), 'g');
                content = content.replace(regex, newStr);
                fs.writeFileSync(filePath, content, 'utf-8');
                console.log(`\n✅ Success: Renamed all occurrences of '${oldStr}' to '${newStr}' in ${targetFile}`);
                console.log(`🔒 The AI provider has NO knowledge of this rename operation.`);
            } catch (err: any) {
                console.log(`\n❌ Error renaming: ${err.message}`);
            }
            return { handled: true };
            
        case '/exit':
            console.log('\nExiting ATCLI. Goodbye!');
            process.exit(0);
            return { handled: true };
            
        case '/help':
            console.log('\nAvailable commands:');
            console.log('  /provider <name>  - Switch the current AI provider (e.g., deepseek, chatgpt, gemini, ollama, local)');
            console.log('  /model <name>     - Switch the current model');
            console.log('  /rename <file> <old> <new> - Locally rename variables to protect IP from the AI');
            console.log('  /manage <task>    - Spawn the Tech Lead Agent to manage/review code');
            console.log('  /review <task>    - Alias for /manage');
            console.log('  /agentica <task>  - Enter OpenClaw autonomous continuous execution mode (Whole PC + Browser Control)');
            console.log('  /upload <prompt>  - Pause terminal so you can manually upload an image in the browser');
            console.log('  /audit            - Perform a full codebase scaling and bug audit');
            console.log('  /exit             - Exit ATCLI');
            console.log('  /help             - Show this help message');
            console.log('');
            console.log('\x1b[36m\x1b[1m🔍 AECL — Auto Error Checker Live:\x1b[0m');
            console.log('\x1b[90m  AECL is a separate command that shows live TypeScript/JS errors');
            console.log('  as the AI writes code — like VSCode\'s Problems panel, but in your terminal.\x1b[0m');
            console.log('');
            console.log('\x1b[97m  HOW TO USE:\x1b[0m');
            console.log('\x1b[90m  1. Open a SECOND terminal window (split terminal recommended)\x1b[0m');
            console.log('\x1b[36m     > aecl\x1b[0m');
            console.log('\x1b[90m  2. In THIS terminal, ask ATCLI to build a project as normal.\x1b[0m');
            console.log('\x1b[90m  3. Every 5 files the AI writes, AECL auto-checks for errors and updates the panel!\x1b[0m');
            console.log('');
            console.log('\x1b[90m  AECL memory is stored as .aecl_memory.json in your current project folder.\x1b[0m');
            console.log('\x1b[90m  Each project folder gets its own error history. ✅\x1b[0m');
            return { handled: true };
            
        default:
            console.log(`\n❌ Unknown command: ${command}. Type /help for available commands.`);
            return { handled: true };
    }
}
