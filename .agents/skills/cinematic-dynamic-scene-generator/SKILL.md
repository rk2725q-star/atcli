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

## STEP 2 — UNIVERSAL CINEMATIC ANALYSIS (Works for ANY Topic)

Do NOT look up a hardcoded table. Instead, run this analysis for ANY topic the user gives:

### 2a. Extract These 5 Dimensions From the Topic
```
1. ENVIRONMENT TYPE
   Ask: "Where does this domain physically exist in the real world?"
   → Indoor / Outdoor / Abstract space / Fantasy / Industrial / Natural
   → This drives: HDRI choice, floor material, ambient light color
   Example: Finance = glass city towers at night → night city HDRI + reflective glass surfaces
   Example: Education = vast cosmos of knowledge → deep space HDRI + star particles
   Example: Food = warm restaurant = studio HDRI + amber point lights + steam particles
   Rule: ALWAYS choose a REAL polyhaven.org HDRI that matches. Never skip the HDRI.

2. PHYSICAL MOOD  
   Ask: "What energy/emotion does this domain radiate?"
   → Calm / Energetic / Luxurious / Serious / Playful / Mysterious / Hopeful / Intense
   → This drives: Bloom strength (high = energetic, low = calm), camera speed, color temp
   Energetic: UnrealBloom strength 1.5-2.5, fast GSAP (0.8s), warm colors
   Calm/Serious: UnrealBloom strength 0.3-0.6, slow GSAP (2-4s), cool colors
   Luxurious: Single dramatic key light, DOF shallow, slow orbit camera

3. HERO 3D OBJECT  
   Ask: "What is the #1 iconic physical object of this domain?"
   → This becomes the centerpiece of the 3D scene — never leave it empty
   → If no GLB model available: build procedurally with THREE geometries + PBR material
   → NEVER leave hero area as just particles — there must be a TANGIBLE 3D OBJECT
   Education: glowing knowledge sphere / orbiting book geometries / constellation of subjects
   Finance: glass skyscraper geometry / rising data pillars / holographic graph surfaces
   Music: 3D equalizer bars (InstancedMesh) / waveform ribbon / rotating vinyl disc
   Rule: Build the hero object with MeshStandardMaterial (PBR) + metalness/roughness.

4. MOTION LANGUAGE  
   Ask: "How do things in this domain physically move?"
   → This drives camera behavior + object animation style
   Slow drift = educational/luxury → camera orbits slowly, objects float with sine wave
   Fast/chaotic = gaming/sports → camera shakes slightly, particles burst
   Rhythmic = music/dance → objects pulse on a sine wave tied to time
   Flow = water/nature → fluid shader or cloth simulation
   Linear/precise = tech/finance → grid alignment, linear GSAP, sharp geometry

5. POST-PROCESSING PROFILE  
   Select based on mood (NOT topic name — multiple topics share the same profile):
   
   CINEMATIC GLOW (bloom + grain): Any domain needing drama: finance, gaming, space, tech
     → UnrealBloomPass(strength: 1.0-1.8, radius: 0.4, threshold: 0.2) + FilmPass(0.25)
   
   SOFT FOCUS (DOF only): Any domain needing intimacy/luxury: fashion, food, education close-up
     → BokehPass(focus: 1.0, aperture: 0.025, maxblur: 0.01)
   
   BOLD NEON (high bloom, no grain): Gaming, music, esports, entertainment
     → UnrealBloomPass(strength: 2.5, radius: 0.6, threshold: 0.15)
   
   CLEAN SUBTLE (low bloom): SaaS dashboards, educational clean reads, corporate
     → UnrealBloomPass(strength: 0.4, radius: 0.3, threshold: 0.85)
```

### 2b. Generate a Scene Brief (Write to ATCLI_MEMORY.md BEFORE Coding)
```
Before writing any code, write this in ATCLI_MEMORY.md:

SCENE BRIEF for [topic]:
  Environment : [HDRI file + why it fits]
  Hero Object : [what 3D object anchors the scene + how to build/load it]
  Motion      : [camera movement style + object animation type + speed]
  Mood        : [key light color/intensity + ambient color]
  PostFX      : [which profile above + exact numeric values]
  Scroll      : [how scroll maps to camera or object transforms via GSAP ScrollTrigger]
  UI Layer    : [glassmorphism or minimal text overlay positioning]
```

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
Do NOT hardcode by topic name. Use the 5-dimension analysis from Step 2 to select the correct post-processing profile. The profiles are defined in Step 2a dimension 5.

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

