import { AgentSkill } from './base';

export const FetchUrlSkill: AgentSkill = {
    name: 'fetch_url',
    description: 'Fetches the content of a public URL. Use this to read documentation, API references, or web pages.',
    example: `<tool_call>\n{"action": "fetch_url", "url": "https://example.com/docs"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.url) return "Error: url is required";
        try {
            const response = await fetch(args.url);
            if (!response.ok) {
                return `Error: HTTP ${response.status} ${response.statusText}`;
            }
            const html = await response.text();
            
            // Basic HTML to Text extraction to save tokens
            const text = html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
                .replace(/<[^>]+>/g, ' ') // Remove all HTML tags
                .replace(/\s+/g, ' ') // Collapse whitespace
                .trim();
            
            // Limit output size to prevent memory overflow
            if (text.length > 50000) {
                return text.substring(0, 50000) + "\n\n...[Content Truncated due to size limits]...";
            }
            return text;
        } catch (e: any) {
            return `Error fetching URL: ${e.message}`;
        }
    }
};
