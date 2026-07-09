import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { FileSystemTools } from '../tools/filesystem';
import { TerminalTools } from '../tools/terminal';
import { Gatekeeper } from '../agent/gatekeeper';

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: MCP broker runs as a stdio server exposed to ALL connected MCP
// clients (Claude Desktop, other agents, etc.). Every tool call MUST pass
// through Gatekeeper before execution — same policy as the CLI path.
// Without this, the entire Gatekeeper wall is dead code on the MCP code path.
// ─────────────────────────────────────────────────────────────────────────────

export class AtcliMcpServer {
    private server: Server;
    private gatekeeper: Gatekeeper;

    constructor() {
        this.server = new Server(
            {
                name: 'atcli-broker',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        // One shared Gatekeeper instance for the lifetime of the MCP server
        this.gatekeeper = new Gatekeeper(process.cwd());

        this.setupToolHandlers();
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'read_file',
                        description: 'Read the contents of a file',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                filePath: { type: 'string', description: 'Path to the file to read' }
                            },
                            required: ['filePath']
                        }
                    },
                    {
                        name: 'write_file',
                        description: 'Write content to a file',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                filePath: { type: 'string', description: 'Path to the file to write' },
                                content: { type: 'string', description: 'Content to write' }
                            },
                            required: ['filePath', 'content']
                        }
                    },
                    {
                        name: 'run_command',
                        description: 'Run a terminal command',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                command: { type: 'string', description: 'The command to execute' }
                            },
                            required: ['command']
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                if (request.params.name === 'read_file') {
                    const args = request.params.arguments as { filePath: string };

                    // Gate: check sensitive file patterns (no write_file action needed — read of .env/.ssh still dangerous)
                    const gate = this.gatekeeper.validate(
                        { action: 'write_file', path: args.filePath }, // write_file action triggers all path checks
                        'mcp-broker'
                    );
                    // For reads we only block sensitive/system files, not destructive cmds
                    // Re-check specifically for sensitive file read
                    const readGate = this.gatekeeper.validate(
                        { action: 'read_file', path: args.filePath, command: `cat ${args.filePath}` },
                        'mcp-broker'
                    );
                    if (!readGate.allowed) {
                        return { content: [{ type: 'text', text: `🔒 GATEKEEPER BLOCKED: ${readGate.reason}` }], isError: true };
                    }

                    const content = await FileSystemTools.readFile(args.filePath);
                    return { content: [{ type: 'text', text: content }] };
                }

                if (request.params.name === 'write_file') {
                    const args = request.params.arguments as { filePath: string; content: string };

                    // Gate: full write validation — protected system paths, .env, SSH keys, self-mod block
                    const gate = this.gatekeeper.validate(
                        { action: 'write_file', path: args.filePath },
                        'mcp-broker'
                    );
                    if (!gate.allowed) {
                        return { content: [{ type: 'text', text: `🔒 GATEKEEPER BLOCKED: ${gate.reason}` }], isError: true };
                    }

                    await FileSystemTools.writeFile(args.filePath, args.content);
                    return { content: [{ type: 'text', text: `Successfully wrote to ${args.filePath}` }] };
                }

                if (request.params.name === 'run_command') {
                    const args = request.params.arguments as { command: string };

                    // Gate: full command validation — destructive patterns, injection, process kill, secrets
                    const gate = this.gatekeeper.validate(
                        { action: 'run_command', command: args.command },
                        'mcp-broker'
                    );
                    if (!gate.allowed) {
                        return { content: [{ type: 'text', text: `🔒 GATEKEEPER BLOCKED: ${gate.reason}` }], isError: true };
                    }

                    // If secrets detected, use the masked command (secrets stripped before execution logging)
                    const safeCommand = gate.masked?.command ?? args.command;
                    const output = await TerminalTools.runCommand(safeCommand);
                    return { content: [{ type: 'text', text: output }] };
                }

                throw new Error(`Unknown tool: ${request.params.name}`);
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `Error executing tool: ${error.message}` }],
                    isError: true,
                };
            }
        });
    }

    public async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('ATCLI MCP Server running on stdio');
    }
}
