---
name: package-agent
description: Package manager — npm/yarn/pip installs, skills.sh skill installation. Always checks package.json before installing.
---

# package-agent

Package manager — npm/yarn/pip installs, skills.sh skill installation. Always checks package.json before installing.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "package", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
