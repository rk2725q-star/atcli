import { AgentSkill } from './base';
import * as https from 'https';
import * as http from 'http';
import * as url from 'url';

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK SKILL — Full HTTP/REST API calls (OpenClaw network capability)
// ─────────────────────────────────────────────────────────────────────────────
export const HttpRequestSkill: AgentSkill = {
    name: 'http_request',
    description: `Makes HTTP/HTTPS requests (GET, POST, PUT, DELETE, PATCH) to any URL.
Full REST API capability — OpenClaw network requests.
Arguments:
  url (string): full URL
  method (string, optional): GET/POST/PUT/DELETE/PATCH (default: GET)
  headers (object, optional): request headers
  body (string|object, optional): request body for POST/PUT
  timeout (number, optional): timeout in ms (default 10000)`,
    example: `<tool_call>\n{"action": "http_request", "url": "https://api.github.com/repos/rk2725q-star/atcli", "method": "GET"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.url) return 'Error: url is required';
        const method = (args.method || 'GET').toUpperCase();
        const timeout = args.timeout || 10000;
        const parsed = new url.URL(args.url);
        const isHttps = parsed.protocol === 'https:';
        const bodyStr = args.body
            ? (typeof args.body === 'string' ? args.body : JSON.stringify(args.body))
            : undefined;

        const options: any = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + (parsed.search || ''),
            method,
            headers: {
                'User-Agent': 'ATCLI-NetworkAgent/1.0',
                'Accept': 'application/json, text/plain, */*',
                ...(args.headers || {}),
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr), 'Content-Type': 'application/json' } : {}),
            },
        };

        return new Promise<string>((resolve) => {
            const transport = isHttps ? https : http;
            let data = '';
            const req = transport.request(options, (res) => {
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    const preview = data.substring(0, 3000);
                    resolve([
                        `HTTP ${method} ${args.url}`,
                        `Status: ${res.statusCode} ${res.statusMessage}`,
                        `Response:\n${preview}`,
                        data.length > 3000 ? `\n...[TRUNCATED — ${data.length} total chars]` : '',
                    ].join('\n'));
                });
            });
            req.on('error', (err) => resolve(`HTTP Error: ${err.message}`));
            req.setTimeout(timeout, () => { req.destroy(); resolve(`Timeout after ${timeout}ms`); });
            if (bodyStr) req.write(bodyStr);
            req.end();
        });
    },
};
