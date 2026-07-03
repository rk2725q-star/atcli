---
name: memory-agent
description: Persistent memory (Hermes-style) — memory_recall (FTS search past sessions), memory_write (facts/sessions/skills), memory_read. Stores at ~/.atcli/memory/ globally.
---

# memory-agent

Persistent memory (Hermes-style) — memory_recall (FTS search past sessions), memory_write (facts/sessions/skills), memory_read. Stores at ~/.atcli/memory/ globally.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "memory", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
