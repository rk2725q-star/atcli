---
name: cinematic-webgl-fluid-simulation
description: "Ultra-advanced skill for building interactive GPU-based fluid simulations using Navier-Stokes equations in GLSL. Internet-verified against PavelDoGreat/WebGL-Fluid-Simulation and WebGL-Fluid-Enhanced."
---

# 🌊 Cinematic WebGL Fluid Simulation Architecture (2026 Standard)

When the user asks for an interactive "fluid background", "smoke effect", "ink drop", or "liquid metal" visual, you MUST implement a GPU-powered Navier-Stokes fluid simulation using Ping-Pong FBOs.

> **Internet-verified** — Based on `PavelDoGreat/WebGL-Fluid-Simulation` (the most-starred browser fluid sim on GitHub) and `michaelbrusegard/WebGL-Fluid-Enhanced` (the production-ready TypeScript version).

## 1. Core Stack
- **Raw WebGL** (No Three.js — raw GPU control for maximum performance)
- **Framebuffer Objects (FBOs)** — For double-buffered Ping-Pong texture rendering
- **GLSL Fragment Shaders** — For all Navier-Stokes equation calculations
- **Mouse/Touch events** — For interactive force splats

## 2. The Ping-Pong Architecture (MANDATORY)
A fluid simulation reads from Texture A and writes to Texture B, then swaps them. This is called "Ping-Pong buffering".
```js
function createDoubleFBO(gl, w, h) {
    let fbo1 = createFBO(gl, w, h);
    let fbo2 = createFBO(gl, w, h);
    return {
        read: fbo1, write: fbo2,
        swap() { [this.read, this.write] = [this.write, this.read]; }
    };
}
```

## 3. MANDATORY Navier-Stokes Simulation Passes
The simulation MUST run these 5 shader passes every frame in order:
1. **Splat Pass** — Add velocity force where the mouse moves
2. **Advection Pass** — Move the velocity field along itself (makes fluid flow)
3. **Divergence Pass** — Calculate how much fluid is "spreading out"
4. **Pressure Pass** — Solve the Jacobi iteration to make fluid incompressible (loop 20-50x)
5. **Gradient Subtract Pass** — Apply pressure gradient to correct velocity (makes it look real)

## 4. Cinematic Aesthetics
```js
// Cinematic configuration — NOT rainbow chaos
const config = {
    DENSITY_DISSIPATION: 1.2,   // how fast the dye fades (cinematic: slow)
    VELOCITY_DISSIPATION: 0.2,  // how fast the fluid slows (cinematic: gradual)
    PRESSURE: 0.8,
    CURL: 30,                    // turbulence/swirling amount
    SPLAT_RADIUS: 0.25,
    // Cinematic color palette — bioluminescent
    COLORFUL: false,
    BACK_COLOR: { r: 0.02, g: 0.02, b: 0.05 }  // deep space black
};
```

## 5. ATCLI Security & 180K Context Rules
- **CONTEXT PROTECTION**: Fluid shader files are 300-500 lines of GLSL. Use the `replace` tool to modify specific shader uniforms (like `CURL` or `DENSITY_DISSIPATION`). NEVER rewrite the entire shader.
- **MEMORY TRACKING**: Log the exact `config` values used (curl, dissipation, color palette) in `ATCLI_MEMORY.md` for cross-session continuity.
- **SECURITY**: No external binary downloads needed. All fluid simulation logic is pure GLSL — 100% client-side.

## 6. Real Internet References (Verified)
- **GitHub Primary**: `github.com/PavelDoGreat/WebGL-Fluid-Simulation` — The gold-standard reference (15,000+ stars).
- **GitHub Production**: `github.com/michaelbrusegard/WebGL-Fluid-Enhanced` — TypeScript version for production integration.
- **Keywords**: Search "Navier-Stokes WebGL GLSL ping pong FBO" for exact shader implementations.
- **Live Demo**: `paveldogreat.github.io/WebGL-Fluid-Simulation/` — Reference for expected visual quality.
