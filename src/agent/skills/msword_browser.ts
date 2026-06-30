import { AgentSkill } from './base';
import * as path from 'path';
import * as fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// WORD ONLINE BROWSER SKILL
// Uses Agentica browser automation to open Microsoft Word Online (word.new)
// and type/format the document like a human — clicking toolbar buttons,
// applying styles, typing text. This is the "human-like" approach.
//
// Why browser over docx package:
// - Full Word Online toolbar access (SmartArt, WordArt, real styles)
// - User can see and edit the document live in their browser
// - No local Office installation needed
// - Works with any content the AI provides
// ─────────────────────────────────────────────────────────────────────────────

// Word Online keyboard shortcuts
const SHORTCUTS = {
    heading1:     'Control+Alt+1',
    heading2:     'Control+Alt+2',
    heading3:     'Control+Alt+3',
    normal:       'Control+Alt+0',
    bold:         'Control+b',
    italic:       'Control+i',
    underline:    'Control+u',
    alignCenter:  'Control+e',
    alignLeft:    'Control+l',
    alignJustify: 'Control+j',
    newLine:      'Enter',
    save:         'Control+s',
    selectAll:    'Control+a',
    undo:         'Control+z',
};

// Section content formatter — converts markdown-like text to Word Online typing steps
function parseContentToSteps(content: string): Array<{ type: 'heading' | 'bullet' | 'numbered' | 'text' | 'blank' | 'reference'; text: string; level?: number }> {
    const steps: Array<{ type: 'heading' | 'bullet' | 'numbered' | 'text' | 'blank' | 'reference'; text: string; level?: number }> = [];
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            steps.push({ type: 'blank', text: '' });
            continue;
        }
        // ## Heading 2 (markdown)
        if (trimmed.startsWith('## ')) {
            steps.push({ type: 'heading', text: trimmed.replace(/^##\s*/, ''), level: 2 });
            continue;
        }
        // # Heading 1
        if (trimmed.startsWith('# ')) {
            steps.push({ type: 'heading', text: trimmed.replace(/^#\s*/, ''), level: 1 });
            continue;
        }
        // Subheading: line ending with : and < 60 chars
        if (trimmed.endsWith(':') && trimmed.length < 60 && !trimmed.startsWith('-')) {
            steps.push({ type: 'heading', text: trimmed, level: 2 });
            continue;
        }
        // Numbered list: 1. 2. 3.
        if (trimmed.match(/^\d+\.\s/)) {
            steps.push({ type: 'numbered', text: trimmed });
            continue;
        }
        // Bullet
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
            steps.push({ type: 'bullet', text: trimmed.replace(/^[-•]\s*/, '') });
            continue;
        }
        // References section
        if (trimmed.toLowerCase().startsWith('reference') || trimmed.toLowerCase().startsWith('[1]') || trimmed.match(/^\[\d+\]/)) {
            steps.push({ type: 'reference', text: trimmed });
            continue;
        }
        // Regular paragraph
        steps.push({ type: 'text', text: trimmed });
    }
    return steps;
}

export const WordOnlineSkill: AgentSkill = {
    name: 'word_online',
    description: `Opens Microsoft Word Online in the browser and creates a document by typing content and applying formatting like a human — using keyboard shortcuts (Ctrl+Alt+1 for Heading1, Ctrl+B for bold etc.) and toolbar clicks. This is the AGENTICA browser-based approach for Word, perfect for school/college projects with full formatting control. Use this when user says "open in Word", "type in Word", "use Word website", or "create in Word Online".`,
    example: `<tool_call>
{"action": "word_online", "title": "Computer Networks", "document_type": "college", "sections": [{"heading": "Introduction", "heading_level": 1, "content": "Computer networks connect devices...\\n\\n1. LAN - Local Area Network\\n2. WAN - Wide Area Network"}, {"heading": "What is OSI Model?", "heading_level": 2, "marks": 16, "content": "Introduction:\\nThe OSI Model is...\\n\\nDefinition:\\nOSI (Open Systems Interconnection) model...\\n\\nLayers:\\n- Physical Layer\\n- Data Link Layer\\n\\nConclusion:\\nThe OSI model provides a framework...\\n\\nReferences:\\n[1] Forouzan, B.A. (2007). Data Communications and Networking\\n[2] Tanenbaum, A.S. (2011). Computer Networks"}]}
</tool_call>`,
    execute: async (args: any) => {
        if (!args.sections || !Array.isArray(args.sections)) {
            return 'Error: sections array is required. Each section needs { heading, content }';
        }

        // ── BUILD THE BROWSER AUTOMATION SCRIPT ──────────────────────────────
        // We generate a step-by-step plan for the browser subagent to execute.
        // The browser skill will open Word Online and type everything.

        const docTitle = args.title || 'ATCLI Document';
        const docType  = args.document_type || 'college';

        // Build the full browser task description
        let browserTask = `## ATCLI Word Online Automation Task\n\n`;
        browserTask += `Open Microsoft Word Online and create a document with the following content.\n\n`;
        browserTask += `### STEP 1: Open Word Online\n`;
        browserTask += `Navigate to https://word.new in the browser. This opens a blank Word document directly.\n`;
        browserTask += `If it redirects to sign-in, look for "Sign in" or use the existing Microsoft session.\n`;
        browserTask += `Wait for the Word Online editor to fully load — you'll see a blank white page with a toolbar at the top.\n\n`;

        browserTask += `### STEP 2: Click inside the document area\n`;
        browserTask += `Click once in the center of the blank white document area to place the cursor there.\n\n`;

        browserTask += `### STEP 3: Type the document content using these EXACT steps:\n\n`;

        let stepNum = 1;

        // Title
        browserTask += `**Step ${stepNum++}: Document Title**\n`;
        browserTask += `Press Ctrl+Alt+1 to apply Heading 1 style.\n`;
        browserTask += `Press Ctrl+E to center-align.\n`;
        browserTask += `Type exactly: ${docTitle}\n`;
        browserTask += `Press Enter twice.\n\n`;

        // Reset to normal text
        browserTask += `**Step ${stepNum++}: Reset to Normal text**\n`;
        browserTask += `Press Ctrl+Alt+0 to switch back to Normal paragraph style.\n`;
        browserTask += `Press Ctrl+L to left-align.\n\n`;

        // Each section
        for (const section of args.sections) {
            const content = section.content || section.text || '';
            const headingLevel = section.heading_level || section.level || 2;
            const headingText = section.heading || section.title || '';
            const marks = section.marks || 0;

            if (headingText) {
                browserTask += `**Step ${stepNum++}: Section Heading — "${headingText}"${marks ? ` [${marks} Marks]` : ''}**\n`;
                browserTask += `Press Ctrl+Alt+${headingLevel} to apply Heading ${headingLevel} style.\n`;
                browserTask += `Type exactly: ${headingText}${marks ? ` [${marks} Marks]` : ''}\n`;
                browserTask += `Press Enter.\n`;
                browserTask += `Press Ctrl+Alt+0 to return to Normal style.\n\n`;
            }

            // Parse content into steps
            const contentSteps = parseContentToSteps(content);
            for (const step of contentSteps) {
                if (step.type === 'blank') {
                    browserTask += `Press Enter.\n`;
                    continue;
                }
                if (step.type === 'heading') {
                    browserTask += `**Step ${stepNum++}: Subheading — "${step.text}"**\n`;
                    browserTask += `Press Ctrl+Alt+${step.level || 2} to apply Heading ${step.level || 2}.\n`;
                    browserTask += `Type exactly: ${step.text}\n`;
                    browserTask += `Press Enter.\n`;
                    browserTask += `Press Ctrl+Alt+0 to return to Normal.\n\n`;
                    continue;
                }
                if (step.type === 'bullet') {
                    browserTask += `**Step ${stepNum++}: Bullet Point**\n`;
                    browserTask += `Click the "Bullets" button in the toolbar (Home tab → Paragraph section), OR press Tab at the start of the line.\n`;
                    browserTask += `Type exactly: ${step.text}\n`;
                    browserTask += `Press Enter.\n\n`;
                    continue;
                }
                if (step.type === 'numbered') {
                    browserTask += `**Step ${stepNum++}: Numbered List Item**\n`;
                    browserTask += `Click the "Numbered List" button in the toolbar (Home tab → Paragraph section).\n`;
                    browserTask += `Type exactly: ${step.text}\n`;
                    browserTask += `Press Enter.\n\n`;
                    continue;
                }
                if (step.type === 'reference') {
                    browserTask += `**Step ${stepNum++}: Reference**\n`;
                    browserTask += `Press Ctrl+I to start italic (references are typically in italic).\n`;
                    browserTask += `Type exactly: ${step.text}\n`;
                    browserTask += `Press Ctrl+I to stop italic.\n`;
                    browserTask += `Press Enter.\n\n`;
                    continue;
                }
                if (step.type === 'text') {
                    browserTask += `**Step ${stepNum++}: Paragraph Text**\n`;
                    browserTask += `Press Ctrl+J to justify-align the text.\n`;
                    browserTask += `Type exactly: ${step.text}\n`;
                    browserTask += `Press Enter.\n\n`;
                    continue;
                }
            }
            browserTask += `Press Enter.\n\n`;
        }

        browserTask += `### STEP 4: Save the document\n`;
        browserTask += `Press Ctrl+S to save. In Word Online, it auto-saves to OneDrive.\n`;
        browserTask += `If prompted for filename, type: ${docTitle.replace(/[^a-zA-Z0-9\s]/g, '').trim()}\n\n`;

        browserTask += `### STEP 5: Take a screenshot and return\n`;
        browserTask += `Take a screenshot of the completed document and return the URL of the document if available.\n`;
        browserTask += `Report back: "Word Online document created successfully. Title: ${docTitle}. Sections: ${args.sections.length}"\n\n`;

        browserTask += `### IMPORTANT RULES:\n`;
        browserTask += `- Type content EXACTLY as given — do not paraphrase or summarize\n`;
        browserTask += `- Apply keyboard shortcuts BEFORE typing the text for that paragraph\n`;
        browserTask += `- Wait for each action to complete before the next\n`;
        browserTask += `- If Word Online is slow, wait 2 seconds between sections\n`;
        browserTask += `- If any step fails, take a screenshot and continue with the next step\n`;

        // Save the task to a temp file for reference
        const safeRoot = (global as any).atcli_project_root || process.cwd();
        const taskFile = path.join(safeRoot, '.atcli', 'word_online_task.md');
        try {
            fs.mkdirSync(path.join(safeRoot, '.atcli'), { recursive: true });
            fs.writeFileSync(taskFile, browserTask, 'utf-8');
        } catch { /* ignore */ }

        // ── RETURN THE BROWSER TASK AS SPECIAL PAYLOAD ────────────────────────
        // The AgentLoop's browser subagent will receive this task description.
        // We return it in a format that tells the AI exactly what to do with the browser.
        return [
            `🌐 [WORD ONLINE] Browser automation task ready!`,
            ``,
            `The browser subagent will now:`,
            `  1. Open https://word.new (Microsoft Word Online)`,
            `  2. Type ${args.sections.length} sections with proper formatting`,
            `  3. Apply headings (Ctrl+Alt+1/2/3), bold, justify alignment`,
            `  4. Save the document to OneDrive`,
            ``,
            `📋 Full task saved to: ${taskFile}`,
            ``,
            `NEXT ACTION REQUIRED: Use the browser_open_url or browser_navigate tool to open https://word.new, then follow the task steps in ${taskFile}`,
            ``,
            `--- BROWSER TASK INSTRUCTIONS ---`,
            browserTask,
        ].join('\n');
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// OPEN DOCX IN WORD (DESKTOP)
// After create_word_doc generates a .docx, this skill opens it in MS Word
// ─────────────────────────────────────────────────────────────────────────────
export const OpenInWordSkill: AgentSkill = {
    name: 'open_in_word',
    description: 'Opens a .docx file in Microsoft Word (desktop) or the default Word viewer on Windows. Use this after create_word_doc to show the user the finished document.',
    example: `<tool_call>\n{"action": "open_in_word", "path": "my_project.docx"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path) return 'Error: path to .docx file is required';
        const { exec } = await import('child_process');
        const safeRoot = (global as any).atcli_project_root || process.cwd();
        const filePath = path.resolve(safeRoot, args.path);

        if (!fs.existsSync(filePath)) {
            return `Error: File not found: ${filePath}`;
        }

        return new Promise<string>((resolve) => {
            // Windows: start opens file with default app (MS Word, LibreOffice, etc.)
            const cmd = process.platform === 'win32'
                ? `start "" "${filePath}"`
                : process.platform === 'darwin'
                    ? `open "${filePath}"`
                    : `xdg-open "${filePath}"`;

            exec(cmd, (err) => {
                if (err) {
                    resolve(`Error opening file: ${err.message}\nFile is at: ${filePath}`);
                } else {
                    resolve([
                        `✅ Opening ${path.basename(filePath)} in Microsoft Word...`,
                        `📄 File path: ${filePath}`,
                        ``,
                        `The document should now be open in Word. You can:`,
                        `  • Edit content directly in Word`,
                        `  • Apply additional formatting`,
                        `  • Print or export as PDF`,
                        `  • Save to OneDrive for sharing`,
                    ].join('\n'));
                }
            });
        });
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// OPEN IN EXPLORER (FILE MANAGER) SKILL
// Opens Windows File Explorer and highlights the file so user can see it.
// Use after create_word_doc when user says "show in file manager", "open folder", etc.
// ─────────────────────────────────────────────────────────────────────────────
export const OpenInExplorerSkill: AgentSkill = {
    name: 'open_in_explorer',
    description: `Opens Windows File Explorer (File Manager) and selects/highlights a file so the user can see it.
Use this when:
- User says "show in file manager", "open folder", "show me the file", "file manager la open pannu"
- After create_word_doc to show the user where the .docx was saved
Arguments:
  path (string): file or folder to show (relative to project root or absolute)`,
    example: `<tool_call>\n{"action": "open_in_explorer", "path": "Open_AI_in_Healthcare_15_Pages.docx"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.path) return 'Error: path is required';
        const { exec } = await import('child_process');
        const safeRoot = (global as any).atcli_project_root || process.cwd();
        const filePath = path.resolve(safeRoot, args.path);

        if (!fs.existsSync(filePath)) {
            const parentDir = path.dirname(filePath);
            if (fs.existsSync(parentDir)) {
                return new Promise<string>((resolve) => {
                    exec(`explorer "${parentDir}"`, (err) => {
                        if (err) resolve(`Could not open Explorer: ${err.message}\nFolder: ${parentDir}`);
                        else resolve(`📂 Opened parent folder in File Explorer: ${parentDir}`);
                    });
                });
            }
            return `Error: Path not found: ${filePath}`;
        }

        const isDir = fs.statSync(filePath).isDirectory();

        return new Promise<string>((resolve) => {
            let cmd: string;
            if (process.platform === 'win32') {
                cmd = isDir ? `explorer "${filePath}"` : `explorer /select,"${filePath}"`;
            } else if (process.platform === 'darwin') {
                cmd = isDir ? `open "${filePath}"` : `open -R "${filePath}"`;
            } else {
                cmd = `xdg-open "${isDir ? filePath : path.dirname(filePath)}"`;
            }
            exec(cmd, (err) => {
                if (err) resolve(`Error opening File Manager: ${err.message}\nPath: ${filePath}`);
                else resolve([
                    `✅ Opened File Manager — file highlighted:`,
                    `📁 ${filePath}`,
                    ``,
                    `The file is now visible and selected in your Windows File Explorer.`,
                ].join('\n'));
            });
        });
    },
};
