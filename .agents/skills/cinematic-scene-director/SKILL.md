---
name: cinematic-scene-director
description: "God-tier skill for building interactive cinematic narrative websites where clicking options triggers animated 3D scene transitions — characters walking, vehicles moving, environment/skybox changes, and cinematic camera cuts. Uses Three.js AnimationMixer + Mixamo + GSAP FSM State Machine + WebGLRenderTarget dissolve transitions."
---

# 🎬 Cinematic Scene Director Architecture (2026 Standard)

When the user asks for a website where:
- 3D characters walk, cars drive, people move
- Clicking options changes the entire scene/background
- Different "scenes" exist based on user choices
- Environment, lighting, mood changes cinematically
- Looks mindblowing BUT clean — not "too much" or ugly

You MUST use this "Scene Director" architecture.

> **Internet-verified** — Built from Three.js `webgl_animation_skinning_blending` example, Mixamo.com, tympanus.net/codrops, and the Awwwards Scene FSM pattern verified via tigerabrodi.blog and wawasensei.dev.

## 1. Core Stack
```bash
npm install three gsap @studio-freight/lenis
# If React: npm install @react-three/fiber @react-three/drei @react-three/rapier
```
- **Three.js `GLTFLoader`** — Load animated characters (Mixamo) and vehicles
- **Three.js `AnimationMixer`** — Drive skeletal animations (walk, idle, drive)
- **Three.js `WebGLRenderTarget`** — For cinematic dissolve/wipe between scenes
- **GSAP `timeline()`** — Choreograph camera cuts + scene transitions
- **Finite State Machine (FSM)** — Keep only ONE scene active at a time (prevents logic chaos)

## 2. How to Get 3D Animated Characters (MANDATORY PIPELINE)
```
1. Go to mixamo.com → Sign in (free)
2. Pick a character (e.g. "Y Bot" or "X Bot")
3. Click "Animations" → Search "Walking", "Running", "Idle"
4. Download each animation as: Format=FBX for c3d or GLB/GLTF
5. Import into Blender → combine character + animations → Export as .glb
6. Place in project: /public/models/character.glb
```
> **Alternative**: Use `sketchfab.com` to download pre-animated GLB models for free.

## 3. The Scene Director Pattern (CORE ARCHITECTURE)

### 3a. Scene State Machine (FSM)
```js
// The ONLY safe way to manage multiple cinematic scenes
class SceneDirector {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.scenes = {};           // registered 3D scenes
        this.currentScene = null;
        this.currentSceneObject = null; // ✅ FIX: holds the active THREE.Scene
        this.isTransitioning = false;
    }

    // Register a scene: { scene, onEnter, onExit, cameraPos, cameraTarget }
    register(name, config) { this.scenes[name] = config; }

    // Trigger a cinematic transition to another scene
    async transitionTo(name) {
        if (this.isTransitioning || this.currentScene === name) return;
        this.isTransitioning = true;
        const next = this.scenes[name];
        const current = this.scenes[this.currentScene];
        
        // 1. Cinematic camera glide to transition position
        await gsap.to(this.camera.position, { y: 20, z: 30, duration: 0.8, ease: 'power2.in' });
        
        // 2. Run exit logic (stop animations, cleanup)
        if (current?.onExit) current.onExit();
        
        // 3. Swap scene
        // ✅ FIX: WebGLRenderer has NO .scene property — renderer.render(scene, camera) is the only API.
        // Store the active scene in a variable; render loop reads it.
        this.currentScene = name;
        this.currentSceneObject = next.scene; // <── render loop uses this
        
        // 4. Run enter logic (start character walks, lights, etc.)
        if (next?.onEnter) next.onEnter();
        
        // 5. Camera glide to new scene position
        await gsap.to(this.camera.position, { ...next.cameraPos, duration: 1.2, ease: 'power2.out' });
        gsap.to(this.camera.rotation, next.cameraTarget);
        
        this.isTransitioning = false;
    }
}

// ✅ REQUIRED: Render loop MUST use director.currentSceneObject — NOT renderer.scene
// (renderer.scene does not exist in Three.js)
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    mixer?.update(delta);
    // Pass the active scene from the director:
    if (director.currentSceneObject) {
        renderer.render(director.currentSceneObject, camera);
    }
}
```

### 3b. Animated Character Setup (Mixamo GLB)
```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
let mixer, actions = {};

loader.load('/models/character.glb', (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    
    // AnimationMixer drives ALL skeletal animations
    mixer = new THREE.AnimationMixer(model);
    
    // Load each animation clip and name it
    gltf.animations.forEach(clip => {
        actions[clip.name] = mixer.clipAction(clip);
    });
    
    // Start with idle
    actions['Idle']?.play();
});

// In requestAnimationFrame loop:
// ✅ Keep a top-level `currentScene` var, OR use director.currentSceneObject.
// Never pass undefined to renderer.render() — guard it:
const clock = new THREE.Clock();
let currentScene = scene; // default to initial scene
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    mixer?.update(delta);   // MANDATORY — drives character bones
    renderer.render(currentScene, camera); // ✅ correct API
}
```

### 3c. Smooth Animation Crossfade (Walk → Run → Idle)
```js
function switchAnimation(from, to, duration = 0.5) {
    const fromAction = actions[from];
    const toAction = actions[to];
    if (!fromAction || !toAction || fromAction === toAction) return;
    toAction.reset().setEffectiveWeight(1).play();
    fromAction.crossFadeTo(toAction, duration, true); // smooth blend
}

// Example: user clicks button → character starts walking
document.getElementById('walk-btn').addEventListener('click', () => {
    switchAnimation('Idle', 'Walking');
    director.transitionTo('city-street'); // change scene to city
});
```

