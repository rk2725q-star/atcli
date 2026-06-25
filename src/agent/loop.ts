import { BaseBrowserAdapter } from '../providers/baseBrowser';
import { generateSystemPrompt } from './prompts';
import { SkillManager } from './skillManager';

export class AgentLoop {
    private maxIterations = 250;
    private skillManager: SkillManager;

    constructor(private provider: BaseBrowserAdapter, private isFirstMessage: boolean = false) {
        this.skillManager = new SkillManager();
    }

    public async run(userMessage: string): Promise<void> {
        console.log(`\n🤖 Starting Autonomous Agent Loop (Max Iterations: ${this.maxIterations})...`);
        
        // Dynamically load all built-in and user workspace skills
        await this.skillManager.loadAllSkills();

        // Construct the initial prompt injecting the system instructions
        const systemPrompt = await generateSystemPrompt(this.skillManager);
        let currentMessage = "";

        if (this.isFirstMessage) {
            const MAX_CHUNK_LENGTH = 25000; // Increased to 25k since native insertText easily handles it without freezing
            
            if (systemPrompt.length > MAX_CHUNK_LENGTH) {
                console.log(`\n[Agent] System prompt is massive (${systemPrompt.length} chars). Intelligently splitting into chunks...`);
                
                const numChunks = Math.ceil(systemPrompt.length / MAX_CHUNK_LENGTH);
                for (let i = 0; i < numChunks; i++) {
                    const isLastChunk = i === numChunks - 1;
                    const chunkText = systemPrompt.substring(i * MAX_CHUNK_LENGTH, (i + 1) * MAX_CHUNK_LENGTH);
                    
                    let messageToSend = `[System Knowledge Base Part ${i + 1}/${numChunks}]\n${chunkText}`;
                    
                    if (!isLastChunk) {
                        messageToSend += `\n\n[SYSTEM INSTRUCTION: This is a partial knowledge base. Do not execute the user request yet. Just reply "Received part ${i + 1}".]`;
                        console.log(`[Agent] Sending system knowledge chunk ${i + 1}/${numChunks}...`);
                        const chunkResponse = await this.provider.sendMessage(messageToSend);
                        if (chunkResponse.error) {
                            console.log(`❌ Provider Error during chunking: ${chunkResponse.error}`);
                            return;
                        }
                    } else {
                        // The final chunk will be passed into the main loop along with the actual user request
                        console.log(`[Agent] Sending final chunk ${i + 1}/${numChunks} with actual user request...`);
                        currentMessage = `${messageToSend}\n\nUser Request:\n${userMessage}`;
                    }
                }
            } else {
                currentMessage = `${systemPrompt}\n\nUser Request:\n${userMessage}`;
            }
        } else {
            currentMessage = `${userMessage}\n\n[SYSTEM REMINDER: DO NOT ASK FOR PERMISSION. DO NOT WRITE JAVASCRIPT CODE BLOCKS. YOU MUST IMMEDIATELY OUTPUT THE EXACT <tool_call> XML BLOCK. DO NOT CONVERSE.]`;
        }

        for (let i = 1; i <= this.maxIterations; i++) {
            console.log(`\n[Agent Iteration ${i}/${this.maxIterations}] Sending message...`);
            
            const response = await this.provider.sendMessage(currentMessage);
            
            if (response.error) {
                // Suppress expected errors during graceful shutdown
                if (!response.error.includes('Target page, context or browser has been closed')) {
                    console.log(`❌ Provider Error: ${response.error}`);
                }
                break;
            }

            const aiText = response.text;
            console.log(`\n[AI RESPONSE]:\n${aiText}`);

            // Parse tool call
            let toolCall;
            try {
                toolCall = this.parseToolCall(aiText);
            } catch (err: any) {
                console.log(`\n⚠️ Tool Parsing Error: ${err.message}`);
                currentMessage = `<tool_result>\nFailed to parse JSON inside <tool_call>: ${err.message}. Please fix your JSON syntax (e.g. escape inner double quotes with \\\") and try again.\n</tool_result>\n[SYSTEM REMINDER: What is your next step? DO NOT ASK FOR PERMISSION. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK.]`;
                continue;
            }
            
            if (!toolCall) {
                // No tool call found, meaning the AI has finished its task
                if (aiText.includes('@TRIGGER_FINAL_AUDIT')) {
                    console.log(`\n🎉 Project completion detected! Spawning Tech Lead Auditor...`);
                    const { ManagerLoop } = require('./manager');
                    const manager = new ManagerLoop(this.provider, true);
                    await manager.run('Perform a full deep architectural and bug audit on the entire codebase using all your available auditing skills. Fix any bugs found.');
                } else {
                    console.log(`\n✅ Agent task completed or requires user feedback.`);
                }
                break;
            }

            const dangerousTools = ['run_command', 'run_background_command', 'install_skill'];
            if (dangerousTools.includes(toolCall.action)) {
                console.log(`\n⚠️  [ATCLI Safety] The AI wants to execute: ${toolCall.action}`);
                console.log(`Arguments: ${JSON.stringify(toolCall, null, 2)}`);
                
                const readline = require('readline');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                const answer: string = await new Promise((resolve) => {
                    rl.question('Allow this action? (y/n/or type feedback): ', (ans: string) => {
                        rl.close();
                        resolve(ans.trim());
                    });
                });

                if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
                    console.log(`\n🚫 Action rejected by user.`);
                    currentMessage = `<tool_result>\nUser denied permission.\n</tool_result>\n[SYSTEM REMINDER: What is your next step? DO NOT ASK FOR PERMISSION. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK.]`;
                    continue;
                } else if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes' && answer !== '') {
                    console.log(`\n💬 Sending user feedback to AI...`);
                    currentMessage = `<tool_result>\nUser rejected with feedback: ${answer}\n</tool_result>\n[SYSTEM REMINDER: Correct your tool call based on the user's feedback. DO NOT ASK FOR PERMISSION. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK.]`;
                    continue;
                }
            }

