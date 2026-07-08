---
name: cinematic-art-direction
description: "THE MISSING LAYER: Art direction + motion design rules that separate a 7.5/10 dashboard from a 10/10 cinematic movie-like website. Covers: 7-layer depth system, mouse-parallax camera, scroll storytelling choreography, hero-first scene philosophy, rim lighting, floating/orbiting/spring animation vocabulary, cursor effects, and a 15-point self-audit checklist. Use this WITH cinematic-3d-threejs for every cinematic build."
---

# 🎬 Cinematic Art Direction & Motion Design (The Missing Layer)

This skill encodes the difference between "good dashboard" and "movie trailer website".
It is NOT about adding more 3D. It is about **art direction** and **motion design**.

The difference is not MORE 3D — it is LAYERED DEPTH + LIVING MOTION + DRAMATIC LIGHTING.

> Reference bar: stripe.com, linear.app, top Awwwards GSAP entries — 9.5-10/10.

---

## THE CORE PHILOSOPHY — 3D Object IS the Hero

```
WRONG (builds 7.5/10):
  1. Design UI (text, cards, nav)
  2. Add 3D scene "behind" as decoration
  Result: UI is the hero. 3D is wallpaper.

CORRECT (builds 10/10):
  1. Design the 3D SCENE FIRST — what is the centerpiece object?
  2. Build UI AROUND that scene — text floats in the GAPS between 3D objects
  Result: 3D is the hero. UI is the caption.
```

---

## LAYER 1 — The 7-Layer Depth System (NOT 2-3 layers)

```
REQUIRED DEPTH STACK (front → back):
  Layer 1: Cursor effects (closest to viewer, reacts to mouse)
  Layer 2: Foreground UI — glassmorphism panels, text (z-index: 100)
  Layer 3: Hero 3D object — the centerpiece (book, orb, character, product)
  Layer 4: Mid-ground 3D elements — orbiting rings, secondary objects
  Layer 5: Particle system — drifting particles (NOT the main attraction)
  Layer 6: Volumetric glow — god-rays, fog, bloom halos
  Layer 7: Background environment — HDRI, skybox, deep gradient
  [Optional] Layer 8: Rim light plane BEHIND hero (cinematic separation)
  [Optional] Layer 9: Post-processing wraps all layers (bloom, DOF, vignette)

RULE: Each layer animates at DIFFERENT speeds (parallax).
RULE: Each layer has DIFFERENT blur/focus (DOF simulation).
RULE: Each layer has DIFFERENT opacity response to scroll.
```

```js
// Assign real z-positions — not just CSS z-index
heroOrb.position.z = 0;           // Layer 3: focal point
orbitRing.position.z = -1;        // Layer 4: behind hero
particles.position.z = -3;        // Layer 5: mid-ground
atmosphericPlane.position.z = -8; // Layer 6: far glow
// BokehPass focuses at z=0, blurs everything else
bokehPass.uniforms.focus.value = 1.0;
bokehPass.uniforms.aperture.value = 0.025;
```

---

## LAYER 2 — Camera Movement (The #1 Differentiator)

A static camera = a screenshot. A moving camera = a movie.

### 2a. Idle Camera Drift — ALWAYS ON
```js
// Gentle sinusoidal drift — scene BREATHES even when user is not scrolling
let t = 0;
function animate() {
    requestAnimationFrame(animate);
    t += 0.003;
    camera.position.x = Math.sin(t) * 0.3;
    camera.position.y = Math.cos(t * 0.7) * 0.15;
    camera.lookAt(scene.position);
    composer.render();
}
```

### 2b. Mouse Parallax — MANDATORY
```js
let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;
document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});
function animate() {
    // Sluggish lerp = cinematic weight (0.05 = very slow catch-up)
    targetX += (mouseX * 0.3 - targetX) * 0.05;
    targetY += (-mouseY * 0.2 - targetY) * 0.05;
    camera.position.x += targetX;
    camera.position.y += targetY;
    // Parallax: layers move in OPPOSITE direction to camera
    heroOrb.position.x = -targetX * 0.5;
    particles.rotation.y += 0.001 + targetX * 0.002;
    camera.lookAt(scene.position);
}
```