## STEP 9 — MANDATORY CINEMATIC SELF-VERIFICATION (NEVER SKIP THIS)

After building ANY website with cinematic 3D, you MUST verify the result YOURSELF.
Shipping without verifying is a CRITICAL FAILURE — the user cannot trust "done" without proof.

### Verification Protocol
```
1. Start the dev server (npm run dev / npm start)
2. Open the localhost URL in browser — AUTO, do not wait for user to do it
3. Take a screenshot of:
   a. The hero/above-fold section
   b. Scroll 50% down (features/content section)
   c. Scroll 100% down (footer/CTA)
4. For EACH screenshot, verify:
   ✔ Is there a live 3D WebGL scene visible (not just CSS gradient or image)?
   ✔ Are there real 3D objects (geometry, models) — not just tiny star particles?
   ✔ Is post-processing active? (Check: bloom glow on bright objects, or film grain)
   ✔ Does the scene animate? (Rotation, scroll-drive, or camera movement)
   ✔ Is hero text clearly readable over the 3D scene?
   ✔ Does it look Awwwards-quality or better? NOT a Three.js tutorial demo.
5. ANY answer is NO → FIX and re-screenshot until all pass
6. Embed final screenshot in your completion message
```

### The Cinematic Bar — What Each Looks Like
```
FAIL (do NOT ship):
  ✘ Starfield dots only — no 3D geometry
  ✘ Plain dark background with feature cards
  ✘ WebGL canvas blank (init failed silently)
  ✘ Bloom not visible / everything looks flat-lit
  ✘ Camera never moves — completely static scene
  ✘ Looks like a standard HTML website with a canvas slapped behind it

PASS (acceptable to ship):
  ✔ Clear 3D geometry visible in hero (at least one substantial 3D object)
  ✔ Post-processing glow/depth visible on that object
  ✔ Scene animates (rotation / scroll parallax / camera drift minimum)
  ✔ Text and UI readable on top of the 3D scene
  ✔ First impression = "this is impressive" not "this is a website"

EXCELLENT (target for all cinematic builds):
  ✔ Hero section looks like a movie opening sequence
  ✔ Scroll reveals new 3D elements (GSAP ScrollTrigger)
  ✔ Depth-of-field or cinematic bloom on hero object
  ✔ HDRI environment visible in reflective materials
  ✔ 60fps smooth, no jank on mid-range hardware
```

### Common Failures & Fixes
| Symptom in Screenshot | Root Cause | Fix |
|---|---|---|
| Black canvas / blank 3D area | WebGL init error (check console) | Add `renderer.setSize()` + verify canvas mount |
| Starfield only, no 3D objects | Scene analysis skipped hero object step | Add dominant 3D geometry per Step 2a dimension 3 |
| Bloom/glow missing | `composer.render()` not replacing `renderer.render()` | Swap render call in animation loop |
| Hero text invisible | Canvas z-index above text layer | Set canvas `z-index: 0`, text container `z-index: 10` |
| Everything flat-lit | No PBR lights or HDRI | Add keyLight + fillLight + RGBELoader HDRI |
| Scene static, no motion | No requestAnimationFrame or GSAP timeline | Add animation loop + basic rotation/orbit |
| Too heavy, lags | All effects enabled on mobile | Apply adaptive quality from Step 8 |

---

## ATCLI Security & 180K Context Rules
- **MANDATORY FIRST ACTION**: Write the SCENE BRIEF (from Step 2b) to `ATCLI_MEMORY.md` BEFORE any code. This plan is your anchor at 180k context resend.
- **CONTEXT PROTECTION**: The scene brief in memory must include: environment choice, hero object, motion style, lighting values, and effect profile. At 180k context, this is injected back so the AI never forgets what scene it was building.
- **SECURITY**: Only download GLTF assets from: `mixamo.com`, `sketchfab.com`, `poly.pizza`, `polyhaven.org`. NEVER download from random URLs.

## Real Internet References
- **Mixamo**: `mixamo.com` — Free character animations
- **Poly.haven HDRI**: `polyhaven.org/hdris` — Free HDRI by mood (search "night", "forest", "studio", etc.)
- **Sketchfab**: `sketchfab.com` — Free downloadable 3D models
- **Poly Pizza**: `poly.pizza` — Quick low-poly models
- **Awwwards**: `awwwards.com` — The cinematic quality bar reference
- **Codrops**: `tympanus.net/codrops` — Scene shader techniques
