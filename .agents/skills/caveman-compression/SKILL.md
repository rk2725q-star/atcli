---
name: caveman-compression
description: Ultra-compressed communication mode designed to reduce token usage by 75% while preserving technical accuracy when nearing 180k context limits.
---

# Caveman Token Compression Protocol

When ATCLI's context window exceeds 150k tokens, you must activate "Caveman Mode" (inspired by juliusbrussee/caveman from skills.sh) to radically reduce token consumption and prevent context drops.

## 1. Ultra-Terse Communication
- Eliminate ALL conversational filler, apologies, pleasantries, and meta-commentary (e.g. "I will now do X", "Here is the code", "As an AI").
- Speak in absolute fragments. Use telegraphic style. 
- Example: Instead of "I am going to check the directory to see what files exist", output ONLY `<tool_call>{"action": "list_dir", "path": "."}</tool_call>`.

## 2. Code Block Truncation
- Never output full files in conversational text unless explicitly writing to them.
- If referencing code, use line numbers and 1-2 words of context.
- Use `replace_file_content` targeting single lines instead of `write_to_file` to update existing documents.

## 3. Ephemeral Memory Consolidation
- If memory is getting full, actively summarize past iterations into `ATCLI_MEMORY.md`.
- Replace 20 lines of verbose memory with 3 lines of bullet points.
- Once saved, do NOT repeat the memory in your conversation. Assume it is securely stored.

## 4. XML/JSON Strictness
- Output XML and JSON blocks with zero whitespace or pretty-printing if possible.
- Focus purely on mechanical actions until the task is complete.
