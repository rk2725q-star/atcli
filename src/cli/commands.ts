export interface AppState {
    currentProvider: string;
    currentModel: string;
}

export function handleSlashCommand(input: string, state: AppState): { handled: boolean, action?: 'manage', args?: string } {
    const parts = input.trim().split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    switch (command) {
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
            
        case '/exit':
            console.log('\nExiting ATCLI. Goodbye!');
            process.exit(0);
            return { handled: true };
            
        case '/help':
            console.log('\nAvailable commands:');
            console.log('  /provider <name>  - Switch the current AI provider (e.g., deepseek, chatgpt, gemini)');
            console.log('  /model <name>     - Switch the current model');
            console.log('  /manage <task>    - Spawn the Tech Lead Agent to manage/review code');
            console.log('  /review <task>    - Alias for /manage');
            console.log('  /audit            - Perform a full codebase scaling and bug audit');
            console.log('  /exit             - Exit ATCLI');
            console.log('  /help             - Show this help message');
            return { handled: true };
            
        default:
            console.log(`\n❌ Unknown command: ${command}. Type /help for available commands.`);
            return { handled: true };
    }
}
