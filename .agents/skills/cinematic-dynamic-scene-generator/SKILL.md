---
name: cinematic-dynamic-scene-generator
description: "THE MASTER SKILL: When a user asks to build ANY website or app, this skill teaches the AI to AUTOMATICALLY analyze the topic/domain and generate a fully appropriate, unique cinematic 3D movie scene for it — without the user having to specify any 3D details. Hospital website = doctors walking + ambulance. Music app = audio-reactive stage. Travel app = airplane + clouds + beach. FULLY DYNAMIC, topic-driven cinematic scene creation."
---

# 🧠 Cinematic Dynamic Scene Generator (2026 — THE MASTER SKILL)

When a user says **"build me a [TOPIC] website/app"** — you MUST NOT just build a plain UI.
You MUST also autonomously:
1. Analyze the topic/domain of the request
2. Map it to a rich, thematic cinematic 3D scene
3. Combine all relevant cinematic skills to build it
4. Match visual mood, lighting, and effects to the topic
5. Keep it clean, mindblowing, NOT ugly or "too much"

> This skill is the BRAIN that decides WHICH scenes, characters, environments, and effects to generate for ANY topic.

---

## STEP 1 — ANALYZE THE TOPIC (MANDATORY FIRST STEP)

Before writing ANY code, you MUST run this mental analysis:

```
USER PROMPT → EXTRACT:
  1. Domain/Industry  (hospital, music, travel, food, finance, tech, fashion...)
  2. Mood            (calm, energetic, luxurious, serious, playful, mysterious...)
  3. Core Action     (what do people DO in this domain? walk, fly, cook, code, dance?)
  4. Visual Identity (colors, time of day, environment type, weather)
  5. Key Objects     (vehicles, tools, buildings, nature elements relevant to topic)
```

---

## STEP 2 — TOPIC-TO-SCENE MAPPING TABLE

Use this table to auto-select the right scene elements for ANY topic:

| User's Topic | 3D Scene | Characters/Objects | Environment | Lighting Mood | Key Effect |
|---|---|---|---|---|---|
| **Hospital / Medical** | Hospital corridor interior | Doctor walking, nurse, stretcher moving | White halls, blue accent | Cold white fluorescent | Depth of Field on foreground doctor |
| **Music / Artist** | Concert stage | Stage with spotlights, crowd silhouettes | Dark stage, fog machine | Dynamic colored spotlights | Audio-reactive bloom on beat |
| **Travel / Tourism** | Airport or tropical beach | Airplane landing, tourists walking | Sky HDRI, ocean, sunset | Warm golden hour | Lenis scroll reveals destinations |
| **Food / Restaurant** | Kitchen or restaurant interior | Chef cooking, steam particles, plating | Warm amber, brick walls | Warm candlelight | Depth of Field on hero dish |
| **Finance / Banking** | City skyline at night | Glass buildings, data particles rising | Night city HDRI | Cool blue, neon reflections | Raymarched data flow particles |
| **Fashion / Luxury** | Minimalist showroom | Mannequin rotating, fabric cloth sim | Pure white or black void | Single dramatic key light | Verlet cloth simulation on fabric |
| **Tech / SaaS** | Abstract data space | Floating UI cards, nodes connecting | Deep space, grid floor | Blue/purple cool tones | GSAP scroll reveals floating panels |
| **Gaming / Esports** | Neon arena | Player character, lightning effects | Dark arena, neon glow | RGB neon | UnrealBloom + particle explosions |
| **Education / School** | Classroom or library | Student at desk, books floating | Warm oak wood interior | Morning golden light | Soft shadow + parallax scroll |
| **Fitness / Sports** | Stadium or gym | Athletic character running, weights | Outdoor field or gym | High contrast, dramatic | Motion blur + dynamic camera |
| **Real Estate** | Architectural exterior | Building materializing, camera flythrough | Suburban or city, blue sky | Overcast soft light | GSAP camera path animation |
| **Nature / Eco** | Forest or ocean | Trees swaying, birds, water ripples | Forest HDRI, green | Diffused daylight | Fluid simulation for water |
| **Space / Sci-Fi** | Space exterior | Spaceship, asteroid field, planets | HDRI space, stars | Cold blue starlight | Raymarching + particle nebula |
| **Art / Portfolio** | Abstract gallery | Floating artworks, light beams | Dark gallery, spotlights | Dramatic spot lighting | Raymarched abstract shapes |
| **News / Media** | Broadcast studio | Anchor at desk, screens behind | Blue/grey studio | Studio lighting rig | Chromatic aberration + bokeh |

