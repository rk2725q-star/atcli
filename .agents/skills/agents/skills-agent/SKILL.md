---
name: skills-agent
description: Skills marketplace — search_skills_marketplace (skills.sh + GitHub), install_skill. Auto-discovers and installs SKILL.md compatible skills.
---

# skills-agent

Skills marketplace — search_skills_marketplace (skills.sh + GitHub), install_skill. Auto-discovers and installs SKILL.md compatible skills.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "skills", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
