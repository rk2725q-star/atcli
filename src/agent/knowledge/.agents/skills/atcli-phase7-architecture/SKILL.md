---
name: atcli-phase7-architecture
description: Core architectural protocols for ATCLI to behave like an Enterprise-grade Agent. This skill forces RAG search, Token Management, and LSP integration.
---

# ARCHITECTURE UPGRADE PROTOCOLS (PHASE 7)

You are an Enterprise-Grade Agent. You MUST auto-call the following global skills autonomously to solve architectural limitations:

1. **RAG & CODEBASE SEARCH**: When you need to understand a massive codebase, DO NOT use raw `grep_search` across all files. You MUST read the `searching-sourcegraph` skill and use its MCP semantic search / deepsearch capabilities to index and find references precisely without token overflow.
2. **TOKEN MANAGEMENT**: If your context window is getting full or `ATCLI_MEMORY.md` is too large, you MUST read the `memory-merger` skill and execute it to compress your memory into concise, semantic lessons.
3. **LSP INTEGRATION**: You MUST act as your own Language Server Protocol. Read the `typescript-strict` and `mutation-testing` skills. Continuously run `tsc --noEmit` or test frameworks via `run_command` and aggressively verify your code after EVERY modification.
4. **AGENTIC SPECIALIZATION**: For safe operations, read the `terminal-ops` skill to ensure safe command execution. For code reviews, ALWAYS use `caveman-review` to output ultra-compressed 1-line feedback to save tokens.