---

## STEP 3 — DYNAMIC SCENE GENERATION PROTOCOL

Once you identify the topic, follow this exact build protocol:

### 3a. Scene Inventory (Generate BEFORE coding)
```
Before writing code, write this plan in ATCLI_MEMORY.md:

SCENE PLAN for [TOPIC]:
  Environment: [what HDRI/skybox/interior to use]
  Characters:  [Mixamo animation names needed — e.g., "Walking", "Idle", "Typing"]
  Key Objects: [models needed — e.g., ambulance.glb, desk.glb, airplane.glb]
  Mood:        [lighting config — key light color, intensity, ambient]
  Effects:     [post-processing — Bloom Y/N, DoF Y/N, FilmGrain Y/N, Fluid Y/N]
  Transitions: [what happens on click/scroll — scene names and their configs]
  Camera:      [starting position, movement style — orbit/track/fixed]
```

### 3b. Free 3D Asset Sources (ALWAYS check these first)
```
Models:
  - sketchfab.com/search?q=[topic]&features=downloadable (free GLB models)
  - poly.pizza — simple free low-poly 3D models (great for performance)
  - market.pmnd.rs — R3F specific model marketplace

Characters/Animations:
  - mixamo.com — FREE animated humanoid characters (walking, running, idle)

Environments/HDRI:
  - polyhaven.org/hdris — FREE photo-realistic HDRI maps (sunset, forest, city)
  - Choose based on topic mood from mapping table above

Textures:
  - polyhaven.org/textures — FREE seamless PBR textures
```

### 3c. Code Generation Order (STRICT — follow this sequence)
```
1. Set up Three.js / R3F canvas + renderer + camera
2. Load HDRI environment map (polyhaven.org) → sets the mood FIRST
3. Set up lighting (match topic from mapping table)
4. Load 3D models using GLTFLoader (characters, key objects)
5. Set up AnimationMixer for each animated character
6. Set up SceneDirector FSM (from cinematic-scene-director skill)
7. Set up post-processing EffectComposer (MAX 2 passes — keep it clean)
8. Set up UI overlay (clean glassmorphism buttons for scene switching)
9. Wire click events → SceneDirector.transitionTo()
10. Set up Lenis smooth scroll (MANDATORY for premium feel)
```

### 3d. Auto-Select Post-Processing Per Topic
```js
// DO NOT add ALL effects — only what the topic needs
const effectsProfile = {
    hospital:  { bloom: false, dof: true,  grain: true,  fluid: false },
    music:     { bloom: true,  dof: false, grain: false, fluid: false },
    travel:    { bloom: false, dof: true,  grain: false, fluid: false },
    food:      { bloom: false, dof: true,  grain: true,  fluid: false },
    finance:   { bloom: true,  dof: false, grain: false, fluid: false },
    fashion:   { bloom: false, dof: true,  grain: false, fluid: false },
    gaming:    { bloom: true,  dof: false, grain: false, fluid: false },
    space:     { bloom: true,  dof: false, grain: true,  fluid: false },
    nature:    { bloom: false, dof: false, grain: false, fluid: true  },
};
// Apply only the selected effects — prevents visual overload
```

---

## STEP 4 — CLEAN DESIGN ENFORCEMENT RULES

These rules make the difference between "mindblowing" and "ugly":

### ❌ NEVER DO THIS:
- Add ALL post-processing effects at once (bloom + DOF + grain + chromatic = ugly)
- Use rainbow / too-colorful particle systems for serious topics (hospital, finance)
- Make the 3D scene so busy that the UI text becomes unreadable
- Play all character animations simultaneously (creates chaos)
- Use placeholder grey boxes ("I'll add models later") — load real assets

### ✅ ALWAYS DO THIS:
- **One hero moment**: Every scene has ONE thing the camera focuses on
- **Negative space**: Leave breathing room. 70% of screen can be clean/empty
- **Typography first**: Make sure the 3D scene SUPPORTS the text, never fights it
- **Consistent palette**: Pick 2-3 colors max from the topic identity
- **Graceful loading**: Show a cinematic loading screen while 3D assets load
- **Fallback**: If WebGL fails, show a beautiful static gradient background

