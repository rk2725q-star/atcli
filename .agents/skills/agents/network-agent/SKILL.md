---
name: network-agent
description: HTTP/REST API — http_request (GET/POST/PUT/DELETE/PATCH), full headers, body, response processing. Never sends real API keys.
---

# network-agent

HTTP/REST API — http_request (GET/POST/PUT/DELETE/PATCH), full headers, body, response processing. Never sends real API keys.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "network", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
