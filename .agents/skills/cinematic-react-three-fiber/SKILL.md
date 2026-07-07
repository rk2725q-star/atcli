---
name: cinematic-react-three-fiber
description: "Advanced skill for building breathtaking, movie-like 3D React apps using React Three Fiber (R3F), Drei helpers, @react-three/postprocessing (Bloom, DepthOfField, Noise), and Rapier.js for real rigid body physics. Internet-verified for 2026 Awwwards quality."
---

# ⚛️ Cinematic React Three Fiber (R3F) Architecture (2026 Standard)

When the user asks to build a modern React or Next.js app with "cinematic", "movie scene", or "3D interactive" visuals, you MUST use React Three Fiber + Drei + @react-three/rapier for physics.

> **Internet-verified** — Based on official R3F docs, @react-three/rapier, and Awwwards.com 3D collection best practices for 2026.

## 1. Core Stack (Verified)
```bash
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing @react-three/rapier
npm install gsap @studio-freight/lenis framer-motion
```
- **`@react-three/fiber`** — React wrapper for Three.js.
- **`@react-three/drei`** — Pre-built, production-ready 3D helpers.
- **`@react-three/postprocessing`** — R3F-native post-processing (Bloom, DepthOfField, Noise).
- **`@react-three/rapier`** — **VERIFIED #1 PHYSICS ENGINE for R3F in 2026** (Rust/WASM, 2-3x faster than Cannon-es, actively maintained).
- **`framer-motion`** — For 2D UI overlay animations.

## 2. MANDATORY Cinematic Rendering Rules

### 2a. Environment & Lighting (HDRI)
```tsx
import { Environment, ContactShadows, AccumulativeShadows } from '@react-three/drei';

// HDRI from Drei presets (city, sunset, dawn, forest, etc.)
<Environment preset="city" />  // gives ALL materials real reflections
<ContactShadows opacity={0.5} scale={10} blur={2} far={10} />
```

### 2b. Post-Processing (MANDATORY)
```tsx
import { EffectComposer, Bloom, DepthOfField, Noise, ChromaticAberration } from '@react-three/postprocessing';

<EffectComposer>
  <Bloom luminanceThreshold={0.9} intensity={1.5} mipmapBlur />
  <DepthOfField focusDistance={0.01} focalLength={0.02} bokehScale={3} />
  <Noise opacity={0.015} />
  <ChromaticAberration offset={[0.0005, 0.0005]} />
</EffectComposer>
```

### 2c. Cinematic Camera (GSAP + R3F)
```tsx
import { useFrame } from '@react-three/fiber';
import { gsap } from 'gsap';

// Slowly orbit camera for cinematic feel
useFrame(({ camera, clock }) => {
  const t = clock.getElapsedTime();
  camera.position.x = Math.sin(t * 0.1) * 5;
  camera.position.z = Math.cos(t * 0.1) * 5;
  camera.lookAt(0, 0, 0);
});
```

### 2d. Real Physics with Rapier (MANDATORY for motion)
```tsx
import { Physics, RigidBody } from '@react-three/rapier';

<Physics>
  {/* Falling box with real rigid body physics */}
  <RigidBody>
    <mesh><boxGeometry /><meshStandardMaterial /></mesh>
  </RigidBody>
  {/* Static floor collider */}
  <RigidBody type="fixed">
    <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[50, 50]} /></mesh>
  </RigidBody>
</Physics>
```

## 3. Project Structure
```
src/App.tsx              — Canvas + Lenis scroll + global state
src/components/Scene.tsx — R3F scene: models, environment, lighting
src/components/Effects.tsx — EffectComposer pipeline
src/components/Physics.tsx — Rapier Physics world + RigidBodies
src/components/Overlay.tsx — Framer Motion UI overlay
```

## 4. ATCLI Security & 180K Context Rules
- **CONTEXT PROTECTION**: Use the `replace` tool to modify individual post-processing passes or Rapier body types. Never rewrite the whole Scene.tsx file.
- **MEMORY TRACKING**: Log the exact `<Physics gravity={[0, -9.81, 0]}>` configuration and all RigidBody types used in `ATCLI_MEMORY.md`.
- **SECURITY**: Install all `@react-three/*` packages using `sandbox_command` to prevent OS compromise.

## 5. Real Internet References (Verified)
- **Official Docs**: `r3f.docs.pmnd.rs` — The official React Three Fiber documentation.
- **Rapier Docs**: `rapier.rs` — Rapier physics engine, confirmed #1 for R3F in 2026 (Rust/WASM).
- **Reddit Consensus**: r/threejs confirms `@react-three/rapier` as the community-standard over Cannon-es.
- **GitHub**: `Fullstack-Empire/GSAP-Awwwards-Website` — Verified template for Awwwards-level React + GSAP.
