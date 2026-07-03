---
name: reflection-agent
description: Self-improvement loop (Hermes-style) — reflect_and_improve evaluates output quality (0-100 score), identifies issues, suggests specific fixes. Never modifies files.
---

# reflection-agent

Self-improvement loop (Hermes-style) — reflect_and_improve evaluates output quality (0-100 score), identifies issues, suggests specific fixes. Never modifies files.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "reflection", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
