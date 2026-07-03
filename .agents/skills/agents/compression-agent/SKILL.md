---
name: compression-agent
description: Context management (Hermes-style) — compress_context (bullets/summary/headlines), reflect_and_improve, memory recall. Prevents 180k context overflow.
---

# compression-agent

Context management (Hermes-style) — compress_context (bullets/summary/headlines), reflect_and_improve, memory recall. Prevents 180k context overflow.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "compression", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
