import * as fs from 'fs';
import * as path from 'path';
import { ToolDAG } from './tool_dag';

// SmartPlanner ? 5-stage pipeline for zero-API task pre-fetching
// Stage 1: IntentClassifier  ? classify what the user wants
// Stage 2: TaskGraph         ? build dependency tree of needed information
// Stage 3: ToolPredictor     ? map each node to a concrete tool call
// Stage 4: Confidence Score  ? decide: full batch / partial / minimal
// Stage 5: DependencyResolver ? build final parallel ToolDAG with waves

export type IntentType =
    | 'DEBUGGING'   // fix, error, bug, crash, TypeError
    | 'BUILD'       // create, build, add, implement, generate
    | 'REFACTOR'    // refactor, rename, move, clean
    | 'DELETE'      // delete, remove, clear
    | 'SEARCH'      // find, where, which, grep
    | 'CONFIG'      // configure, setup, install
    | 'ANALYSIS'    // explain, audit, review, summarize
    | 'CHAT'        // hi, hello, thanks, casual
    | 'UNKNOWN';

export interface PlannerResult {
    intent: IntentType;
    confidence: number;       // 0-100
    dag: ToolDAG;
    strategy: 'full_batch' | 'partial_batch' | 'minimal_discovery' | 'direct_llm';
    reasoning: string;
}

interface TaskNode {
    id: string;
    description: string;
    tool: string;
    args: Record<string, unknown>;
    deps: string[];
    confidence: number;
}

// Intent classification patterns
const INTENT_PATTERNS: Record<IntentType, string[]> = {
    DEBUGGING:  ['fix', 'error', 'bug', 'crash', 'undefined', 'typeerror', 'cannot', 'failed', 'issue', 'broken', 'not working', 'exception', 'stack trace'],
    BUILD:      ['build', 'create', 'add', 'implement', 'generate', 'make', 'write', 'develop', 'setup project', 'new component', 'new page', 'new api'],
    REFACTOR:   ['refactor', 'rename', 'move', 'reorganize', 'clean', 'simplify', 'restructure', 'extract', 'split'],
    DELETE:     ['delete', 'remove', 'clear', 'clean up', 'wipe', 'purge', 'drop', 'erase'],
    SEARCH:     ['find', 'where', 'which file', 'search', 'locate', 'grep', 'show me', 'list all'],
    CONFIG:     ['configure', 'setup', 'install', 'enable', 'disable', 'env', 'environment', '.env', 'settings'],
    ANALYSIS:   ['explain', 'audit', 'review', 'summarize', 'analyze', 'describe', 'what does', 'how does', 'understand'],
    CHAT:       ['hi', 'hello', 'hey', 'thanks', 'thank you', 'good', 'ok', 'okay', 'great', 'how are you'],
    UNKNOWN:    [],
};

export class SmartPlanner {
    private cwd: string;

    constructor(cwd: string) { this.cwd = cwd; }

    /** Main entry point ? runs all 5 stages and returns a ready-to-execute ToolDAG */
    async plan(userMessage: string, memoryContext?: string): Promise<PlannerResult> {
        // Stage 1: IntentClassifier
        const { intent, confidence: intentScore } = this.classifyIntent(userMessage);

        // Stage 2: TaskGraph ? generate information dependency tree
        const taskNodes = this.buildTaskGraph(intent, userMessage, memoryContext);

        // Stage 3: ToolPredictor ? verify file existence, filter impossible nodes
        const validatedNodes = this.validateNodes(taskNodes);

        // Stage 4: Confidence Score
        const confidence = this.computeConfidence(intent, intentScore, validatedNodes);

        // Stage 5: DependencyResolver ? build ToolDAG
        const dag = new ToolDAG();
        const strategy = this.decideStrategy(confidence, intent);

        if (strategy === 'full_batch' || strategy === 'partial_batch') {
            const nodesToRun = strategy === 'full_batch'
                ? validatedNodes
                : validatedNodes.filter(n => n.confidence >= 60);
            for (const node of nodesToRun) {
                dag.add(node.id, { action: node.tool, ...node.args }, node.deps);
            }
        } else if (strategy === 'minimal_discovery') {
            // Only run list_dir to orient the LLM
            dag.add('discovery_ls', { action: 'list_dir', path: '.' }, []);
        }
        // 'direct_llm' = empty DAG, no pre-fetch

        const reasoning = this.buildReasoning(intent, confidence, strategy, validatedNodes);
        process.stdout.write('[SmartPlanner] Intent=' + intent + ' Confidence=' + confidence + '% Strategy=' + strategy + '\\n');

        return { intent, confidence, dag, strategy, reasoning };
    }

