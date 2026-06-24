import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { FileSystemTools } from '../tools/filesystem';
import { TerminalTools } from '../tools/terminal';

export class AtcliMcpServer {
    private server: Server;

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
                    const content = await FileSystemTools.readFile(args.filePath);
                    return { content: [{ type: 'text', text: content }] };
                }

                if (request.params.name === 'write_file') {
                    const args = request.params.arguments as { filePath: string; content: string };
                    await FileSystemTools.writeFile(args.filePath, args.content);
                    return { content: [{ type: 'text', text: `Successfully wrote to ${args.filePath}` }] };
                }

                if (request.params.name === 'run_command') {
                    const args = request.params.arguments as { command: string };
                    const output = await TerminalTools.runCommand(args.command);
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