### 2c. Scroll-Driven Camera Path
```js
const tl = gsap.timeline({
    scrollTrigger: { trigger: '#root', start: 'top top', end: 'bottom bottom', scrub: 1.5 }
});
tl.to(camera.position, { z: 5, y: 0, x: 0, duration: 1 })   // Scene 1: Establish
  .to(camera.position, { z: 3, y: -0.5, duration: 1 })       // Scene 2: Zoom in
  .to(camera.position, { x: -2, z: 4, duration: 1 })         // Scene 3: Arc left
  .to(camera.position, { y: 2, z: 5, duration: 1 })          // Scene 4: Rise up
  .to(camera.position, { x: 0, y: 0, z: 4, duration: 1 });   // Scene 5: Return
```

---

## LAYER 3 — Dramatic Lighting (Rim Lights + Volumetrics)

```js
// Key: warm, directional
const keyLight = new THREE.DirectionalLight(0xffd4a0, 2.5);
keyLight.position.set(5, 8, 5);
keyLight.castShadow = true;
scene.add(keyLight);

// Fill: cool, opposite side
const fillLight = new THREE.PointLight(0x4488ff, 0.6, 30);
fillLight.position.set(-5, 2, -3);
scene.add(fillLight);

// RIM LIGHT — the cinematic secret: BEHIND the hero object
// Creates a glowing outline separating hero from background
const rimLight = new THREE.PointLight(0x8844ff, 1.2, 15);
rimLight.position.set(0, 0, -4);
scene.add(rimLight);

// Ambient: very low
scene.add(new THREE.AmbientLight(0x0a0a1a, 0.3));

// Animate lights — scene feels ALIVE
function animateLights() {
    const t = Date.now() * 0.001;
    fillLight.intensity = 0.6 + Math.sin(t * 0.7) * 0.2;
    rimLight.color.setHSL(0.7 + Math.sin(t * 0.3) * 0.1, 1, 0.6);
}

// God-Ray plane — additive blending = glow not darken
const rayMat = new THREE.MeshBasicMaterial({
    color: 0x6633ff, transparent: true, opacity: 0.04,
    blending: THREE.AdditiveBlending, depthWrite: false,
});
const godRayPlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), rayMat);
godRayPlane.position.set(0, 0, -2);
scene.add(godRayPlane);
```

---

## LAYER 4 — Full Animation Vocabulary

### 4a. Floating — Makes objects feel alive
```js
function floatObject(mesh, amplitude = 0.15, speed = 1.0, offset = 0) {
    const startY = mesh.position.y;
    function loop() {
        requestAnimationFrame(loop);
        mesh.position.y = startY + Math.sin(Date.now() * 0.001 * speed + offset) * amplitude;
    }
    loop();
}
floatObject(heroOrb, 0.2, 0.8, 0);
floatObject(orbitRing, 0.1, 1.2, 1.5);
floatObject(glassPanel, 0.05, 0.6, 3.0);
```

### 4b. Orbiting — Secondary objects circle hero
```js
const orbitObjects = [book1, icon2, formula3];
function animateOrbit(t) {
    orbitObjects.forEach((obj, i) => {
        const angle = t * 0.3 + (i / orbitObjects.length) * Math.PI * 2;
        obj.position.x = Math.cos(angle) * 2.5;
        obj.position.z = Math.sin(angle) * 2.5;
        obj.position.y = Math.sin(angle) * 0.6;
        obj.lookAt(heroOrb.position);
    });
}
```

### 4c. Spring Physics on Hover — Physical weight
```js
let hoverVel = 0, hoverPos = 0, hoverTarget = 0;
function springUpdate() {
    const force = (hoverTarget - hoverPos) * 0.08;
    hoverVel = (hoverVel + force) * 0.7;
    hoverPos += hoverVel;
    heroOrb.position.y = baseY + hoverPos;
}
raycaster.intersectObject(heroOrb).length > 0
    ? (hoverTarget = 0.3) : (hoverTarget = 0);
```

