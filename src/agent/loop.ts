import { AgentProvider } from '../providers/interface';
import { generateSystemPrompt } from './prompts';
import { SkillManager } from './skillManager';
import { get_encoding } from 'tiktoken';

export class AgentLoop {
    private maxIterations = 500;
    private skillManager: SkillManager;
    public isAgenticaMode: boolean = false;
    private totalTokensProcessed: number = 0;
    private tokenizer = get_encoding("cl100k_base");
    // AECL: Mechanical edit counter (not prompt-based) to trigger aecl_check every 5 file writes
    private editsSinceLastAeclCheck: number = 0;
    private readonly AECL_CHECK_INTERVAL = 5;

    constructor(private provider: AgentProvider, private isFirstMessage: boolean = false) {
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
                
                // Semantic chunking: split by paragraphs (handle both LF and CRLF) to avoid breaking tool JSONs or security rules in half
                const paragraphs = systemPrompt.split(/\r?\n\r?\n/);
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
            
            // Dynamic Context Refresh Threshold (Browser AI has ~128k-200k, Local AI usually 32k)
            const isLocal = this.provider.id === 'ollama' || this.provider.id === 'local' || this.provider.id === 'qwen-local';
            const refreshThreshold = isLocal ? 20000 : 80000;
            
            // CONTEXT REFRESH: Re-inject tools to prevent the AI from hitting context window limits
            if (this.totalTokensProcessed - lastRefreshTokens > refreshThreshold) {
                console.log(`\n🔄 [Agent] Context window limits approaching (Protecting ${refreshThreshold} limit). Auto-resending System Prompt to prevent memory loss...`);
                currentMessage = `[CONTEXT REFRESH (${refreshThreshold} Context Protection): The following is an auto-resend of your available tools and strict operating rules to prevent memory loss.]\n\n${systemPrompt}\n\n[END OF CONTEXT REFRESH]\n\n${currentMessage}`;
                lastRefreshTokens = this.totalTokensProcessed;
            }

            // ATCLI_MEMORY 3-Iteration Recall Check
            if (i > 1 && i % 3 === 0) {
                currentMessage += `\n\n[SYSTEM INTELLIGENT RECALL: You have been running for 3 iterations. To prevent task hallucination, you MUST immediately use the grep_search tool or view_file tool to check your ATCLI_MEMORY.md or global instructions before writing any more code. Stay on track!]`;
            }

            // Active Background Task Reminder (Prevents forgetting status)
            const globalTasks = (global as any).ATCLI_TASKS;
            if (globalTasks && globalTasks.size > 0) {
                const taskIds = Array.from(globalTasks.keys()).join(', ');
                currentMessage += `\n\n<CRITICAL_SYSTEM_REMINDER>\n<TASKS_RUNNING>${taskIds}</TASKS_RUNNING>\n<ACTION_REQUIRED>Do NOT forget to use the 'manage_task' tool with sub_action="logs" or "status" to check if they crashed or finished! Context loss prevention is active.</ACTION_REQUIRED>\n</CRITICAL_SYSTEM_REMINDER>\n`;
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

            // ─── SMART SAFETY GATE ───────────────────────────────────────────
            // Tier 1: HARD BLOCK — never allow these (system-destruction level)
            const hardBlockedTools = ['clear_workspace', 'install_skill'];
            
            // Tier 2: SOFT BLOCK — run_command and run_background_command need user approval
            const softBlockedTools = ['run_command', 'run_background_command'];

            // Tier 3: SMART DELETE — delete_file allowed if ALL paths are inside CWD
            // Blocked if any path tries to escape the project folder
            if (toolCall.action === 'delete_file') {
                const pathsToCheck = toolCall.paths || (toolCall.path ? [toolCall.path] : []);
                const cwd = process.cwd();
                const escapingPaths = pathsToCheck.filter((p: string) => {
                    const resolved = require('path').resolve(cwd, p);
                    return !resolved.startsWith(cwd);
                });
                
                if (escapingPaths.length > 0) {
                    // HARD BLOCK: trying to delete outside project folder
                    console.log(`\n🚫 [ATCLI SECURITY] Blocked delete_file — paths escape the project folder:`);
                    escapingPaths.forEach((p: string) => console.log(`   ❌ ${p}`));
                    currentMessage = `<tool_result>\n[SECURITY BLOCK] Cannot delete files outside the current project folder: ${escapingPaths.join(', ')}\n</tool_result>\n[SYSTEM REMINDER: DO NOT attempt to delete files outside the current project directory. Adjust your plan.]`;
                    continue;
                } else {
                    // SMART ALLOW: within project — show info but auto-allow in Agentica, ask in Vibecoding
                    console.log(`\n🗑️  [ATCLI] AI wants to delete (within project):`);
                    pathsToCheck.forEach((p: string) => console.log(`   📄 ${p}`));
                    
                    if (!this.isAgenticaMode) {
                        const rawAnswer = await (global as any).askQuestion('Allow delete? (Y/n/feedback): ');
                        const answer = rawAnswer.trim().toLowerCase();
                        if (answer === 'n' || answer === 'no') {
                            console.log(`\n🚫 Delete rejected by user.`);
                            currentMessage = `<tool_result>\nUser denied the delete operation.\n</tool_result>\n[SYSTEM REMINDER: The user rejected this delete. Find an alternative approach — perhaps just rewrite the file content instead of deleting it. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK.]`;
                            continue;
                        } else if (answer !== 'y' && answer !== 'yes' && answer !== '') {
                            currentMessage = `<tool_result>\nUser feedback on delete: ${rawAnswer.trim()}\n</tool_result>\n[SYSTEM REMINDER: Adjust your approach based on this feedback. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK.]`;
                            continue;
                        }
                    }
                    // Approved — execute and inject rebuild reminder
                    console.log(`\n⚙️ Executing Skill: delete_file`);
                    const deleteResult = await this.skillManager.executeSkill('delete_file', toolCall);
                    console.log(`[Skill Output]: ${deleteResult}`);
                    const deletedFiles = pathsToCheck.join(', ');
                    currentMessage = `<tool_result>\n${deleteResult}\n</tool_result>\n[SYSTEM REMINDER: You just deleted: ${deletedFiles}. You MUST now IMMEDIATELY recreate/rebuild the deleted file(s) with correct, improved content. DO NOT leave the project broken. Output the next <tool_call> to write_file or replace the deleted file now.]`;
                    continue;
                }
            }

            if (hardBlockedTools.includes(toolCall.action)) {
                console.log(`\n⚠️  [ATCLI Safety] The AI wants to execute: ${toolCall.action}`);
                console.log(`Arguments: ${JSON.stringify(toolCall, null, 2)}`);
                if (this.isAgenticaMode) {
                    console.log(`\n🛡️ [Agentica Autonomy] Auto-approving.`);
                } else {
                    const rawAnswer = await (global as any).askQuestion('Allow this action? (Y/n/feedback): ');
                    const answer = rawAnswer.trim().toLowerCase();
                    if (answer === 'n' || answer === 'no') {
                        console.log(`\n🚫 Action rejected by user.`);
                        currentMessage = `<tool_result>\nUser denied permission.\n</tool_result>\n[SYSTEM REMINDER: What is your next step? DO NOT ASK FOR PERMISSION. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK.]`;
                        continue;
                    } else if (answer !== 'y' && answer !== 'yes' && answer !== '') {
                        console.log(`\n💬 Sending user feedback to AI...`);
                        currentMessage = `<tool_result>\nUser rejected with feedback: ${rawAnswer.trim()}\n</tool_result>\n[SYSTEM REMINDER: Correct your tool call based on the user's feedback. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK.]`;
                        continue;
                    }
                }
            }

            if (softBlockedTools.includes(toolCall.action)) {
                console.log(`\n⚠️  [ATCLI Safety] The AI wants to run a command:`);
                const cmdDisplay = toolCall.command || toolCall.cmd || JSON.stringify(toolCall);
                console.log(`   > ${cmdDisplay}`);
                if (this.isAgenticaMode) {
                    console.log(`\n🛡️ [Agentica Autonomy] Auto-approving command.`);
                } else {
                    const rawAnswer = await (global as any).askQuestion('Run this command? (Y/n/feedback): ');
                    // Fix: trim fully, take first char only to avoid 'yy' double-type issues
                    const answer = rawAnswer.trim().toLowerCase();
                    const firstChar = answer.charAt(0);
                    if (firstChar === 'n') {
                        console.log(`\n🚫 Command rejected.`);
                        currentMessage = `<tool_result>\nUser denied the command.\n</tool_result>\n[SYSTEM REMINDER: The user rejected this command. Try a safer alternative. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK.]`;
                        continue;
                    } else if (firstChar !== 'y' && answer !== '') {
                        console.log(`\n💬 Sending user feedback to AI...`);
                        currentMessage = `<tool_result>\nUser feedback: ${rawAnswer.trim()}\n</tool_result>\n[SYSTEM REMINDER: Adjust your approach. IMMEDIATELY OUTPUT THE NEXT <tool_call> XML BLOCK.]`;
                        continue;
                    }
                    // 'y', 'yes', 'yy', '' (Enter) all treated as approval
                    console.log(`\n✅ Command approved.`);
                }
            }

            console.log(`\n⚙️ Executing Skill: ${toolCall.action}`);
            let result = await this.skillManager.executeSkill(toolCall.action, toolCall);

            // AECL MECHANICAL COUNTER: Track file-writing tools and trigger aecl_check every 5 edits
            // NOTE: actual skill names are 'replace' (edit.ts) and 'append_content' (edit.ts), 'write_file' (fs_write.ts)
            const fileWritingTools = ['write_file', 'replace', 'append_content', 'create_file'];
            if (fileWritingTools.includes(toolCall.action)) {
                this.editsSinceLastAeclCheck++;
                console.log(`\n📝 [AECL Counter] ${this.editsSinceLastAeclCheck}/${this.AECL_CHECK_INTERVAL} file writes since last check.`);
                if (this.editsSinceLastAeclCheck >= this.AECL_CHECK_INTERVAL) {
                    this.editsSinceLastAeclCheck = 0;
                    console.log(`\n🔍 [AECL] Auto-triggering error check after ${this.AECL_CHECK_INTERVAL} file writes...`);
                    const aeclResult = await this.skillManager.executeSkill('aecl_check', {
                        action: 'aecl_check',
                        files_written: [],
                        ai_notes: '[Auto-triggered by system after 5 file writes]'
                    });
                    console.log(`[AECL Auto-Check Result]:\n${aeclResult.substring(0, 500)}`);
                    // Inject AECL result into the next message so AI sees the errors
                    result = result + `\n\n[AECL AUTO-CHECK TRIGGERED]:\n${aeclResult}`;
                }
            }

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
            
            // Episodic Memory Checkpoint every 3 iterations to save state
            if (i > 0 && i % 3 === 0) {
                console.log(`\n🧠 [EPISODIC MEMORY CHECKPOINT] Requesting AI to save state to ATCLI_MEMORY.md`);
                currentMessage += `\n\n[EPISODIC MEMORY CHECKPOINT: You have been running for ${i} iterations. You MUST immediately use the \`write_file\` or \`replace_content\` tool to write/update a SHORT AND SWEET summary of what work you just finished, and the overall project state, into a file named \`ATCLI_MEMORY.md\` in the root directory. This ensures future sessions can recall the project state! Keep it very concise so the AI can read it quickly. Do this BEFORE your next coding step!]`;
            }

            // True Context Window Refresh (Only if exceeding massive token limits)
            if (this.totalTokensProcessed > 180000) {
                console.log(`\n🔄 [CRITICAL CONTEXT REFRESH] 180k Token limit reached. Reinjecting full System Prompt to prevent memory loss.`);
                const refreshPrompt = await generateSystemPrompt(this.skillManager, this.isAgenticaMode);
                const MAX_CHUNK_LENGTH = 100000;
                
                if (refreshPrompt.length > MAX_CHUNK_LENGTH) {
                    const paragraphs = refreshPrompt.split(/\r?\n\r?\n/);
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
