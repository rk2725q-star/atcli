import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class TerminalTools {
    public static async runCommand(command: string): Promise<string> {
        // In a real application, you'd want policy guards here (e.g., blocking 'rm -rf /')
        console.log(`\n[Terminal Tool] Executing: ${command}`);
        try {
            const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });
            let output = stdout;
            if (stderr) {
                output += `\n[STDERR]:\n${stderr}`;
            }
            return output.trim() || 'Command executed successfully with no output.';
        } catch (error: any) {
            throw new Error(`Execution failed: ${error.message}`);
        }
    }
}