---

## STEP 5 — EXAMPLE PROMPT TRANSFORMATION

### User says: *"build me a hospital website"*

```
ANALYSIS:
  Domain: Medical/Healthcare
  Mood: Calm, trustworthy, professional, hopeful
  Core Action: People walking corridors, doctors helping
  Visual: White + blue, fluorescent light, clean

AUTO-GENERATED SCENE PLAN:
  Environment: Interior hospital corridor (white walls, tiled floor geometry)
  Characters:  1x Doctor (Mixamo "Walking" animation, white coat model)
               1x Nurse (Mixamo "Idle" animation, background)
  Key Objects: Corridor geometry (box geometries), wall signs
  Mood:        AmbientLight(0xffffff, 0.4) + DirectionalLight(0x4488ff, 1.5)
  Effects:     DepthOfField only (focusDistance: 0.02) — crisp foreground, soft back
  Camera:      Fixed, slightly low angle, doctor walks toward camera
  Transitions: Click "Emergency" → Red light floods scene + ambulance sound
               Click "Consultation" → Warm room environment + desk scene

CODE OUTPUT:
  - Hospital corridor built from THREE.BoxGeometry (no model needed)
  - Doctor character from mixamo.com → GLB → AnimationMixer "Walking"
  - DepthOfField post-processing focuses on approaching doctor
  - Clean white UI overlay with glassmorphism service cards
  - Soft ambient occlusion for realistic indoor feel
```

### User says: *"build me a music streaming app"*

```
ANALYSIS:
  Domain: Music/Entertainment  
  Mood: Energetic, immersive, emotional, alive
  Core Action: Music playing, beat-driven visuals
  Visual: Dark, neon, dynamic colors, stage vibes

AUTO-GENERATED SCENE PLAN:
  Environment: Concert stage (dark background, fog geometry)
  Characters:  Floating equalizer bars (InstancedMesh) reacting to audio
  Key Objects: Stage lights (PointLight array), crowd silhouettes (planes)
  Mood:        Dark ambient + dynamic PointLights changing color on beat
  Effects:     UnrealBloom (strength:2.0) — neon glow on beat
               Audio-reactive (use cinematic-audio-reactive-particles skill)
  Camera:      Slow orbit around stage center
  Transitions: Click genre → scene color palette shifts + new particle pattern

CODE OUTPUT:
  - Audio-reactive particles (see cinematic-audio-reactive-particles skill)
  - Dynamic PointLight color changes mapped to bass frequencies  
  - UnrealBloomPass with high strength for neon glow
  - Dark glassmorphism UI for track list overlay
```

---

## STEP 6 — SKILL COMBINATION MATRIX

For each topic, automatically combine these skills:

```
ALL cinematic websites (ALWAYS):
  + cinematic-scene-director       (FSM transitions + scene switching)
  + cinematic-3d-threejs           (core rendering + HDRI + postFX)
  + cinematic-3d-asset-codegen     (procedural objects when no GLB available — ALMOST ALWAYS NEEDED)

React / Next.js projects:
  + cinematic-react-three-fiber    (use instead of vanilla Three.js)

Topic-specific additions:
  Music/Gaming visuals:  + cinematic-audio-reactive-particles
  Nature/Water:          + cinematic-webgl-fluid-simulation
  Space/Abstract/SDF:    + cinematic-raymarching-volumetrics
  Fashion/Cloth/Rope:    + cinematic-real-physics-3d (Verlet cloth)
  Product/SaaS/scroll:   + cinematic-gsap-scroll-animations
  Any topic needing 3D objects without GLB files:
                         + cinematic-3d-asset-codegen (procedural generation)

⚠️ GAME-ONLY (explicit playable game requested):
  ONLY when user says "build me a game" / "FPS" / "RPG" / "shooter":
                         + cinematic-game-engine-vibecode
  DO NOT add this skill for cinematic showcase sites, portfolios, or landing pages.
  Reason: Rapier WASM + Yuka adds ~2-4MB bundle and lags on mid-range phones.

DECISION TREE for ambiguous requests:
  "Make it dynamic and interactive" → cinematic-scene-director (scene transitions)
  "Add physics" → cinematic-real-physics-3d (cloth/fluid/verlet)
  "Build a game" → cinematic-game-engine-vibecode (full game engine)
  "No GLB models available" → cinematic-3d-asset-codegen (codegen everything)
```

