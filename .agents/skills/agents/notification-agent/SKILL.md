---
name: notification-agent
description: System notifications — Windows toast, macOS banner, Linux notify-send. Alerts user when long tasks complete. Logs to memory after sending.
---

# notification-agent

System notifications — Windows toast, macOS banner, Linux notify-send. Alerts user when long tasks complete. Logs to memory after sending.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "notification", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
