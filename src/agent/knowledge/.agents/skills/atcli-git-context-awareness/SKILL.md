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

## 3. Handle Uninitialized Repositories
If `git status` returns `fatal: not a git repository`:
- STOP and ask the user: "This project is not a git repository yet. Should I initialize it? What is the GitHub repository URL you want to connect to?"
- DO NOT make up a URL.

## 4. Execution
Once you have the correct context from `git remote -v`, you may proceed with `git add`, `git commit`, and `git push origin <branch>`.