            console.log(`\n⚙️ Executing Skill: ${toolCall.action}`);
            let result = await this.skillManager.executeSkill(toolCall.action, toolCall);
            
            // Global safety truncation to prevent web UI crashes from massive outputs
            if (result.length > 30000) {
                console.log(`[Warning]: Tool output truncated from ${result.length} to 30000 chars.`);
                result = result.substring(0, 30000) + "\n\n...[TRUNCATED: Output too large. Use read_lines or grep_search to read specific parts]...";
            }
            
            console.log(`[Skill Output]:\n${result.substring(0, 1000)}${result.length > 1000 ? '...' : ''}`);

            // Format the result to send back to the AI
            currentMessage = `<tool_result>\n${result}\n</tool_result>\n[SYSTEM REMINDER: What is your next step? DO NOT ASK FOR PERMISSION. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK. DO NOT CONVERSE.]`;
            
            // Context Refresh & Episodic Memory Checkpoint every 8 iterations
            if (i > 0 && i % 8 === 0) {
                const refreshPrompt = await generateSystemPrompt(this.skillManager);
                currentMessage += `\n\n[SYSTEM CONTEXT REFRESH: You have been running for ${i} iterations. To prevent you from forgetting your core instructions due to context window limits, here is your core programming again:\n${refreshPrompt}]\n\n[EPISODIC MEMORY CHECKPOINT: You MUST immediately use the \`write_file\` tool to write a summary of the user's original goal, what you have accomplished so far, the current architecture, and what remains to be done into a file named \`ATCLI_MEMORY.md\` in the root directory. This ensures you do not forget your task and future sessions can recall the project state! Do this BEFORE your next actual coding step!]`;
            }
        }
    }

    private parseToolCall(text: string): any | null {
        // Look for <tool_call> ... </tool_call>
        const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
        if (!match) return null; // No tool call means conversational response

        // Remove markdown code block syntax if the AI included it (e.g., ```json ... ```)
        let jsonStr = match[1].trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
        else if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        
        jsonStr = jsonStr.trim();

        // Custom robust auto-fix for write_file tool which often contains unescaped quotes/newlines
        if (jsonStr.includes('"write_file"')) {
            const contentRegex = /"content"\s*:\s*"([\s\S]*)"\s*}/;
            const contentMatch = jsonStr.match(contentRegex);
            if (contentMatch) {
                let rawContent = contentMatch[1];
                // Unescape first to avoid double escaping if the AI partially escaped it
                rawContent = rawContent
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\t/g, '\t')
                    .replace(/\\\\/g, '\\');
                
                // Re-escape perfectly for JSON
                let safeContent = rawContent
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t');
                
                // Replace the broken content with the perfectly escaped content
                jsonStr = jsonStr.replace(contentRegex, `"content": "${safeContent}"}`);
            }
        }
        
        // Auto-fix unescaped backslashes (common when AI outputs Windows paths like C:\Users)
        // This regex replaces \ with \\ ONLY if it's not part of a valid JSON escape sequence like \n or \t
        jsonStr = jsonStr.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
        
        // Let JSON.parse throw if invalid, so the loop can catch it and feed it back to the AI
        const parsed = JSON.parse(jsonStr);
        return parsed;
    }
}
