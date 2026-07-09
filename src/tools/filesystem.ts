import * as fs from 'fs/promises';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// SENSITIVE FILE PATTERNS — blocked on both read and write regardless of
// whether Gatekeeper is wired in the caller. Defense-in-depth.
// ─────────────────────────────────────────────────────────────────────────────
const SENSITIVE_FILE_PATTERNS = [
    /\.env(\.(local|production|staging|development|test))?$/i,
    /\.ssh[\\/](id_rsa|id_ed25519|id_ecdsa|authorized_keys|known_hosts)$/i,
    /\/etc\/(passwd|shadow|sudoers|hosts)$/i,
];

export class FileSystemTools {
    /**
     * Resolve and validate a file path against the project root.
     * Throws if the resolved path escapes cwd or matches sensitive patterns.
     */
    private static resolveSafe(filePath: string): string {
        const projectRoot = path.resolve(process.cwd());
        const absolutePath = path.resolve(projectRoot, filePath);

        // ── Fix #1: Path traversal containment ────────────────────────────────
        // Ensures ../../../etc/passwd and absolute paths outside project root
        // are rejected. The trailing sep prevents /project-root-prefix-attack/.
        if (!absolutePath.startsWith(projectRoot + path.sep) && absolutePath !== projectRoot) {
            throw new Error(
                `SECURITY: Path "${filePath}" resolves to "${absolutePath}" which escapes the project root "${projectRoot}". Access denied.`
            );
        }

        // ── Fix #2: Sensitive file block (defense-in-depth) ───────────────────
        // This fires even if the caller forgot to call Gatekeeper first.
        // Normalise to forward-slashes for cross-platform pattern matching.
        const normalised = absolutePath.replace(/\\/g, '/');
        for (const pattern of SENSITIVE_FILE_PATTERNS) {
            if (pattern.test(normalised)) {
                throw new Error(
                    `SECURITY: Access to sensitive file "${filePath}" is blocked. Use environment variable managers, not direct file access.`
                );
            }
        }

        return absolutePath;
    }

    public static async readFile(filePath: string): Promise<string> {
        const absolutePath = FileSystemTools.resolveSafe(filePath);
        try {
            const content = await fs.readFile(absolutePath, 'utf-8');
            return content;
        } catch (error: any) {
            throw new Error(`Failed to read file: ${error.message}`);
        }
    }

    public static async writeFile(filePath: string, content: string): Promise<void> {
        const absolutePath = FileSystemTools.resolveSafe(filePath);
        try {
            await fs.mkdir(path.dirname(absolutePath), { recursive: true });
            await fs.writeFile(absolutePath, content, 'utf-8');
        } catch (error: any) {
            throw new Error(`Failed to write file: ${error.message}`);
        }
    }
}
