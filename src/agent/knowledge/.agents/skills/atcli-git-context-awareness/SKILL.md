---
name: atcli-git-context-awareness
description: Critical protocols for handling Git and GitHub related requests. Enforces context awareness to prevent hallucinating repository URLs or blindly executing git init.
---

# Git Context Awareness Protocol

Whenever the user asks to push code, check git status, or interact with GitHub, you MUST follow these strict rules to prevent hallucination:

## 1. NEVER Hallucinate Repositories
If a user mentions a word like "hiithula" (which is a local Tamil word) or asks "push this to my github", DO NOT assume it is a GitHub username or a repository name. 
DO NOT blindly execute `git init` or `git remote add origin https://github.com/username/repo.git`.

## 2. Check Local Context First
Before proposing any git commands, you MUST run the following terminal commands to understand the actual state of the project:
- `git status` (to check if it's a git repo)
- `git remote -v` (to see what the actual GitHub origin URL is)

## 3. Handle Uninitialized Repositories & One-Time Setup (Like Antigravity)
If `git status` returns `fatal: not a git repository` OR if `git remote -v` is empty:
- STOP and ask the user ONCE: "This project is not connected to a GitHub repository yet. What is the GitHub repository URL?"
- Once the user provides the URL, execute `git init` (if needed) and `git remote add origin <URL>`.
- Immediately update `.atcli-memory.md` (or your memory file) to record the GitHub URL for this project so the AI has context.

## 4. Execution (Pushing Code Natively)
- Once the remote origin is set, the URL is permanently stored in the project's `.git/config`.
- Whenever the user says "push to github" again, DO NOT ask for the URL.
- Simply execute `git add .`, `git commit -m "..."`, and `git push origin main` (or the correct branch).
- Rely completely on the local folder's native Git configuration.
