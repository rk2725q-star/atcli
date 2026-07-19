import { AgentSkill } from './base';
import * as path from 'path';
import * as fs from 'fs';
import { ApiRouter } from '../../providers/api-router';

// ─────────────────────────────────────────────────────────────────────────────
// READ MEDIA SKILL (Multimodal Vision)
// Allows the AI to read local image and document files by delegating to the 
// active API provider (or browser scraper) natively.
// ─────────────────────────────────────────────────────────────────────────────
export const ReadMediaSkill: AgentSkill = {
    name: 'read_media',
    description: `Natively reads local media files (images/PDFs) and uses the active Vision-capable LLM to describe them or answer questions about them.
Supports: .png, .jpg, .jpeg, .webp (if provider supports it).
Use this to analyze screenshots, mockups, or documents.

Arguments:
  path (string): absolute or relative path to the media file
  query (string): what you want to know about the image (e.g., "Describe the UI layout", "Find the bug in this screenshot")`,
    example: `<tool_call>\n{"action": "read_media", "path": "src/assets/logo.png", "query": "What are the primary hex colors used in this logo?"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.path) return 'Error: path is required';
        if (!args.query) return 'Error: query is required';

        const cwd = (global as any).atcli_project_root || process.cwd();
        const fullPath = path.resolve(cwd, args.path);
        
        if (!fs.existsSync(fullPath)) return `Error: File not found at ${fullPath}`;

        const ext = path.extname(fullPath).toLowerCase();
        const validExts = ['.png', '.jpg', '.jpeg', '.webp']; // Start with image support
        
        if (!validExts.includes(ext)) {
            return `Error: Unsupported media type ${ext}. Currently supported: ${validExts.join(', ')}`;
        }

        try {
            console.log(`\n👀 [Vision] Reading media file: ${args.path}...`);
            
            // Read file into base64
            const fileData = fs.readFileSync(fullPath);
            const base64Data = fileData.toString('base64');
            
            // Determine mime type
            let mimeType = 'image/png';
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.webp') mimeType = 'image/webp';

            // Prefix format depends on provider implementation. 
            // In ATCLI, BaseBrowserAdapter supports '__BASE64__<data>'.
            // API providers need base64, we will pass it using ATCLI's standard __BASE64__ prefix logic
            const imagePayload = `__BASE64__${base64Data}`;
            
            // Get active provider via ApiRouter
            const router = ApiRouter.getInstance();
            
            console.log(`   [Vision] Delegating to ApiRouter for multimodal analysis...`);
            
            // Send the isolated message through the unified router
            const prompt = `[SYSTEM: Analyze the attached image for the user's specific request.]\n\nUser Request: ${args.query}`;
            const response = await router.sendImageAndMessage(imagePayload, prompt);

            if (response.error) {
                return `[VISION AGENT ERROR]: ${response.error}`;
            }

            return `[VISION AGENT RESULT]:\n${response.text}`;

        } catch (err: any) {
            return `[VISION AGENT FATAL ERROR]: ${err.message}`;
        }
    },
};
