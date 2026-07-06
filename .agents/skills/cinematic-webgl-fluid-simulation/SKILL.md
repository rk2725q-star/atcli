---
name: cinematic-webgl-fluid-simulation
description: "Ultra-advanced skill for building mind-blowing Awwwards-winning interactive fluid simulations using Navier-Stokes GPGPU equations on the web."
---

# 🌊 Cinematic WebGL Fluid Simulation Architecture

When the user asks for a "mind-blowing", "fluid", "smoke", or "interactive background" website, you MUST implement a GPGPU-based fluid simulation. This is the pinnacle of Awwwards web design.

## 1. Core Stack
- **WebGL / Three.js** (For raw rendering)
- **GPGPU (General-Purpose computing on Graphics Processing Units)**
- **Ping-Pong Buffering** (For reading and writing textures simultaneously)
- **GLSL Shaders** (Fragment shaders for calculating fluid dynamics)

## 2. Cinematic Rules for AI
To achieve a "mind-blowing" fluid experience, you MUST NOT use a simple canvas 2D context. You MUST:
- **Use the Navier-Stokes Equations**: The fluid must have realistic pressure, velocity, and dye advection.
- **Interactive Triggers**: Tie the fluid velocity vectors to the user's `mousemove` or `touchmove` events so the fluid swirls around their cursor.
- **Color Palettes**: Use deep, cinematic colors (e.g., bioluminescent blues, deep purples, neon pinks). Do not use chaotic rainbow colors.
- **High-Performance**: Run all physics calculations on the GPU using Framebuffer Objects (FBOs) and Ping-Pong buffering.

## 3. ATCLI Security & 180K Context Enforcement
- **SECURITY BINDING**: When installing libraries or compiling local servers, use the `sandbox_command` tool.
- **CONTEXT PROTECTION**: Fluid shaders are mathematically dense. You MUST use the `replace` tool to modify specific GLSL uniform values (like `curl`, `viscosity`, `dissipation`). Do NOT rewrite the entire shader file.
- **MEMORY TRACKING**: Explicitly log the mathematical variables you used for the simulation in `ATCLI_MEMORY.md` to persist the 180k context barrier.

## 4. Internet References & Inspiration
If you need exact mathematical formulas or GLSL code, use `search_internet` to find these highly respected resources:
- **GitHub Repos**: Study `PavelDoGreat/WebGL-Fluid-Simulation` for the absolute gold standard of browser fluid dynamics.
- **GitHub Repos**: Study `michaelbrusegard/WebGL-Fluid-Enhanced` for a production-ready module version.
- **Keywords to search**: "Ping-pong buffering WebGL", "Navier-Stokes GLSL fragment shader".
