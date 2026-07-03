---
name: fileops-agent
description: File system operations — read_file, list_dir, grep_search, move, delete files within project root only. Never deletes outside safe zone.
---

# fileops-agent

File system operations — read_file, list_dir, grep_search, move, delete files within project root only. Never deletes outside safe zone.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "fileops", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
