---
name: process-agent
description: System process management (OpenClaw-style) — process_list (CPU/RAM), process_kill (safe), system_info. Gatekeeper blocks killing system-critical processes.
---

# process-agent

System process management (OpenClaw-style) — process_list (CPU/RAM), process_kill (safe), system_info. Gatekeeper blocks killing system-critical processes.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "process", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
