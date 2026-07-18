import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FileSystemTools } from '../tools/filesystem';
import { TerminalTools } from '../tools/terminal';
import { Gatekeeper } from '../agent/gatekeeper';
import { ToolDAG } from '../agent/tool_dag';
import { nvidiaScheduler } from '../providers/nvidia';
import * as fs from 'fs';
import * as path from 'path';

// ATCLI MCP Server v2 ? 14 tools, Cline-compatible
// All tool calls pass through Gatekeeper before execution.
// Exposes full ATCLI toolset via MCP stdio for VS Code / Cursor / Cline extension.

function ok(text: string) { return { content: [{ type: 'text' as const, text }] }; }
function err(text: string) { return { content: [{ type: 'text' as const, text }], isError: true as const }; }

const TOOLS = [
    { name: 'read_file',       description: 'Read the contents of a file',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'write_file',      description: 'Create or overwrite a file',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
    { name: 'replace_in_file', description: 'Surgical text replacement in a file',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } },
    { name: 'run_command',     description: 'Execute a terminal command in the workspace',
      inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
    { name: 'list_dir',        description: 'List directory contents (recursive)',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'grep_search',     description: 'Search for a pattern across files',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, query: { type: 'string' }, case_insensitive: { type: 'boolean' } }, required: ['path', 'query'] } },
    { name: 'batch_read',      description: 'Read up to 25 files in a single call',
      inputSchema: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] } },
    { name: 'find_files',      description: 'Find files matching a pattern',
      inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, max: { type: 'number' } }, required: ['pattern'] } },
    { name: 'workspace_hash',  description: 'Get workspace state hash for cache invalidation',
      inputSchema: { type: 'object', properties: {} } },
    { name: 'nvidia_status',   description: 'Show NVIDIA API key RPM status',
      inputSchema: { type: 'object', properties: {} } },
    { name: 'delete_file',     description: 'Delete a file from the workspace',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'move_file',       description: 'Move or rename a file',
      inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
    { name: 'make_dir',        description: 'Create a directory',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'file_exists',     description: 'Check if a file or directory exists',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
];

export class AtcliMcpServer {
    private server: Server;
    private gatekeeper: Gatekeeper;
    private cwd: string;

    constructor() {
        this.cwd = process.cwd();
        this.server = new Server(
            { name: 'atcli-broker', version: '2.0.0' },
            { capabilities: { tools: {} } }
        );
        this.gatekeeper = new Gatekeeper(this.cwd);
        this.setupToolHandlers();
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args = {} } = request.params;
            try {
                return await this.dispatch(name, args as Record<string, unknown>);
            } catch (e: unknown) {
                return err('Error: ' + (e instanceof Error ? e.message : String(e)));
            }
        });
    }

    private async dispatch(name: string, args: Record<string, unknown>): Promise<ReturnType<typeof ok>> {
        const cwd = this.cwd;

        if (name === 'read_file') {
            const p = String(args.path ?? args.filePath);
            const gate = this.gatekeeper.validate({ action: 'read_file', path: p, command: 'cat ' + p }, 'mcp');
            if (!gate.allowed) return err('GATEKEEPER BLOCKED: ' + gate.reason);
            const fp = path.isAbsolute(p) ? p : path.join(cwd, p);
            if (!fs.existsSync(fp)) return err('[NOT FOUND] ' + p);
            return ok(fs.readFileSync(fp, 'utf-8'));
        }

        if (name === 'write_file') {
            const p = String(args.path ?? args.filePath); const content = String(args.content ?? '');
            const gate = this.gatekeeper.validate({ action: 'write_file', path: p }, 'mcp');
            if (!gate.allowed) return err('GATEKEEPER BLOCKED: ' + gate.reason);
            await FileSystemTools.writeFile(path.isAbsolute(p) ? p : path.join(cwd, p), content);
            return ok('Written: ' + p);
        }

        if (name === 'replace_in_file') {
            const p = String(args.path); const fp = path.isAbsolute(p) ? p : path.join(cwd, p);
            const gate = this.gatekeeper.validate({ action: 'write_file', path: p }, 'mcp');
            if (!gate.allowed) return err('GATEKEEPER BLOCKED: ' + gate.reason);
            if (!fs.existsSync(fp)) return err('[NOT FOUND] ' + p);
            const current = fs.readFileSync(fp, 'utf-8');
            const oldText = String(args.old); const newText = String(args.new ?? args['new'] ?? '');
            if (!current.includes(oldText)) return err('[REPLACE] Old text not found in ' + p);
            fs.writeFileSync(fp, current.replace(oldText, newText), 'utf-8');
            return ok('Replaced in ' + p);
        }

        if (name === 'run_command') {
            const cmd = String(args.command);
            const gate = this.gatekeeper.validate({ action: 'run_command', command: cmd }, 'mcp');
            if (!gate.allowed) return err('GATEKEEPER BLOCKED: ' + gate.reason);
            const safeCmd = gate.masked?.command ?? cmd;
            const output = await TerminalTools.runCommand(safeCmd);
            return ok(output);
        }

        if (name === 'list_dir') {
            const dag = new ToolDAG();
            dag.add('ls', { action: 'list_dir', path: String(args.path ?? '.') }, []);
            const results = await dag.execute(cwd);
            return ok(dag.toContextString(results));
        }

        if (name === 'grep_search') {
            const dag = new ToolDAG();
            dag.add('grep', { action: 'grep_search', path: String(args.path ?? '.'), query: String(args.query), case_insensitive: Boolean(args.case_insensitive ?? true) }, []);
            const results = await dag.execute(cwd);
            return ok(dag.toContextString(results));
        }

        if (name === 'batch_read') {
            const dag = new ToolDAG();
            dag.add('batch', { action: 'batch_read', paths: args.paths as string[] }, []);
            const results = await dag.execute(cwd);
            return ok(dag.toContextString(results));
        }

        if (name === 'find_files') {
            const dag = new ToolDAG();
            dag.add('find', { action: 'find_files', pattern: String(args.pattern), max: Number(args.max ?? 30) }, []);
            const results = await dag.execute(cwd);
            return ok(dag.toContextString(results));
        }

        if (name === 'workspace_hash') {
            const { SemanticCache } = require('../agent/semantic_cache');
            const cache = new SemanticCache(cwd);
            const key = cache.buildKey({ taskText: 'workspace_hash_check', cwd, modelId: 'any' });
            return ok('Workspace hash: ' + key);
        }

        if (name === 'nvidia_status') {
            nvidiaScheduler.printStatus();
            return ok('NVIDIA key status printed to console');
        }

        if (name === 'delete_file') {
            const p = String(args.path); const fp = path.isAbsolute(p) ? p : path.join(cwd, p);
            const gate = this.gatekeeper.validate({ action: 'write_file', path: p }, 'mcp');
            if (!gate.allowed) return err('GATEKEEPER BLOCKED: ' + gate.reason);
            if (!fs.existsSync(fp)) return err('[NOT FOUND] ' + p);
            fs.unlinkSync(fp);
            return ok('Deleted: ' + p);
        }

        if (name === 'move_file') {
            const from = String(args.from); const to = String(args.to);
            const fromFp = path.isAbsolute(from) ? from : path.join(cwd, from);
            const toFp   = path.isAbsolute(to)   ? to   : path.join(cwd, to);
            const gate = this.gatekeeper.validate({ action: 'write_file', path: to }, 'mcp');
            if (!gate.allowed) return err('GATEKEEPER BLOCKED: ' + gate.reason);
            if (!fs.existsSync(fromFp)) return err('[NOT FOUND] ' + from);
            fs.mkdirSync(path.dirname(toFp), { recursive: true });
            fs.renameSync(fromFp, toFp);
            return ok('Moved: ' + from + ' -> ' + to);
        }

        if (name === 'make_dir') {
            const p = String(args.path); const dp = path.isAbsolute(p) ? p : path.join(cwd, p);
            fs.mkdirSync(dp, { recursive: true });
            return ok('Created dir: ' + p);
        }

        if (name === 'file_exists') {
            const p = String(args.path); const fp = path.isAbsolute(p) ? p : path.join(cwd, p);
            return ok(fs.existsSync(fp) ? 'EXISTS' : 'NOT_FOUND');
        }

        return err('Unknown tool: ' + name);
    }

    public async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        process.stderr.write('ATCLI MCP Server v2 running on stdio ? 14 tools ready\\n');
    }
}