    // ?? Stage 1: IntentClassifier ??????????????????????????????????????????????
    private classifyIntent(msg: string): { intent: IntentType; confidence: number } {
        const lower = msg.toLowerCase();
        let bestIntent: IntentType = 'UNKNOWN';
        let bestScore = 0;

        for (const [intent, patterns] of Object.entries(INTENT_PATTERNS) as [IntentType, string[]][]) {
            if (intent === 'UNKNOWN') continue;
            let score = 0;
            for (const p of patterns) {
                if (lower.includes(p)) score += p.split(' ').length; // multi-word patterns score higher
            }
            if (score > bestScore) { bestScore = score; bestIntent = intent; }
        }

        // Confidence: scale by how strong the signal is
        const confidence = Math.min(95, bestScore * 20);
        return { intent: bestIntent, confidence };
    }

    // ?? Stage 2: TaskGraph ?????????????????????????????????????????????????????
    private buildTaskGraph(intent: IntentType, msg: string, memory?: string): TaskNode[] {
        const nodes: TaskNode[] = [];
        const lower = msg.toLowerCase();

        // Always-useful discovery nodes (high confidence)
        nodes.push({ id: 'ls_root', description: 'List workspace root', tool: 'list_dir', args: { path: '.' }, deps: [], confidence: 90 });
        nodes.push({ id: 'pkg_json', description: 'Read package.json', tool: 'read_file', args: { path: 'package.json' }, deps: [], confidence: 85 });

        if (intent === 'DEBUGGING') {
            // Extract keywords from user message for targeted grep
            const keywords = this.extractKeywords(msg, ['fix', 'error', 'bug', 'issue', 'crash']);
            for (const kw of keywords.slice(0, 3)) {
                nodes.push({ id: 'grep_' + kw, description: 'Search for ' + kw, tool: 'grep_search', args: { path: '.', query: kw, case_insensitive: true }, deps: [], confidence: 80 });
            }
            nodes.push({ id: 'grep_error', description: 'Search error patterns', tool: 'grep_search', args: { path: '.', query: 'Error|throw|catch|reject', case_insensitive: false }, deps: [], confidence: 70 });
            // Read auth/login related files if auth-related
            if (lower.includes('login') || lower.includes('auth') || lower.includes('jwt') || lower.includes('session')) {
                nodes.push({ id: 'grep_auth', description: 'Find auth files', tool: 'grep_search', args: { path: '.', query: 'auth|login|jwt|session', case_insensitive: true }, deps: [], confidence: 85 });
                nodes.push({ id: 'ls_auth', description: 'List auth directory', tool: 'list_dir', args: { path: 'src/auth' }, deps: ['grep_auth'], confidence: 65 });
                nodes.push({ id: 'env_example', description: 'Read .env.example', tool: 'read_file', args: { path: '.env.example' }, deps: [], confidence: 60 });
            }
        }

        if (intent === 'BUILD') {
            nodes.push({ id: 'ls_src', description: 'List src directory', tool: 'list_dir', args: { path: 'src' }, deps: ['ls_root'], confidence: 80 });
            nodes.push({ id: 'tsconfig', description: 'Read tsconfig.json', tool: 'read_file', args: { path: 'tsconfig.json' }, deps: [], confidence: 70 });
            // Look for existing similar components
            const buildTarget = this.extractBuildTarget(msg);
            if (buildTarget) {
                nodes.push({ id: 'grep_existing', description: 'Find similar existing code', tool: 'grep_search', args: { path: '.', query: buildTarget, case_insensitive: true }, deps: [], confidence: 65 });
            }
        }

        if (intent === 'REFACTOR') {
            const target = this.extractRefactorTarget(msg);
            if (target) {
                nodes.push({ id: 'grep_target', description: 'Find all uses of ' + target, tool: 'grep_search', args: { path: '.', query: target, case_insensitive: true }, deps: [], confidence: 85 });
            }
            nodes.push({ id: 'ls_src', description: 'List src', tool: 'list_dir', args: { path: 'src' }, deps: [], confidence: 75 });
        }

        if (intent === 'DELETE') {
            // Must list before deleting ? no deps on ls_root since we need it first
            nodes.push({ id: 'ls_detailed', description: 'List all files for deletion review', tool: 'list_dir', args: { path: '.' }, deps: [], confidence: 95 });
        }

        if (intent === 'SEARCH') {
            const searchTerms = this.extractKeywords(msg, ['find', 'where', 'search', 'locate', 'grep', 'show']);
            for (const term of searchTerms.slice(0, 3)) {
                nodes.push({ id: 'grep_s_' + term, description: 'Search for ' + term, tool: 'grep_search', args: { path: '.', query: term, case_insensitive: true }, deps: [], confidence: 85 });
            }
        }

        if (intent === 'CONFIG') {
            nodes.push({ id: 'env_ex', description: 'Read env example', tool: 'read_file', args: { path: '.env.example' }, deps: [], confidence: 80 });
            nodes.push({ id: 'grep_env', description: 'Find env usages', tool: 'grep_search', args: { path: '.', query: 'process.env|dotenv|config', case_insensitive: true }, deps: [], confidence: 70 });
        }

        if (intent === 'ANALYSIS') {
            nodes.push({ id: 'ls_src', description: 'List src', tool: 'list_dir', args: { path: 'src' }, deps: [], confidence: 80 });
            nodes.push({ id: 'readme', description: 'Read README', tool: 'read_file', args: { path: 'README.md' }, deps: [], confidence: 65 });
        }

        return nodes;
    }

