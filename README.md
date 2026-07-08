# atcli

An open-source TypeScript CLI coding agent that routes prompts across **multiple AI providers** (DeepSeek, ChatGPT, Gemini, Qwen, Kimi, Z.ai, Ollama) through browser automation — no API keys required. It ships with an autonomous agent loop, a project-wide skills system (including a full cinematic 3D web-dev skill pack), an MCP broker for IDE integration, and **AECL** (Auto Error Checker Live), a live TypeScript/JS error dashboard.

This README is written so a human **or an AI coding agent** (Claude Code, Antigravity, Cursor, etc.) can set this up unattended in a handful of steps.

---

## Requirements
- **Node.js 18+** and npm
- A Chromium-capable desktop OS (Windows/macOS/Linux) — Playwright drives real browser sessions for the providers, so no API keys are needed
- *(Optional)* [Ollama](https://ollama.com) installed locally if you want the `ollama`/`local` provider to work offline

---

## Setup

### Step 1 — Clone & Install
```bash
git clone https://github.com/rk2725q-star/atcli.git
cd atcli
npm install
```
`npm install` automatically runs `npm run build` (via the `prepare` script), which compiles `src/` → `dist/`. If it fails, re-run `npm run build` manually and read the TypeScript errors — usually a Node version mismatch.

### Step 2 — Link the global commands
```bash
npm link
```
This exposes three commands globally on this machine: `atcli`, `atcli-mcp`, `aecl` (mapped from `bin/` → `dist/` in `package.json`).

### Step 3 — First run & provider login
```bash
atcli
```
On first launch, atcli opens a real browser window per provider (DeepSeek / ChatGPT / Gemini, etc.) so you can log in with your own account — this is a **one-time step per machine**. The session is saved to `browser_profile/` (git-ignored, stays local, never pushed). On a new PC or a friend's machine this login always has to happen again, since `browser_profile/` intentionally never leaves the machine it was created on — that's expected, not a bug.

### Step 4 — Verify it works
Inside the `atcli` REPL, run:
```
/help
/provider deepseek
```
If you see the command list and the provider switches without errors, the core agent is fully working.

### Step 5 (optional) — Local/offline model via Ollama
```bash
ollama pull qwen3-vl:2b
```
Then switch to it inside atcli with `/provider ollama` or `/provider local`. Skip this step if you're fine using the browser-based providers only.

That's the full setup — **4 required steps + 1 optional** — and every feature below works after that.

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

## Other CLI entry points
| Command | Purpose |
|---|---|
| `atcli` | Main agent REPL |
| `atcli-mcp` | Start the MCP broker server (for IDE integration — see below) |
| `aecl` | Live error dashboard — run in a **second terminal** alongside `atcli`. Every ~5 files the agent writes, AECL rechecks TS/JS errors, like a terminal version of VS Code's Problems panel. History is stored per-project in `.aecl_memory.json`. |

## Providers
| Provider | Type | Notes |
|---|---|---|
| `deepseek` | Browser session | Default primary provider |
| `chatgpt` | Browser session | |
| `gemini` | Browser session | Used as an automatic fallback in auto-routing |
| `qwen` | Browser session | |
| `kimi` | Browser session | |
| `zai` | Browser session | |
| `ollama` / `local` | Local HTTP (needs Ollama running) | Default model: `qwen3-vl:2b` |

## Skills system
Project skills live in `.agents/skills/`, indexed in `.agents/SKILL_INDEX.md` and locked in `skills-lock.json`. Notable pack: a full **cinematic 3D web-dev** skill set (Three.js, React Three Fiber, GSAP scroll storytelling, WebGL fluid sim, raymarching, real physics via Rapier, procedural asset codegen, and a topic-aware "scene director/brain" skill that auto-designs a matching 3D scene for any website topic). The agent reads `SKILL_INDEX.md` first to pick the right skill without scanning every folder.

## Connecting an IDE (VS Code / Antigravity) via MCP
1. Run `npm run build` so `dist/broker/cli-entry.js` exists.
2. Open [`mcp_config_guide.md`](./mcp_config_guide.md) and copy the JSON snippet.
3. **Replace the path** in that snippet with your own absolute path to `dist/broker/cli-entry.js` — the guide's example path is from one contributor's machine and won't exist on yours.

## Troubleshooting
- **`npm install` fails on build** → run `node -v` (needs 18+), then `npm run build` again to see the real TS error.
- **Provider window doesn't open / login doesn't persist** → delete `browser_profile/` and re-run `atcli` to force a fresh login.
- **`atcli` command not found after `npm link`** → make sure npm's global bin directory is on your `PATH` (`npm config get prefix`), or use `npx atcli` from inside the repo instead.
- **Ollama provider not responding** → confirm `ollama serve` is running and `ollama list` shows `qwen3-vl:2b`.

## Notes
- `.env`, `browser_profile/`, and `.atmemory.json` are git-ignored on purpose — machine-specific local state. Never commit them.
- `ATCLI_MEMORY.md` at the repo root is the agent's own running project memory — useful context if you ask an AI agent to continue work on atcli itself.
