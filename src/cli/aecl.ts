#!/usr/bin/env node
/**
 * AECL - Auto Error Checker Live Dashboard
 * Run this in a separate terminal alongside ATCLI.
 * It watches .aecl_memory.json and renders a live IDE-style error panel.
 */

import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';

const AECL_FILE = '.aecl_memory.json';
const STALE_THRESHOLD_MS = 60000; // 60 seconds

interface AeclError {
    file: string;
    line: number;
    col: number;
    message: string;
    severity: 'error' | 'warning';
    status: 'fix_now' | 'future_fix';
}

interface AeclMemory {
    error_count: number;
    warning_count: number;
    last_checked: string;
    files_checked: string[];
    errors: AeclError[];
    ai_notes: string;
    ignored_paths: string[];
}

// ANSI color helpers
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    white: '\x1b[97m',
    gray: '\x1b[90m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
};

function clearScreen() {
    process.stdout.write('\x1b[2J\x1b[H');
}

function formatTime(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleTimeString();
}

function getStaleWarning(lastChecked: string): string {
    const ageMs = Date.now() - new Date(lastChecked).getTime();
    if (ageMs > STALE_THRESHOLD_MS) {
        const ageSec = Math.floor(ageMs / 1000);
        return `${c.yellow}⚠ STALE (${ageSec}s ago)${c.reset}`;
    }
    return `${c.green}● LIVE${c.reset}`;
}

function renderDashboard(memory: AeclMemory) {
    clearScreen();
    const cwd = process.cwd();
    const staleStatus = getStaleWarning(memory.last_checked);
    const totalErrors = memory.error_count;
    const totalWarnings = memory.warning_count;

    // Header
    console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bold}${c.cyan}║  🔍 AECL - Auto Error Checker Live                        ║${c.reset}`);
    console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}`);
    console.log(`${c.gray}  Project: ${c.white}${cwd}${c.reset}`);
    console.log(`${c.gray}  Updated: ${c.white}${formatTime(memory.last_checked)}  ${staleStatus}`);
    console.log(`${c.gray}  Files tracked: ${c.white}${memory.files_checked.length}${c.reset}`);
    console.log('');

    // Status bar
    if (totalErrors === 0 && totalWarnings === 0) {
        console.log(`  ${c.bgGreen}${c.bold}  ✅ ZERO ERRORS - PROJECT CLEAN!  ${c.reset}`);
    } else {
        const errLabel = totalErrors > 0 ? `${c.bgRed}${c.bold}  ✖ ${totalErrors} Error${totalErrors !== 1 ? 's' : ''}  ${c.reset}` : '';
        const warnLabel = totalWarnings > 0 ? `  ${c.bgYellow}  ⚠ ${totalWarnings} Warning${totalWarnings !== 1 ? 's' : ''}  ${c.reset}` : '';
        console.log(`  ${errLabel}${warnLabel}`);
    }
    console.log('');

    // Errors list
    if (memory.errors.length > 0) {
        console.log(`${c.bold}${c.white}  PROBLEMS:${c.reset}`);
        console.log(`${c.gray}  ─────────────────────────────────────────────────────${c.reset}`);
        
        const maxShow = 30;
        const shown = memory.errors.slice(0, maxShow);
        
        for (const err of shown) {
            const icon = err.severity === 'error' ? `${c.red}✖${c.reset}` : `${c.yellow}⚠${c.reset}`;
            const fileShort = err.file.replace(cwd.replace(/\\/g, '/'), '').replace(/^\//, '');
            const loc = `${c.gray}:${err.line}:${err.col}${c.reset}`;
            const msg = err.severity === 'error' 
                ? `${c.red}${err.message}${c.reset}` 
                : `${c.yellow}${err.message}${c.reset}`;
            const futureTag = err.status === 'future_fix' ? ` ${c.gray}[future fix]${c.reset}` : '';
            console.log(`  ${icon} ${c.cyan}${fileShort}${c.reset}${loc}  ${msg}${futureTag}`);
        }
        
        if (memory.errors.length > maxShow) {
            console.log(`${c.gray}  ... and ${memory.errors.length - maxShow} more errors.${c.reset}`);
        }
    } else {
        console.log(`${c.gray}  No problems detected.${c.reset}`);
    }

    // AI Notes
    if (memory.ai_notes && memory.ai_notes.trim()) {
        console.log('');
        console.log(`${c.bold}${c.white}  AI NOTES:${c.reset}`);
        console.log(`${c.gray}  ─────────────────────────────────────────────────────${c.reset}`);
        const noteLines = memory.ai_notes.split('\n').slice(0, 5);
        for (const line of noteLines) {
            console.log(`  ${c.gray}${line}${c.reset}`);
        }
    }

    console.log('');
    console.log(`${c.gray}  Press Ctrl+C to exit AECL dashboard.${c.reset}`);
}

function renderIdle() {
    clearScreen();
    console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bold}${c.cyan}║  🔍 AECL - Auto Error Checker Live                        ║${c.reset}`);
    console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}`);
    console.log('');
    console.log(`  ${c.yellow}⏳ Waiting for AI to run first aecl_check...${c.reset}`);
    console.log('');
    console.log(`  ${c.gray}Start ATCLI in another terminal and ask it to build a project.${c.reset}`);
    console.log(`  ${c.gray}AECL will auto-update when the AI runs its first check.${c.reset}`);
    console.log('');
    console.log(`${c.gray}  Watching: ${path.join(process.cwd(), AECL_FILE)}${c.reset}`);
    console.log(`${c.gray}  Press Ctrl+C to exit.${c.reset}`);
}

function loadAndRender(filePath: string) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const memory: AeclMemory = JSON.parse(raw);
        renderDashboard(memory);
    } catch (e) {
        // File might be mid-write (shouldn't happen with atomic rename, but be safe)
        // just skip this update
    }
}

export async function startAeclDashboard() {
    const aeclPath = path.join(process.cwd(), AECL_FILE);
    
    // Initial render
    if (fs.existsSync(aeclPath)) {
        loadAndRender(aeclPath);
    } else {
        renderIdle();
    }
    
    // Watch using chokidar (cross-platform, handles atomic renames)
    const watcher = chokidar.watch(aeclPath, {
        persistent: true,
        usePolling: false,
        awaitWriteFinish: {
            stabilityThreshold: 100,
            pollInterval: 50
        }
    });
    
    watcher.on('add', (fp) => loadAndRender(fp));
    watcher.on('change', (fp) => loadAndRender(fp));
    watcher.on('unlink', () => renderIdle());
    
    // Handle graceful exit
    process.on('SIGINT', () => {
        watcher.close();
        console.log('\n\n[AECL] Dashboard closed. Goodbye! 👋');
        process.exit(0);
    });
}

startAeclDashboard();
