---
name: devserver-agent
description: Dev server management — run_background_command for servers, manage_task for status/logs. Reports exact localhost URL.
---

# devserver-agent

Dev server management — run_background_command for servers, manage_task for status/logs. Reports exact localhost URL.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "devserver", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
