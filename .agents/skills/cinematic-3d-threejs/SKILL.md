---
name: cinematic-3d-threejs
description: "Master-level skill for building raw Three.js WebGL cinematic movie-like scenes. Includes shaders, post-processing (Bloom, DOF), and cinematic camera movements."
---

# 🎥 Cinematic 3D Three.js Architecture

When the user asks for a "cinematic", "movie-like", or "stunning 3D visual" website using Vanilla JS or basic HTML, you MUST use raw Three.js with advanced post-processing to achieve film-quality aesthetics.

## 1. Core Stack
- **Three.js** (Core 3D Engine)
- **EffectComposer** (Post-Processing pipeline for film effects)
- **GSAP** (For cinematic camera animations and timelines)
- **Vanilla CSS/Tailwind** (For HUD UI overlay)

## 2. Cinematic Rules for AI
To achieve a "movie-like" scene, you must NEVER just render a plain 3D object. You MUST implement:
- **Lighting**: Use physically based rendering (PBR). Combine `AmbientLight` (low intensity), a main `DirectionalLight` (key light), and `PointLights` (rim/fill lights) to create dramatic shadows.
- **Environment Maps (HDRI)**: Always load an HDRI map using `RGBELoader` or `CubeTextureLoader` to give materials realistic reflections.
- **Post-Processing (MANDATORY)**: You MUST set up an `EffectComposer`.
  - Add `RenderPass`.
  - Add `UnrealBloomPass` for glowing lights and cinematic bloom.
  - Add `BokehPass` or Depth of Field for a cinematic focus effect.
  - Add `FilmPass` or noise for film grain.
- **Cinematic Camera**: Start the camera close to an object (macro shot) and use GSAP to slowly pan, zoom, or orbit the camera. The movement must be extremely smooth (`power2.inOut`).

## 3. Project Structure Example
- `index.html` (Canvas + UI Overlay)
- `src/main.js` (Three.js init, lighting, post-processing)
- `src/scene.js` (Object loading, shaders)
- `src/camera.js` (GSAP camera timelines)
- `style.css` (Absolute positioned UI with Glassmorphism)

## 4. ATCLI Security & 180K Context Enforcement
- **SECURITY BINDING**: When writing these 3D scripts, you MUST continue adhering to all ATCLI OS security rules. Never execute unknown scripts.
- **CONTEXT PROTECTION**: Cinematic 3D code can get very large. You MUST use the `replace` tool to modify specific shader lines or GSAP animations. Do NOT rewrite the entire `main.js` file just to tweak a light's intensity.
- **MEMORY TRACKING**: Log all your major 3D architecture decisions in `ATCLI_MEMORY.md` so that on the 180k context auto-resend, the next session instantly knows how the EffectComposer is configured.

## 5. Internet References & Inspiration
If you need exact shader code or GSAP math, use `search_internet` to find these highly respected Awwwards-style resources:
- **Codrops (tympanus.net)**: The ultimate source for shader-based depth and scroll-controlled 3D showcases.
- **GitHub Repos**: Study `JosephASG/codrops-cinematic-scroll-animations` or `AkbarBakhshi/threejs-gsap-scroll-animation` for exact code templates.
