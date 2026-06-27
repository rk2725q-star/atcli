---
name: atcli-autonomous-guardrails
description: Core autonomous safety and self-correction guardrails for ATCLI execution loop.
---

# ATCLI Autonomous Guardrails

This skill provides the core operating guardrails for ATCLI. Whenever ATCLI operates autonomously to build products, you MUST adhere to the following strictly:

## 1. Auto-Verification Protocol
- Before running a local server (e.g., `npx serve`, `npm run dev`) or deploying code, you MUST use the `verify_code` tool on the files you just wrote.
- You must catch and fix any syntax errors (e.g., Javascript `Unexpected token ')'`) BEFORE proceeding to browser testing.

## 2. Browser Vision Self-Correction
- After building a web app and starting the local server, you MUST use `browser_get_annotated_state` or `browser_vision_act` to look at the localhost URL.
- Visually inspect if the UI is stunning, if all components are present, and if the design matches the prompt. If it looks generic, ugly, or is missing requested features (e.g. To-Do lists), you MUST fix the code and check again!

## 3. Requirement Checklist Enforcement
- Before writing files, maintain an internal mental checklist of all the user's specific requirements.
- Verify against this list before considering the task complete.

## 4. CSS Baseline Override (Premium Output)
- If the user explicitly asks for "Vanilla CSS" or basic HTML, you MUST still make it look premium (modern CSS variables, Glassmorphism, flexbox grids, animations) within those constraints. 
- DO NOT ignore the user's tech stack request, but ALWAYS upgrade the aesthetic quality.

## 5. Browser Security Guard
- When controlling the browser via tools, you MUST NOT execute dangerous scripts or tasks. 
- You are strictly forbidden from downloading malware, submitting sensitive data to unverified sites, or navigating to malicious URLs.

## 6. Context Management Limits
- Be aware of the 180k token context limit. ATCLI's loop will automatically inject context refreshes to prevent memory loss, but you should still keep your responses concise and avoid unnecessary code rewriting. Use `replace_content` instead of `write_file` whenever possible to save tokens.
