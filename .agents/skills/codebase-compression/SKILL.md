---
name: codebase-compression
description: Strategies for navigating and reading massive codebases without blowing up the 180k context window.
---

# Codebase Mapping & Compression Protocol

When you need to explore or read from a massive external codebase (like a Github Repository clone) while staying strictly under the token limit, you MUST apply these compression rules:

## 1. Never Read Raw Full Files Initially
- DO NOT use the `view_file` tool on large files (over 200 lines) unless you absolutely need to understand the internal implementation logic of a specific function.
- If a file is too large, use `grep_search` to find the exact line numbers of the function signatures or classes you need, then only read those specific lines.

## 2. RepoMap / Structural Scanning
- Start by understanding the architecture using lightweight tools.
- Use `list_dir` to view the high-level folder structure. Do not recursively list everything at once.
- Only dive into directories (e.g., `src/core/`) that are strictly relevant to your current task.

## 3. Rely on Interfaces & Headers
- If available, prioritize reading `.d.ts` files, interface definitions, or Markdown documentation (`README.md`, `ARCHITECTURE.md`) rather than the raw implementation `.ts`/`.cpp` files. Documentation is heavily token-compressed compared to raw source code.

## 4. Extract and Synthesize
- When you find a complex pattern or algorithm in the codebase that you need, DO NOT copy-paste the entire file into your memory.
- Instead, read it, understand the logic, and write a highly compressed, 3-sentence summary of how it works into your `ATCLI_MEMORY.md` file, then move on.
