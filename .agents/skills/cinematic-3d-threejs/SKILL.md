---
name: cinematic-3d-threejs
description: "Master-level skill for building raw Three.js WebGL cinematic movie-like scenes. Includes GLSL custom shaders, UnrealBloom post-processing, Depth of Field, film grain, PBR lighting, HDRI environments, and GSAP camera movements."
---

# 🎥 Cinematic 3D Three.js Architecture (2026 Standard)

When the user asks for a "cinematic", "movie-like", or "stunning 3D visual" website using Vanilla JS or basic HTML, you MUST use raw Three.js with advanced post-processing and physically based rendering.

> **Internet-verified stack** — cross-referenced with tympanus.net (Codrops), Awwwards.com, and Three.js official documentation.

## 0. MINIMUM VIABLE CINEMATIC SCENE (Non-Negotiable Bar)

Before writing a single line of code, understand: a scene is NOT cinematic unless it passes ALL of these:

```
MANDATORY CHECKLIST — every cinematic build MUST have:
  [ ] At least ONE dominant 3D geometry/object in the foreground (not just particles)
  [ ] PBR lighting: keyLight + fillLight + AmbientLight (never flat-lit)
  [ ] HDRI environment map loaded via RGBELoader (sets mood for free)
  [ ] Post-processing via EffectComposer (UnrealBloomPass minimum)
  [ ] Camera animation: orbit, dolly, or scroll-driven (NEVER completely static)
  [ ] Hero text readable on top of the 3D scene (z-index managed correctly)
  [ ] requestAnimationFrame loop running (scene must MOVE, not freeze)
```

### ANTI-SHORTCUT RULES (These Are the Most Common Failures)
```
❌ DO NOT: "I'll just add a starfield background" — starfield is NOT cinematic 3D
❌ DO NOT: Build the UI first and add 3D "later" — 3D IS the design, build it FIRST
❌ DO NOT: Leave EffectComposer out "to keep it simple" — postFX is what makes it cinematic
❌ DO NOT: Use flat-shaded BoxGeometry without materials — it looks like a debug cube
❌ DO NOT: Skip HDRI and use scene.background = 0x000000 — black void is not cinematic
❌ DO NOT: Call it "cinematic" if the camera never moves — GSAP timeline is REQUIRED
```

### What "Movie-Like" Actually Means in WebGL
```
Think of a movie trailer opening sequence:
  - The camera MOVES — slow dolly forward, arc shot, reveal
  - There is ATMOSPHERE — depth of field, god rays, film grain
  - There is a HERO MOMENT — one dominant beautiful object in frame
  - The lighting is DRAMATIC — single strong key light + subtle fill
  - The pacing is SLOW — cinematic is never rushed

Map this to Three.js:
  Camera moves   → GSAP timeline animating camera.position + camera.lookAt
  Atmosphere     → EffectComposer: UnrealBloomPass + optional BokehPass + FilmPass
  Hero moment    → Prominent 3D geometry with PBR material (metalness + roughness)
  Dramatic light → DirectionalLight(warm, intensity 2+) + PointLight(cool, dim fill)
  Slow pacing    → GSAP ease: "power2.inOut", duration: 2-4 seconds
```


- **`three`** — Core 3D engine. Always import from `three/addons` for extras.
- **`three/addons/postprocessing/EffectComposer`** — Post-processing pipeline.
- **`three/addons/postprocessing/UnrealBloomPass`** — Cinematic bloom (the #1 effect on Awwwards sites).
- **`three/addons/postprocessing/BokehPass`** — Depth of Field (Bokeh) for filmic focus blur.
- **`three/addons/postprocessing/FilmPass`** — Film grain + scanlines for raw cinematic texture.
- **`three/addons/loaders/RGBELoader`** — For loading HDRI environment maps (mandatory for PBR).
- **`gsap`** — For slow, smooth, perfectly eased cinematic camera movements.
- **`lenis`** — For buttery-smooth scroll momentum (verified as standard on award-winning sites).

## 2. MANDATORY Cinematic Rendering Rules
You MUST NEVER render a plain lit box. Every scene MUST have:

### 2a. Physically Based Lighting (PBR)
```js
// Key light (sun/moon)
const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.5);
keyLight.position.set(5, 10, 7);
keyLight.castShadow = true;
scene.add(keyLight);
// Fill light (subtle, opposing side)
const fillLight = new THREE.PointLight(0x4488ff, 0.8, 50);
fillLight.position.set(-5, 2, -5);
scene.add(fillLight);
// Ambient (very low, non-zero to avoid pitch black)
scene.add(new THREE.AmbientLight(0x111111, 0.3));
```

### 2b. HDRI Environment Map (MANDATORY)
```js
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
new RGBELoader().load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture; // makes ALL materials reflective
    scene.background = texture;
});
```

### 2c. Post-Processing (MANDATORY — all 4 passes)
```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.3, 0.85));
composer.addPass(new FilmPass(0.35, false)); // film grain
```

### 2d. Cinematic Camera (GSAP Timeline)
```js
gsap.timeline().to(camera.position, { x: 0, y: 1.5, z: 5, duration: 3, ease: 'power2.inOut' })
               .to(camera.rotation, { y: Math.PI * 0.1, duration: 2, ease: 'sine.inOut' }, '<');
```

## 3. Project Structure
```
src/main.js       — Three.js init, renderer, PBR lights
src/scene.js      — GLTF/GLB model loading, HDRI
src/postfx.js     — EffectComposer pipeline setup
src/camera.js     — GSAP camera timelines
index.html        — Canvas mount + glassmorphism UI overlay
style.css         — Absolute positioned UI (glassmorphism)
```

## 4. ATCLI Security & 180K Context Rules
- **CONTEXT PROTECTION**: Use the `replace` tool to patch specific shader uniforms or GSAP ease values. NEVER rewrite `main.js` for a minor tweak.
- **MEMORY TRACKING**: Log exact UnrealBloomPass `strength/radius/threshold` values in `ATCLI_MEMORY.md`. These are non-obvious and will be lost at 180k context if not recorded.
- **SECURITY**: Only load HDRI from trusted CDNs (poly.pizza, polyhaven.org, or project assets).

## 5. Real Internet References
- **Codrops (tympanus.net)**: #1 source for advanced Three.js + GSAP shader tutorials.
- **Polyhaven.org**: Free verified HDRI maps.
- **GitHub**: `AkbarBakhshi/threejs-gsap-scroll-animation` — verified starter template.
- **Three.js Examples**: Search `examples.threejs.org` for specific `postprocessing/` demos.