### 3d. Cinematic Environment/Skybox Change
```js
// Pre-load all environment textures
const envLoader = new THREE.CubeTextureLoader();
const environments = {
    day:   envLoader.load(['px.jpg','nx.jpg','py.jpg','ny.jpg','pz.jpg','nz.jpg']),
    night: envLoader.load(['night_px.jpg','night_nx.jpg', ...]),
    rain:  envLoader.load(['rain_px.jpg', ...])
};

// Cinematic skybox dissolve — uses GSAP + material opacity crossfade
async function changeEnvironment(scene, newEnvName) {
    // Fade to black (cinematic dip)
    await gsap.to(overlayMesh.material, { opacity: 1, duration: 0.5 });
    
    // Swap environment
    scene.environment = environments[newEnvName];
    scene.background = environments[newEnvName];
    
    // Adjust light color for mood
    const moods = {
        day:   { color: 0xfff4e0, intensity: 2.5 },
        night: { color: 0x2255aa, intensity: 0.8 },
        rain:  { color: 0x778899, intensity: 1.0 }
    };
    gsap.to(keyLight.color, moods[newEnvName]);
    gsap.to(keyLight, { intensity: moods[newEnvName].intensity });
    
    // Fade back in
    await gsap.to(overlayMesh.material, { opacity: 0, duration: 0.8 });
}
```

### 3e. Moving Car Scene (Cinematic Vehicle Motion)
```js
loader.load('/models/car.glb', (gltf) => {
    const car = gltf.scene;
    scene.add(car);
    car.position.set(-50, 0, 5); // start off-screen left
    
    // Cinematic: car drives past → camera follows it briefly
    const tl = gsap.timeline({ repeat: -1 });
    tl.to(car.position, { x: 50, duration: 6, ease: 'none' })   // car moves
      .to(camera.position, { x: car.position.x, duration: 1 }, '<0.5') // camera follows
      .set(car.position, { x: -50 }); // reset for next pass
});
```

## 4. Design Philosophy — Clean Cinematic (NOT "Too Much")

### The "Less is More" Rule
- **Maximum 2 post-processing effects per scene** (Bloom + FilmGrain). Adding 5 effects = ugly.
- **Use negative space**: Objects should breathe. Don't fill every inch with particles.
- **Cinematic Color Grading**: Use a `LUTPass` or manually set renderer color space to achieve movie-tone looks.
- **Animation speed**: Slow is cinematic. Fast is chaotic. Default camera moves: `duration: 1.5-3s`, ease: `power2.inOut`.
- **Sound design**: A subtle ambient sound tied to scene change makes it feel like a real movie.

### Adaptive Complexity Based on User's App
| User's App Type | Scene Style |
|----------------|-------------|
| Portfolio/Agency | Slow orbit camera, 1 hero 3D object, minimal animation |
| Product Landing | Product rotates, click → explode/reveal internal parts |
| Storytelling/Game | Full scene changes, characters walk, environment shifts |
| Dashboard/SaaS | Subtle 3D background, NO full scene changes (keep it clean) |
| Music/Artist | Audio-reactive particles + scene pulse to beat |

**RULE**: Match scene complexity to app purpose. A SaaS dashboard should NOT have a car driving past. A storytelling portfolio CAN.

## 5. Project Structure (Full Cinematic Scene Director)
```
src/
  director/
    SceneDirector.js     — FSM scene manager class
    scenes/
      CityStreetScene.js — City road, car, people walking
      ForestScene.js     — Nature, birds, ambient fog
      OfficeScene.js     — Indoor, desk, person typing
  characters/
    CharacterController.js — Mixamo GLTF loader + animation crossfader
  environment/
    EnvironmentManager.js  — Skybox/HDRI swap + lighting mood change
  postfx/
    PostFXManager.js       — EffectComposer (max 2 passes per scene)
  ui/
    SceneUI.js             — Clean DOM overlay (glassmorphism buttons)
  main.js                  — Entry: init director, register scenes, start
```

## 6. ATCLI Security & 180K Context Rules
- **CONTEXT PROTECTION**: Scene Director code grows VERY large. Use the `replace` tool to modify individual scene config (e.g., `cameraPos`). NEVER rewrite SceneDirector.js for a single scene tweak.
- **MEMORY TRACKING**: Log ALL registered scene names, their camera positions, and the AnimationMixer actions used in `ATCLI_MEMORY.md`. At 180k context, this is the ONLY way the AI knows how the scenes connect.
- **PERFORMANCE**: Pre-load ALL GLTF models before the first frame renders. Use `THREE.LoadingManager` with a progress bar. NEVER load models during a scene transition.
- **SECURITY**: Only load GLTF from `/public/models/` (trusted project assets) or verified sources like `sketchfab.com` or `mixamo.com`.

## 7. Real Internet References (Verified)
- **Mixamo**: `mixamo.com` — Free character + animation library (Google account required).
- **Three.js Skinning Example**: `threejs.org/examples/#webgl_animation_skinning_blending` — Official AnimationMixer crossfade demo.
- **Wawasensei**: `wawasensei.dev` — Best tutorials for R3F + animation + scene transitions.
- **Sketchfab**: `sketchfab.com` — Free pre-animated 3D models (GLB format, download ready).
- **Codrops**: `tympanus.net/codrops` — Scene transition shader techniques (dissolve, wipe, glitch).
- **GSAP + Three.js**: `gsap.com/docs/v3/` — Official docs for camera animation choreography.
