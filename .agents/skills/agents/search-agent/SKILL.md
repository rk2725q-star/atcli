---
name: search-agent
description: Web and local search — internet_search for web, grep_search for local code. Returns cited sources and file paths with line numbers.
---

# search-agent

Web and local search — internet_search for web, grep_search for local code. Returns cited sources and file paths with line numbers.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "search", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
