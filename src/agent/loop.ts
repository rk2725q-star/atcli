import { BaseBrowserAdapter } from '../providers/baseBrowser';
import { generateSystemPrompt } from './prompts';
import { SkillManager } from './skillManager';
import { get_encoding } from 'tiktoken';

export class AgentLoop {
    private maxIterations = 500;
    private skillManager: SkillManager;
    public isAgenticaMode: boolean = false;
    private totalTokensProcessed: number = 0;
    private tokenizer = get_encoding("cl100k_base");

    constructor(private provider: BaseBrowserAdapter, private isFirstMessage: boolean = false) {
        this.skillManager = new SkillManager();
    }

    public async run(userMessage: string): Promise<void> {
        if (this.isAgenticaMode) {
            this.maxIterations = 5000; // Agentica continuous execution allows far more iterations
            console.log(`\n🤖 Starting Agentica OpenClaw Continuous Loop (Max Iterations: ${this.maxIterations})...`);
        } else {
            console.log(`\n🤖 Starting Autonomous Agent Loop (Max Iterations: ${this.maxIterations})...`);
        }
        
        // Dynamically load all built-in and user workspace skills
        await this.skillManager.loadAllSkills();

        // Construct the initial prompt injecting the system instructions
        const systemPrompt = await generateSystemPrompt(this.skillManager, this.isAgenticaMode);
        let currentMessage = "";

        if (this.isFirstMessage) {
            const MAX_CHUNK_LENGTH = 100000; // Increased to 100k to prevent splitting JSON definitions across chunks
            
            if (systemPrompt.length > MAX_CHUNK_LENGTH) {
                console.log(`\n[Agent] System prompt is massive (${systemPrompt.length} chars). Intelligently splitting into semantic chunks...`);
                
                // Semantic chunking: split by paragraphs to avoid breaking tool JSONs or security rules in half
                const paragraphs = systemPrompt.split('\n\n');
                const chunks: string[] = [];
                let currentChunkText = "";
                
                for (const p of paragraphs) {
                    if (currentChunkText.length + p.length + 2 > MAX_CHUNK_LENGTH) {
                        if (currentChunkText) chunks.push(currentChunkText.trim());
                        currentChunkText = p;
                    } else {
                        currentChunkText += (currentChunkText ? '\n\n' : '') + p;
                    }
                }
                if (currentChunkText) chunks.push(currentChunkText.trim());

                const numChunks = chunks.length;
                for (let i = 0; i < numChunks; i++) {
                    const isLastChunk = i === numChunks - 1;
                    const chunkText = chunks[i];
                    
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
            let reminder = "[SYSTEM REMINDER: DO NOT ASK FOR PERMISSION. DO NOT WRITE JAVASCRIPT CODE BLOCKS. IF YOU NEED TO EXECUTE A COMMAND OR FILE OPERATION, OUTPUT THE <tool_call> XML BLOCK. IF THE USER IS JUST CHATTING, YOU MAY RESPOND WITH TEXT NORMALLY.]";
            if (this.isAgenticaMode) {
                reminder += "\n[AGENTICA OVERRIDE: YOU ARE CONNECTED TO THE ATCLI XML BRIDGE. YOU DO HAVE PHYSICAL PC CONTROL. YOU MUST NOT USE INTERNAL SEARCH. EMIT <tool_call> TO OPEN THE BROWSER OR RUN COMMANDS.]";
            }
            currentMessage = `${userMessage}\n\n${reminder}`;
        }
        
        let lastRefreshTokens = this.totalTokensProcessed;

        for (let i = 1; i <= this.maxIterations; i++) {
            
            // CONTEXT REFRESH: If tokens grew by > 80,000 since last refresh, re-inject the tools and rules!
            if (this.totalTokensProcessed - lastRefreshTokens > 80000) {
                console.log(`\n🔄 [Agent] Context window approaching limits. Re-injecting System Prompt to prevent memory loss...`);
                currentMessage = `[CONTEXT REFRESH: The following is a reminder of your available tools and strict operating rules.]\n\n${systemPrompt}\n\n[END OF CONTEXT REFRESH]\n\n${currentMessage}`;
                lastRefreshTokens = this.totalTokensProcessed;
            }

            console.log(`\n[Agent Iteration ${i}/${this.maxIterations}] Sending message...`);
            
            this.totalTokensProcessed += this.tokenizer.encode(currentMessage).length;
            (global as any).atcli_current_tokens = this.totalTokensProcessed;
            
            let response;
            if ((this as any).pendingVisionImage) {
                const imagePath = (this as any).pendingVisionImage;
                (this as any).pendingVisionImage = null; // reset
                response = await this.provider.sendImageAndMessage(imagePath, currentMessage);
            } else {
                response = await this.provider.sendMessage(currentMessage);
            }
            
            if (response.error) {
                // Suppress expected errors during graceful shutdown
                if (!response.error.includes('Target page, context or browser has been closed')) {
                    console.log(`❌ Provider Error: ${response.error}`);
                }
                break;
            }

            const aiText = response.text;
            this.totalTokensProcessed += this.tokenizer.encode(aiText).length;
            (global as any).atcli_current_tokens = this.totalTokensProcessed;
            
            console.log(`\n📊 Exact Context Usage: ${this.totalTokensProcessed.toLocaleString()} Tokens`);
            console.log(`\n[AI RESPONSE]:\n${aiText}`);

            // Parse tool call
            let toolCall;
            try {
                toolCall = this.parseToolCall(aiText);
            } catch (err: any) {
                console.log(`\n⚠️ Tool Parsing Error: ${err.message}`);
                currentMessage = `<tool_result>\nFailed to parse JSON inside <tool_call>: ${err.message}. Please fix your JSON syntax (e.g. escape inner double quotes with \\\") and try again.\n</tool_result>\n[SYSTEM REMINDER: What is your next step? DO NOT ASK FOR PERMISSION. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK. 24/7 SECURITY FIREWALL ACTIVE: You are strictly forbidden from running destructive commands.]`;
                continue;
            }
            
            if (!toolCall) {
                // No tool call found, meaning the AI has finished its task
                if (aiText.includes('@TRIGGER_FINAL_AUDIT')) {
                    console.log(`\n🎉 Project completion detected! Spawning Tech Lead Auditor...`);
                    const { ManagerLoop } = require('./manager');
                    const manager = new ManagerLoop(this.provider, true);
                    manager.isAgenticaMode = this.isAgenticaMode; // Pass the autonomy status to the manager
                    await manager.run('Perform a full deep architectural and bug audit on the entire codebase using all your available auditing skills. Fix any bugs found.');
                } else {
                    console.log(`\n✅ Agent task completed or requires user feedback.`);
                }
                break;
            }

            const dangerousTools = ['run_command', 'run_background_command', 'install_skill', 'delete_file', 'clear_workspace'];
            if (dangerousTools.includes(toolCall.action)) {
                console.log(`\n⚠️  [ATCLI Safety] The AI wants to execute: ${toolCall.action}`);
                console.log(`Arguments: ${JSON.stringify(toolCall, null, 2)}`);
                
                if (this.isAgenticaMode) {
                    console.log(`\n🛡️ [Agentica Autonomy] Auto-approving dangerous command due to Memory Lockdown restrictions.`);
                } else {
                    const readline = require('readline');
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });

                    const answer: string = await new Promise((resolve) => {
                        rl.question('Allow this action? (Y/n/feedback): ', (ans: string) => {
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
            }

            console.log(`\n⚙️ Executing Skill: ${toolCall.action}`);
            let result = await this.skillManager.executeSkill(toolCall.action, toolCall);
            
            // Global safety truncation to prevent web UI crashes from massive outputs
            if (result.length > 30000 && !result.startsWith('__ATCLI_VISION_PAYLOAD__')) {
                console.log(`[Warning]: Tool output truncated from ${result.length} to 30000 chars.`);
                result = result.substring(0, 30000) + "\n\n...[TRUNCATED: Output too large. Use read_lines or grep_search to read specific parts]...";
            }
            
            console.log(`[Skill Output]:\n${result.substring(0, 1000)}${result.length > 1000 ? '...' : ''}`);

            // Handle Native Vision Payload Interception
            if (result.startsWith('__ATCLI_VISION_PAYLOAD__')) {
                const parts = result.split('__');
                if (parts.length >= 3) {
                    const imagePath = parts[2];
                    const prompt = parts.slice(3).join('__');
                    // Store the vision payload to be sent at the START of the next iteration
                    (this as any).pendingVisionImage = imagePath;
                    (this as any).pendingVisionMessage = `<tool_result>\nVision payload attached.\n</tool_result>\n[SYSTEM REMINDER: ${prompt}]`;
                    currentMessage = (this as any).pendingVisionMessage;
                }
            } else {
                // Format the standard result to send back to the AI
                currentMessage = `<tool_result>\n${result}\n</tool_result>\n[SYSTEM REMINDER: What is your next step? DO NOT ASK FOR PERMISSION. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK. 24/7 SECURITY FIREWALL ACTIVE: You are strictly forbidden from running destructive commands. DO NOT CONVERSE.]`;
            }
            
            // Episodic Memory Checkpoint every 15 iterations to save state
            if (i > 0 && i % 15 === 0) {
                console.log(`\n🧠 [EPISODIC MEMORY CHECKPOINT] Requesting AI to save state to ATCLI_MEMORY.md`);
                currentMessage += `\n\n[EPISODIC MEMORY CHECKPOINT: You have been running for ${i} iterations. You MUST immediately use the \`write_file\` or \`replace_file_content\` tool to write/update a summary of the user's original goal, what you have accomplished so far, the current architecture, and what remains to be done into a file named \`ATCLI_MEMORY.md\` in the root directory. This ensures future sessions can recall the project state! Do this BEFORE your next coding step!]`;
            }

            // True Context Window Refresh (Only if exceeding massive token limits)
            if (this.totalTokensProcessed > 180000) {
                console.log(`\n🔄 [CRITICAL CONTEXT REFRESH] 180k Token limit reached. Reinjecting full System Prompt to prevent memory loss.`);
                const refreshPrompt = await generateSystemPrompt(this.skillManager, this.isAgenticaMode);
                const MAX_CHUNK_LENGTH = 100000;
                
                if (refreshPrompt.length > MAX_CHUNK_LENGTH) {
                    const paragraphs = refreshPrompt.split('\n\n');
                    const chunks: string[] = [];
                    let currentChunkText = "";
                    for (const p of paragraphs) {
                        if (currentChunkText.length + p.length + 2 > MAX_CHUNK_LENGTH) {
                            if (currentChunkText) chunks.push(currentChunkText.trim());
                            currentChunkText = p;
                        } else {
                            currentChunkText += (currentChunkText ? '\n\n' : '') + p;
                        }
                    }
                    if (currentChunkText) chunks.push(currentChunkText.trim());

                    const numChunks = chunks.length;
                    for (let j = 0; j < numChunks; j++) {
                        const isLastChunk = j === numChunks - 1;
                        let messageToSend = `[CONTEXT REFRESH Part ${j + 1}/${numChunks}]\n${chunks[j]}`;
                        
                        if (!isLastChunk) {
                            messageToSend += `\n\n[SYSTEM INSTRUCTION: This is a partial context refresh. Do not execute anything yet. Just reply "Received refresh part ${j + 1}".]`;
                            console.log(`[Agent] Sending refresh chunk ${j + 1}/${numChunks}...`);
                            await this.provider.sendMessage(messageToSend);
                        } else {
                            // On the last chunk, append the actual current tool result we were trying to send!
                            currentMessage = `${messageToSend}\n\n[END OF CONTEXT REFRESH]\n\n${currentMessage}`;
                        }
                    }
                } else {
                    currentMessage = `[CONTEXT REFRESH: Core programming reminder:]\n\n${refreshPrompt}\n\n[END OF CONTEXT REFRESH]\n\n${currentMessage}`;
                }
                
                // Reset tracker to prevent infinite refresh looping
                this.totalTokensProcessed = 0;
                (global as any).atcli_current_tokens = 0;
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
