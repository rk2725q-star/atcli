# GLOBAL ATCLI LEARNING VAULT

This file serves as the permanent, autonomous learning brain for ATCLI. 
It contains high-quality design principles, user preferences, and UI/UX feedback distilled from past sessions.

## Supervised & Meta-Learning Directives
1. **Always read this file before generating application code, UI designs, or architectures.**
2. **Strictly adhere to the user's historical preferences listed below.**

## Extracted Learnings
- [2026-06-27] System Initialized. Awaiting first feedback loop.
- **Dynamic IDE LIVE SYNC:** Always use `process.env.TERM_PROGRAM` to accurately detect the active editor (e.g., vscode vs cursor) to prevent opening duplicate file windows across multiple IDEs during ATCLI Live Code Writing.
- **Intelligent Background Polling (Wait Skill):** Never let AI poll background tasks continuously. Use a dedicated `wait` skill to pause execution for a fixed time (5-10 seconds) while heavy tasks (like npm serve/install) boot up, allowing the initial output to be captured instantly without wasting API tokens.
- **Intelligent Episodic Memory & Semantic Chunking:** Memory checkpoints should be brief ("short & sweet") and occur dynamically before a task finishes (or every 3 iterations). Always use semantic chunking (`\n\n`) when injecting rules into prompts to prevent prompt corruption.
- **Intelligent Replace Skill:** Use startLine and endLine boundaries to intelligently and safely replace code blocks without rewriting the entire file, preserving context and saving time.
- **Auto-Verification Guardrail:** AI must run `verify_code` to catch syntax errors before spinning up local servers.
- **Browser Vision Self-Correction:** AI must capture screenshots of generated web apps (e.g. `http://localhost:3320`) and visually verify if the UI is stunning and matches all requirements, fixing it if it looks generic.
- **Requirement Checklist Enforcement:** AI must internally list and verify user requirements before concluding a task.
- **CSS Baseline Override:** Even if a user requests basic HTML/Vanilla CSS, the AI must deliver a premium aesthetic (modern CSS variables, Glassmorphism) within those constraints.
- **Browser Security Guard:** Prevent execution of dangerous tasks, malware downloads, or risky navigation during automated browser operations.
- **180k Context Limit Management:** Explicit tracking of token limits in the agent loop to auto-refresh and resend core instructions before the 180k context window drops critical rules.
- **C Drive Decoupling & Workspace Isolation:** ATCLI must completely avoid using `C:\` drive paths for memory, configuration, or skills (e.g., ignore `~/.gemini/config`, `~/.agents`, `C:\Users\Public\.atcli`). ALL global skills, Agentica memory, and configurations MUST be stored and read strictly from the local workspace (e.g., `D:\project\atcli-core\.agents\skills`, `./.atcli/agentica_memory.md`).
