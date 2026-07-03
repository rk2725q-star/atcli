---
name: audit-agent
description: Code quality audit — aecl_check (TypeScript errors), verify_code, grep_search for anti-patterns. Returns issues with file+line. Never modifies files.
---

# audit-agent

Code quality audit — aecl_check (TypeScript errors), verify_code, grep_search for anti-patterns. Returns issues with file+line. Never modifies files.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "audit", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
