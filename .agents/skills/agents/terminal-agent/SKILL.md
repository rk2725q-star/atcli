---
name: terminal-agent
description: Safe terminal command execution — run_command, run_background_command, sandbox_command. Gatekeeper blocks all destructive commands automatically.
---

# terminal-agent

Safe terminal command execution — run_command, run_background_command, sandbox_command. Gatekeeper blocks all destructive commands automatically.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "terminal", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