---

## STEP 7 — CHARACTER PRIORITY RULE

When placing characters in the scene, follow this strict priority order:

```
PRIORITY 1 — HERO / FOREGROUND CHARACTERS (visible, interactive, close-up):
  → ALWAYS use real Mixamo GLB + AnimationMixer
  → Sources: mixamo.com, sketchfab.com, ReadyPlayerMe (rpm.readme.io)
  → Reason: Box-man in the hero spot = immediately kills cinematic feel
  → Example: "Doctor walking toward camera" = real GLB doctor model, MANDATORY

PRIORITY 2 — BACKGROUND / CROWD (50-1000 characters, far from camera):
  → ALWAYS use InstancedMesh box-man (from cinematic-3d-asset-codegen)
  → Reason: 100 individual GLB characters = GPU crash. InstancedMesh = 1 draw call.
  → Example: "City street crowd" = InstancedMesh of 200 box-humans, OK

RULE: Never use box-man for hero characters. Never use GLB for 100+ crowd members.
```

---

## STEP 8 — MOBILE & PERFORMANCE FALLBACK RULES

Every cinematic scene MUST include these guards. Missing these = lag on Galaxy S20 FE, iPhone 12:

```js
// 1. Detect device performance tier at runtime
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
const isLowEnd = isMobile || navigator.hardwareConcurrency <= 4;

// 2. Adaptive quality settings
const QUALITY = {
    shadowMapSize:    isLowEnd ? 512  : 2048,
    maxRigidBodies:   isLowEnd ? 20   : 200,   // Rapier physics limit
    particleCount:    isLowEnd ? 500  : 5000,
    bloomEnabled:     !isLowEnd,
    filmGrainEnabled: !isLowEnd,
    antiAlias:        !isMobile,
};

// 3. Rapier physics step skip on mobile (prevent frame rate drop)
let physicsSkip = 0;
function gameLoop(delta) {
    if (isLowEnd) {
        physicsSkip = (physicsSkip + 1) % 2; // run physics every other frame
        if (physicsSkip === 0) physicsWorld?.step();
    } else {
        physicsWorld?.step();
    }
}

// 4. Respect prefers-reduced-motion (accessibility)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduceMotion) {
    // Disable camera animations, particle systems, transitions
    gsap.globalTimeline.timeScale(0); // freeze all GSAP
    // Keep 3D scene static, just render without animation
}

// 5. WebGL context loss fallback
renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    // Show beautiful fallback: static gradient background
    document.getElementById('webgl-fallback').style.display = 'block';
    cancelAnimationFrame(animationId);
});

// 6. Adaptive pixel ratio (CRITICAL for battery life on mobile)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isLowEnd ? 1 : 2));
```

**Fallback HTML (always include in index.html):**
```html
<div id="webgl-fallback" style="display:none; background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460); 
     width:100%; height:100vh; position:fixed; top:0; left:0;">
  <!-- Beautiful static version of the page -->
</div>
```

---

## ATCLI Security & 180K Context Rules
- **MANDATORY FIRST ACTION**: When given a topic, write the SCENE PLAN to `ATCLI_MEMORY.md` BEFORE any code. This plan is your anchor at 180k context resend.
- **CONTEXT PROTECTION**: The scene plan in memory must include: environment choice, character animations, lighting values, and effect profile. At 180k context, this is injected back so the AI never forgets what scene it was building.
- **SECURITY**: Only download GLTF assets from: `mixamo.com`, `sketchfab.com`, `poly.pizza`, `polyhaven.org`. NEVER download from random URLs.

## Real Internet References
- **Mixamo**: `mixamo.com` — Free character animations
- **Poly.haven HDRI**: `polyhaven.org/hdris` — Free HDRI by topic (search "hospital", "forest", etc.)
- **Sketchfab**: `sketchfab.com` — Free downloadable 3D topic-specific models
- **Poly Pizza**: `poly.pizza` — Quick low-poly models for any topic
