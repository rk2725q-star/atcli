---
name: atcli-gatekeeper
description: Security wall for all ATCLI agents. Blocks: destructive commands (rm -rf, format, del /f), system path writes (C:\Windows, /etc), ATCLI self-modification, secret/API key exposure. Logs all blocks to GATEKEEPER_LOG.md.
---

# atcli-gatekeeper

Security wall for all ATCLI agents. Blocks: destructive commands (rm -rf, format, del /f), system path writes (C:\Windows, /etc), ATCLI self-modification, secret/API key exposure. Logs all blocks to GATEKEEPER_LOG.md.

## Activation
This skill is ALWAYS active in all ATCLI agents. No manual invocation needed.
