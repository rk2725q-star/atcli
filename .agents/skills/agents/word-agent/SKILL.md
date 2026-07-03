---
name: word-agent
description: MS Word document creation — Times New Roman 14pt headings, Arial 12pt body. Supports offline create_word_doc and browser-based word_online.
---

# word-agent

MS Word document creation — Times New Roman 14pt headings, Arial 12pt body. Supports offline create_word_doc and browser-based word_online.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "word", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
