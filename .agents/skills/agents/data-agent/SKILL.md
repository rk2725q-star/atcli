---
name: data-agent
description: Data analysis — read CSV/JSON/XML, internet_search for external data, reasoning for pattern analysis. Returns structured summaries.
---

# data-agent

Data analysis — read CSV/JSON/XML, internet_search for external data, reasoning for pattern analysis. Returns structured summaries.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "data", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
