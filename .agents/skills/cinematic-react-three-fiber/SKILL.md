---
name: cinematic-react-three-fiber
description: "Advanced skill for building breathtaking, movie-like 3D web applications using React Three Fiber (R3F), Drei, and React Spring for cinematic transitions."
---

# ⚛️ Cinematic React Three Fiber (R3F) Architecture

When the user asks to build a modern React or Next.js app with "cinematic", "movie scene", or "3D interactive" visuals, you MUST use React Three Fiber.

## 1. Core Stack
- **@react-three/fiber** (React wrapper for Three.js)
- **@react-three/drei** (Pre-built high-quality 3D helpers)
- **@react-three/postprocessing** (For cinematic visual effects)
- **framer-motion-3d** or **@react-spring/three** (For ultra-smooth cinematic transitions)

## 2. Cinematic Rules for AI
To achieve a "movie-like" React application, your code MUST incorporate:
- **Environment & Lighting**: Use Drei's `<Environment preset="city" />` or `<Environment preset="sunset" />` to give all objects hyper-realistic reflections. Use `<ContactShadows>` or `<AccumulativeShadows>` for soft, grounded cinematic shadows.
- **Cinematic Camera**: Do NOT just use static cameras. Use Drei's `<PresentationControls>` or `<CameraControls>`. Animate the camera's `position` and `lookAt` over time using useFrame or React Spring to create slow panning cinematic shots.
- **Post-Processing (MANDATORY)**: Wrap your scene in an `<EffectComposer>`.
  - Add `<Bloom luminanceThreshold={1} intensity={1.5} />` for neon/glowing cinematic highlights.
  - Add `<DepthOfField focusDistance={0} focalLength={0.02} bokehScale={2} />` to blur the background and focus on the hero object (movie style).
  - Add `<Noise opacity={0.02} />` for subtle film grain.
- **HTML UI Overlays**: Use Drei's `<Html>` to perfectly sync premium DOM UI elements (like glassmorphism cards or cinematic titles) to 3D coordinates.

## 3. Project Structure Example
- `src/App.tsx` (Main canvas and global state)
- `src/components/Scene.tsx` (3D Models, Environment, Lighting)
- `src/components/Effects.tsx` (R3F PostProcessing)
- `src/components/Overlay.tsx` (Framer Motion UI Overlay)

## 4. ATCLI Security & 180K Context Enforcement
- **SECURITY BINDING**: When installing `@react-three/fiber` or related packages, ALWAYS use the `sandbox_command` tool to prevent OS compromise.
- **CONTEXT PROTECTION**: R3F component files can grow complex. You MUST use the `replace` tool to modify specific components (e.g., tweaking a shadow cast) rather than rewriting the whole file.
- **MEMORY TRACKING**: Ensure `ATCLI_MEMORY.md` clearly lists the 3D libraries installed and the component structure so the AI retains 180k context continuity across sessions.

## 5. Internet References & Inspiration
If you need exact component patterns, use `search_internet` to find these highly respected resources:
- **Awwwards 3D Collection**: Study Awwwards for lighting and transition inspirations.
- **GitHub Repos**: Study `Fullstack-Empire/GSAP-Awwwards-Website` for an amazing template of React + GSAP + ScrollTrigger for Site-of-the-Day level portfolios.
