---
name: git-agent
description: Git and GitHub operations — add, commit, push, pull, branch, merge. Writes conventional commit messages. Never force-pushes to main.
---

# git-agent

Git and GitHub operations — add, commit, push, pull, branch, merge. Writes conventional commit messages. Never force-pushes to main.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "git", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
