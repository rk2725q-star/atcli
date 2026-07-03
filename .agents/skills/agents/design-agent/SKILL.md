---
name: design-agent
description: UI/UX visual checker — screenshot, browser_vision_act. Evaluates premium design: dark mode, modern typography, animations. Reports specific issues.
---

# design-agent

UI/UX visual checker — screenshot, browser_vision_act. Evaluates premium design: dark mode, modern typography, animations. Reports specific issues.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "design", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
