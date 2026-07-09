# ATCLI

An open-source TypeScript CLI coding agent that routes prompts across **multiple AI providers** (DeepSeek, ChatGPT, Gemini, Qwen, Kimi, Z.ai, Ollama) through browser automation — **no API keys required**. Ships with an autonomous agent loop, a project-wide skills system (including a full cinematic 3D web-dev skill pack), an MCP broker for IDE integration, and **AECL** (Auto Error Checker Live), a live TypeScript/JS error dashboard.

---

## ⚡ One-Command Setup

### Windows (PowerShell)
```powershell
git clone https://github.com/rk2725q-star/atcli.git; cd atcli; node setup.js
```
> Node.js not installed yet? Run `setup.ps1` instead — it auto-installs Node via winget:
> ```powershell
> git clone https://github.com/rk2725q-star/atcli.git; cd atcli; .\setup.ps1
> ```

### macOS / Linux
```bash
git clone https://github.com/rk2725q-star/atcli.git && cd atcli && node setup.js
```
> Node.js not installed yet? Use the shell script — it auto-installs Node via nvm:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/rk2725q-star/atcli/main/setup.sh | bash
> ```

The setup script handles everything:
- ✅ Checks Node.js 18+ (or installs it)
- ✅ `npm install` — dependencies
- ✅ `npm run build` — TypeScript → dist/
- ✅ `npm link` — makes `atcli`, `aecl`, `atcli-mcp` available globally
- ✅ `playwright install chromium` — browser for AI sessions

---

## After Setup

**Terminal 1 — Start ATCLI:**
```
atcli
```
On first launch, browser windows open for each AI provider (DeepSeek, ChatGPT, Gemini, etc.) so you can log in with your own account. **One-time per machine** — sessions are saved locally in `browser_profile/` (git-ignored, never pushed).

**Terminal 2 — Start AECL (live error dashboard):**
```
aecl
```
AECL watches your project files and shows TypeScript/JS errors live — like VS Code's Problems panel but in the terminal.

---

## Requirements
- **Node.js 18+** and npm (setup script installs this if missing)
- A desktop OS with Chromium support (Windows / macOS / Linux)
- *(Optional)* [Ollama](https://ollama.com) for offline/local AI

---

## Commands (inside the `atcli` REPL)
| Command | Purpose |
|---|---|
| `/provider <name>` | Switch AI provider: `deepseek`, `chatgpt`, `gemini`, `qwen`, `kimi`, `zai`, `ollama`, `local` |
| `/model <name>` | Switch the active model for the current provider |
| `/manage <task>` / `/review <task>` | Spawn the Tech Lead agent to manage or review code |
| `/audit` | Full deep architectural + bug audit of the current codebase |
| `/agentica <task>` | Enter OpenClaw-style autonomous continuous execution (whole-PC + browser control) |
| `/upload <prompt>` | Pause so you can manually upload an image/file in the provider's browser tab |
| `/session` | Pause so you can manually resume a past chat session |
| `/rename <file> <old> <new>` | Locally rename a variable/string in a file — the AI provider never sees this change (IP protection) |
| `/exit` | Quit |
| `/help` | Show all commands + AECL instructions |

## Other CLI Entry Points
| Command | Purpose |
|---|---|
| `atcli` | Main agent REPL |
| `atcli-mcp` | Start the MCP broker server (for IDE integration) |
| `aecl` | Live error dashboard — run in a second terminal alongside `atcli` |

---

## Providers
| Provider | Type | Notes |
|---|---|---|
| `deepseek` | Browser session | Default primary provider |
| `chatgpt` | Browser session | |
| `gemini` | Browser session | Used as automatic fallback in auto-routing |
| `qwen` | Browser session | |
| `kimi` | Browser session | |
| `zai` | Browser session | |
| `ollama` / `local` | Local HTTP (needs Ollama running) | Default model: `qwen3-vl:2b` |

---

## Skills System
Project skills live in `.agents/skills/`, indexed in `.agents/SKILL_INDEX.md`. Notable pack: a full **cinematic 3D web-dev** skill set (Three.js, React Three Fiber, GSAP scroll storytelling, WebGL fluid sim, raymarching, real physics via Rapier, procedural asset codegen, and a topic-aware "scene director" skill that auto-designs a matching 3D scene for any website topic).

---

## Connecting an IDE via MCP (VS Code / Cursor / Antigravity)
1. Run `npm run build` so `dist/broker/cli-entry.js` exists.
2. Open [`mcp_config_guide.md`](./mcp_config_guide.md) and copy the JSON snippet.
3. Replace the path in that snippet with your own absolute path to `dist/broker/cli-entry.js`.

---

## Troubleshooting
| Problem | Fix |
|---|---|
| `atcli: command not found` after setup | Run `npm config get prefix` — add that `bin/` folder to your PATH |
| Provider browser window doesn't open | Delete `browser_profile/` and restart `atcli` |
| `npm install` fails on build | Run `node -v` (needs 18+), then `npm run build` to see TS errors |
| Ollama not responding | Confirm `ollama serve` is running and `ollama list` shows your model |
| Setup script permission denied (macOS/Linux) | Run `sudo npm link` manually after setup |

---

## Notes
- `browser_profile/`, `.env`, and `.aecl_memory.json` are git-ignored — machine-specific local state, never committed.
- `ATCLI_MEMORY.md` at repo root is the agent's running project memory — useful context if you ask an AI agent to continue work on atcli itself.
- `setup.js` / `setup.ps1` / `setup.sh` — run any one of these on a fresh machine, everything is ready in under 2 minutes.
