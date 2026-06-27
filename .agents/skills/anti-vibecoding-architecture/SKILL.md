---
name: anti-vibecoding-architecture
description: Enforces clean code architecture, proper folder structures, and software engineering best practices to prevent messy "vibecoding".
---

# Anti-Vibecoding Architecture Protocol

This skill enforces strict software engineering principles to combat "vibecoding" (the tendency of AI to write messy, unstructured, monolithic code). You must always apply these architectural rules:

## 1. Modular and Deep Architecture
- **Deep Modules Principle (John Ousterhout):** Modules and components MUST have deep functionality but simple, narrow interfaces. Do not expose internal complexities.
- **Componentization:** Never dump all code into a single `index.html`, `style.css`, or `script.js` file if the project is complex.
- Break down the UI into logical, reusable modules (e.g., `components/Sidebar.js`, `components/Dashboard.js`, `styles/variables.css`, `styles/layout.css`).

## 2. Separation of Concerns (SOLID)
- Maintain a strict separation between Data (State), Logic (Controllers/Services), and UI (Views/Components).
- **Single Responsibility Principle:** A function or class must do exactly one thing. If a function is over 50 lines, refactor it into smaller helper functions.

## 3. Clean Code and Readability
- **Meaningful Naming:** Variables and functions must have descriptive, intention-revealing names (e.g., `fetchUserData()` instead of `getData()`).
- **Early Returns:** Avoid deeply nested `if/else` statements. Return early to keep the code path flat and readable.
- **Avoid Magic Numbers:** Hardcoded values must be extracted into readable constants at the top of the file.

## 4. Scalable File Structure
- Whenever you initialize a new project, establish a scalable folder structure immediately:
- `/src` (for all source code)
- `/src/components` (for UI elements)
- `/src/utils` or `/src/services` (for business logic and API calls)
- `/src/assets` (for images, icons)
- `/src/styles` (for modular CSS)

## 5. Performance and Resilience
- Ensure the architecture minimizes re-renders and DOM reflows.
- Always include robust `try/catch` blocks for asynchronous code to prevent silent failures.
