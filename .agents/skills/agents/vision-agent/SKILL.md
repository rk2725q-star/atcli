---
name: vision-agent
description: Visual understanding via cloud AI provider — screenshot capture, annotated DOM analysis, base64 image sent to active AI provider (DeepSeek/Qwen/Claude/Gemini) for analysis. No local model required.
---

# vision-agent

Visual understanding — screenshot + annotated DOM analysis. Extracts text, identifies UI elements with coordinates. Uses Qwen3-VL for OCR.

## Usage
Spawn via Hermes Orchestrator plan:
```json
{"agent": "vision", "task": "your specific subtask here"}
```

## Rules
- This agent is Gatekeeper-protected — dangerous commands blocked automatically
- 180k context auto-resend keeps this agent focused across long sessions
- Semantic context injected every message — agent never forgets its role
- Logs subtask outcome to ~/.atcli/memory/ on completion
