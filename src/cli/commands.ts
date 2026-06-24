export interface AppState {
    currentProvider: string;
    currentModel: string;
}

export function handleSlashCommand(input: string, state: AppState): boolean {
    const parts = input.trim().split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    switch (command) {
        case '/provider':
            if (args.length > 0) {
                state.currentProvider = args[0];
                console.log(`\n✅ Provider switched to: ${state.currentProvider}`);
            } else {
                console.log(`\nℹ️ Current provider is: ${state.currentProvider}`);
            }
            return true;
        
        case '/model':
            if (args.length > 0) {
                state.currentModel = args[0];
                console.log(`\n✅ Model switched to: ${state.currentModel}`);
            } else {
                console.log(`\nℹ️ Current model is: ${state.currentModel}`);
            }
            return true;
            
        case '/exit':
            console.log('\nExiting ATCLI. Goodbye!');
            process.exit(0);
            return true;
            
        case '/help':
            console.log('\nAvailable commands:');
            console.log('  /provider <name>  - Switch the current AI provider (e.g., deepseek, chatgpt, gemini)');
            console.log('  /model <name>     - Switch the current model');
            console.log('  /exit             - Exit ATCLI');
            console.log('  /help             - Show this help message');
            return true;
            
        default:
            console.log(`\n❌ Unknown command: ${command}. Type /help for available commands.`);
            return true;
    }
}
