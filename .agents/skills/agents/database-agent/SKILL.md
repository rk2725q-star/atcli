---
name: database-agent
description: Local data persistence — sqlite_query on .db files, read/analyze CSV/JSON/YAML. Paginated queries. Blocks DROP TABLE/DATABASE.
---

# database-agent

Local data persistence — sqlite_query on .db files, read/analyze CSV/JSON/YAML. Paginated queries. Blocks DROP TABLE/DATABASE.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "database", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
