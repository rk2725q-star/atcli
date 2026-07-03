---
name: keyboard-agent
description: PC keyboard control (OpenClaw-style) — keyboard_shortcut, clipboard_read, clipboard_write. Always screenshots before/after to verify effect.
---

# keyboard-agent

PC keyboard control (OpenClaw-style) — keyboard_shortcut, clipboard_read, clipboard_write. Always screenshots before/after to verify effect.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "keyboard", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
