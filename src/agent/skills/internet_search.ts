import { AgentSkill } from './base';

export const InternetSearchSkill: AgentSkill = {
    name: 'search_internet',
    description: 'Searches the internet globally using DuckDuckGo to find documentation, API references, research, or missing skills. Auto-call this when you encounter unfamiliar frameworks or missing tools to prevent breaking code.',
    example: `<tool_call>\n{"action": "search_internet", "query": "react best practices"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.query) return "Error: query is required";
        try {
            console.log(`\n🔍 [ATCLI] Searching internet for: '${args.query}'...`);
            
            const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            
            if (!response.ok) {
                return `Error fetching search results: HTTP ${response.status}`;
            }
            
            const html = await response.text();
            
            // Native regex-based parsing for DuckDuckGo HTML structure
            const resultRegex = /<a rel="nofollow" class="result__a" href="[^"]*">([^<]+)<\/a>.*?<a class="result__snippet"[^>]*>(.*?)<\/a>/gs;
            let match;
            let results = [];
            let count = 0;
            
            while ((match = resultRegex.exec(html)) !== null && count < 10) {
                const title = match[1].replace(/<[^>]+>/g, '').trim();
                const snippet = match[2].replace(/<[^>]+>/g, '').trim();
                
                // Duckduckgo URLs are nested in href="//duckduckgo.com/l/?uddg=..."
                // We'll extract it if possible, but the snippet and title are most important.
                const urlMatch = match[0].match(/uddg=([^&]+)/);
                const actualUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : 'Unknown URL';
                
                results.push(`### ${title}\nURL: ${actualUrl}\n${snippet}\n`);
                count++;
            }
            
            if (results.length === 0) {
                return `No search results found for: ${args.query}`;
            }
            
            return `Search Results for '${args.query}':\n\n${results.join('\n')}\n\n(Note: If you need to read the full page, use the 'fetch_url' tool with the provided URL.)`;
        } catch (error: any) {
            return `Search error: ${error.message}`;
        }
    }
};
