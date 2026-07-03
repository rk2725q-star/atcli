---
name: heartbeat-agent
description: Cron-style background scheduler (OpenClaw heartbeat) — heartbeat_schedule start/stop/list. Fires recurring background tasks at set intervals.
---

# heartbeat-agent

Cron-style background scheduler (OpenClaw heartbeat) — heartbeat_schedule start/stop/list. Fires recurring background tasks at set intervals.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "heartbeat", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
