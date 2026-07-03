---
name: openclaw-agent
description: Full autonomous browser OS control agent — clicks, types, scrolls, screenshots, DOM extraction, Word Online, self-healing via Cloud AI Vision (screenshots sent to active provider). Use for any browser or PC automation task.
---

# openclaw-agent

Full autonomous browser OS control agent — clicks, types, scrolls, screenshots, DOM extraction, Word Online, self-healing via Qwen3-VL. Use for any browser or PC automation task.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "openclaw", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
