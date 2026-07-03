---
name: deploy-agent
description: Deployment automation — Vercel, Netlify, Railway. Runs build first, checks for errors, deploys, returns live URL.
---

# deploy-agent

Deployment automation — Vercel, Netlify, Railway. Runs build first, checks for errors, deploys, returns live URL.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "deploy", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