### 4d. Scroll Choreography — Objects fly in from depth
```js
// Fly in from behind camera (z: far → 0)
gsap.from(featureCard.position, {
    z: 10, y: -2, duration: 1.2, ease: 'power3.out',
    scrollTrigger: { trigger: '#features', start: 'top 70%' }
});

// Assemble from all directions
assemblyParts.forEach((part, i) => {
    const angle = (i / assemblyParts.length) * Math.PI * 2;
    gsap.from(part.position, {
        x: Math.cos(angle) * 8, y: Math.sin(angle) * 8,
        duration: 1.5, delay: i * 0.1, ease: 'power4.out',
        scrollTrigger: { trigger: '#stats', start: 'top 60%' }
    });
});

// Spring entrance with elastic overshoot
gsap.from(orb.rotation, {
    y: Math.PI, duration: 2, ease: 'elastic.out(1, 0.5)',
    scrollTrigger: { trigger: '#about', start: 'top 60%' }
});
```

---

## LAYER 5 — Scroll Storytelling (Trailer NOT Webpage)

```
Scene 1 — ESTABLISH (0%):
  Wide shot. Hero 3D object drifts in from depth.
  Big headline text: character-by-character reveal.

Scene 2 — ZOOM IN (20%):
  Camera pushes forward. New orbiting element appears.
  First content card slides in from RIGHT.

Scene 3 — ARC REVEAL (40%):
  Camera arcs LEFT, revealing a new 3D object on the right.
  Previous object recedes (DOF shift).

Scene 4 — AERIAL (60%):
  Camera rises. Multiple objects arrange below like a constellation.
  Stats/features assemble like puzzle pieces.

Scene 5 — CLOSE-UP (80%):
  Camera pushes close. Bloom flares. DOF blurs everything else.
  Key CTA moment.

Scene 6 — WIDE FINAL (100%):
  Camera pulls back. All objects in final positions. Footer.
```

```js
// Pin each scene
['#establish','#zoom','#arc','#aerial','#closeup','#finale'].forEach((sel, i) => {
    ScrollTrigger.create({
        trigger: sel, start: 'top top', end: '+=800', pin: true,
        onEnter: () => transitionToScene(i),
        onLeaveBack: () => transitionToScene(i - 1),
    });
});
```

---

## LAYER 6 — Cursor Effects

```js
// Custom cursor with mix-blend-mode: difference (inverts colors underneath)
const cursor = document.createElement('div');
cursor.style.cssText = `
    position:fixed; width:20px; height:20px; border-radius:50%;
    border:2px solid rgba(255,255,255,0.6); pointer-events:none;
    z-index:9999; mix-blend-mode:difference; transition:width 0.3s,height 0.3s;
`;
document.body.appendChild(cursor);
let cx = 0, cy = 0;
document.addEventListener('mousemove', e => {
    cx += (e.clientX - cx) * 0.15; // lag = weight
    cy += (e.clientY - cy) * 0.15;
    cursor.style.left = cx - 10 + 'px';
    cursor.style.top = cy - 10 + 'px';
});
// Expand over 3D zones
document.querySelectorAll('.interactive-3d').forEach(el => {
    el.addEventListener('mouseenter', () => { cursor.style.width = '50px'; cursor.style.height = '50px'; });
    el.addEventListener('mouseleave', () => { cursor.style.width = '20px'; cursor.style.height = '20px'; });
});
```

---

## THE 15-POINT SELF-AUDIT (Run Before Shipping)

```
CAMERA (3 checks):
  □ Camera drifts/breathes even at rest?
  □ Mouse movement changes camera angle?
  □ Scroll changes camera POSITION (not just content)?

DEPTH (3 checks):
  □ 5+ distinct visual layers visible?
  □ Near/far objects move at different speeds (parallax)?
  □ At least one object behind hero with visible blur?

LIGHTING (3 checks):
  □ Visible bloom/glow on brightest parts?
  □ Rim light separating hero from background?
  □ At least one light slowly animates/pulses?

ANIMATION (4 checks):
  □ Any object floating (sine Y)? 
  □ Any object orbiting or rotating continuously?
  □ Objects spring/bounce on hover?
  □ Section transitions involve 3D objects flying/assembling?

HERO (2 checks):
  □ First thing visible = 3D object (not just text)?
  □ Hero text positioned NEAR 3D object (not just centered)?

SCORE:
  13-15 YES → ✅ Cinematic — ship it
  9-12  YES → ⚠️ Good but not cinematic — fix the NO answers
  0-8   YES → ❌ Dashboard — rebuild hero scene before shipping
```