    // ?? Stage 3: ToolPredictor / Validator ????????????????????????????????????
    // Stage 3: ToolPredictor / Validator
    private validateNodes(nodes: TaskNode[]): TaskNode[] {
        return nodes.filter(node => {
            if (node.tool === 'list_dir') {
                const p = String(node.args.path ?? '.');
                const dp = path.isAbsolute(p) ? p : path.join(this.cwd, p);
                return fs.existsSync(dp);
            }
            return true;
        });
    }

    // Stage 4: Confidence Score
    private computeConfidence(intent: IntentType, intentScore: number, nodes: TaskNode[]): number {
        if (intent === 'CHAT' || intent === 'UNKNOWN') return 10;
        const avgNodeConf = nodes.length > 0
            ? nodes.reduce((sum, n) => sum + n.confidence, 0) / nodes.length
            : 30;
        return Math.round(intentScore * 0.6 + avgNodeConf * 0.4);
    }

    private decideStrategy(confidence: number, intent: IntentType): 'full_batch' | 'partial_batch' | 'minimal_discovery' | 'direct_llm' {
        if (intent === 'CHAT') return 'direct_llm';
        if (confidence >= 75) return 'full_batch';
        if (confidence >= 40) return 'partial_batch';
        if (confidence >= 20) return 'minimal_discovery';
        return 'direct_llm';
    }

    private extractKeywords(msg: string, stopWords: string[]): string[] {
        const words = msg.toLowerCase().split(/[^a-z0-9_]+/).filter(w => w.length > 3);
        return words.filter(w => !stopWords.includes(w) && !/^(the|this|that|with|from|into|your|have|will|they|been|some|what|when|where|which)$/.test(w));
    }

    private extractBuildTarget(msg: string): string {
        const m = msg.match(/(?:build|create|add|make|write)\\s+(?:a\\s+)?(?:new\\s+)?(\\w+)/i);
        return m ? m[1] : '';
    }

    private extractRefactorTarget(msg: string): string {
        const m = msg.match(/(?:refactor|rename|move|extract)\\s+(\\w+)/i);
        return m ? m[1] : '';
    }

    private buildReasoning(intent: IntentType, confidence: number, strategy: string, nodes: TaskNode[]): string {
        const nodeLines = nodes.slice(0, 6).map(n => '  - ' + n.tool + '(' + JSON.stringify(n.args).substring(0, 60) + ') conf=' + n.confidence + '%');
        return [
            'Intent: ' + intent + ' (confidence ' + confidence + '%)',
            'Strategy: ' + strategy,
            'Pre-fetch plan: ' + nodes.length + ' tools',
            nodeLines.join('\n'),
        ].join('\n');
    }
}