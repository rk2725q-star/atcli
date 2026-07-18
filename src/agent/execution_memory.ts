import * as fs from 'fs';
import * as path from 'path';

// ExecutionMemory ? persists step-level progress so a failed step can be retried
// without restarting the entire plan. Saves 30-50% API calls on failure.

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface StepRecord {
    stepId: number;
    title: string;
    tool: string;
    args: Record<string, unknown>;
    status: StepStatus;
    output?: string;
    error?: string;
    patchApplied?: string;
    startedAt?: string;
    finishedAt?: string;
    attemptCount: number;
}

interface MemoryFile {
    planId: string;
    taskDescription: string;
    steps: StepRecord[];
    startedAt: string;
    lastUpdatedAt: string;
}

export class ExecutionMemory {
    private memPath: string;
    private data: MemoryFile;

    constructor(cwd: string, planId: string, taskDescription: string) {
        const dir = path.join(cwd, '.atcli-tmp');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        this.memPath = path.join(dir, 'exec_memory.json');
        // Load existing or create fresh
        if (fs.existsSync(this.memPath)) {
            try {
                const existing = JSON.parse(fs.readFileSync(this.memPath, 'utf-8')) as MemoryFile;
                // Resume only if same planId (same task, not a new one)
                if (existing.planId === planId) {
                    this.data = existing;
                    const done = this.data.steps.filter(s => s.status === 'done').length;
                    process.stdout.write('[ExecMemory] Resuming plan "' + planId + '" ? ' + done + '/' + this.data.steps.length + ' steps already done\\n');
                    return;
                }
            } catch {}
        }
        this.data = { planId, taskDescription, steps: [], startedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString() };
        this.save();
    }

    /** Register a step (call once per step at plan-build time) */
    registerStep(stepId: number, title: string, tool: string, args: Record<string, unknown>): void {
        const existing = this.data.steps.find(s => s.stepId === stepId);
        if (existing) return; // Already registered (resume case)
        this.data.steps.push({ stepId, title, tool, args, status: 'pending', attemptCount: 0 });
        this.save();
    }

    /** Mark step as started */
    startStep(stepId: number): void {
        const step = this.getStep(stepId);
        if (!step) return;
        step.status = 'running'; step.startedAt = new Date().toISOString(); step.attemptCount++;
        this.save();
    }

    /** Mark step as done */
    completeStep(stepId: number, output?: string, patch?: string): void {
        const step = this.getStep(stepId);
        if (!step) return;
        step.status = 'done'; step.output = output; step.patchApplied = patch;
        step.finishedAt = new Date().toISOString();
        this.save();
    }

    /** Mark step as failed */
    failStep(stepId: number, error: string): void {
        const step = this.getStep(stepId);
        if (!step) return;
        step.status = 'failed'; step.error = error; step.finishedAt = new Date().toISOString();
        this.save();
    }

    /** Check if step is already done (skip it on resume) */
    isStepDone(stepId: number): boolean {
        return this.getStep(stepId)?.status === 'done';
    }

    /** Get the first failed step (for targeted repair) */
    getFirstFailedStep(): StepRecord | undefined {
        return this.data.steps.find(s => s.status === 'failed');
    }

    /** Get context for failed step: only what needed for the repair LLM call */
    getRepairContext(stepId: number): string {
        const step = this.getStep(stepId);
        if (!step) return '';
        const doneBefore = this.data.steps
            .filter(s => s.stepId < stepId && s.status === 'done')
            .map(s => '  - Step ' + s.stepId + ': ' + s.title + ' [DONE]')
            .join('\n');
        return [
            '=== REPAIR CONTEXT (Step ' + stepId + ' failed) ===',
            'Task: ' + this.data.taskDescription,
            'Failed step: ' + step.title,
            'Error: ' + (step.error ?? 'unknown'),
            'Prior steps completed:',
            doneBefore || '  (none)',
            '=================================',
        ].join('\n');
    }

    /** Summary stats for logging */
    getSummary(): string {
        const done = this.data.steps.filter(s => s.status === 'done').length;
        const failed = this.data.steps.filter(s => s.status === 'failed').length;
        const total = this.data.steps.length;
        return '[ExecMemory] ' + done + '/' + total + ' done | ' + failed + ' failed';
    }

    /** Clear plan after successful completion */
    clear(): void {
        try { if (fs.existsSync(this.memPath)) fs.unlinkSync(this.memPath); } catch {}
    }

    private getStep(stepId: number): StepRecord | undefined {
        return this.data.steps.find(s => s.stepId === stepId);
    }

    private save(): void {
        this.data.lastUpdatedAt = new Date().toISOString();
        try { fs.writeFileSync(this.memPath, JSON.stringify(this.data, null, 2), 'utf-8'); } catch {}
    }
}