---
name: cinematic-gsap-scroll-animations
description: "Expert skill for building Apple-style cinematic scroll storytelling websites using GSAP ScrollTrigger, Lenis smooth scroll, canvas image sequences, and morph target animations. Internet-verified against tympanus.net and Awwwards best practices."
---

# 🎬 Cinematic GSAP Scroll Storytelling Architecture (2026 Standard)

When the user asks for a website that feels like a "cinematic movie", "Apple-style product page", or "scroll-driven storytelling", you MUST combine GSAP ScrollTrigger with Lenis smooth scroll.

> **Internet-verified** — Confirmed as the industry standard by Awwwards.com, tympanus.net/codrops, and the GSAP.com forums.

## 1. Core Stack (Verified)
```bash
npm install gsap @gsap/react @studio-freight/lenis
```
- **`gsap` + `ScrollTrigger`** — The #1 scroll animation engine (used on virtually every Awwwards site).
- **`@studio-freight/lenis`** — Buttery-smooth scroll inertia. **MANDATORY** for the premium cinematic feel.
- **`GSAP SplitText`** — For character/word-by-word cinematic text reveals.
- **`HTML5 Canvas`** — For 3D image sequence scrubbing (Apple iPhone-style scroll).

## 2. MANDATORY Cinematic Scroll Rules

### 2a. Lenis Smooth Scroll (Install First — MANDATORY)
```js
import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.8 });
lenis.on('scroll', ScrollTrigger.update); // Bridge Lenis with GSAP
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

### 2b. Canvas Image Sequence (Apple-Style Video Scrubbing)
```js
const canvas = document.getElementById('hero-canvas');
const ctx = canvas.getContext('2d');
const frameCount = 80;
const images = [];
// Pre-load all frames
for (let i = 0; i < frameCount; i++) {
    const img = new Image();
    img.src = `frames/frame_${String(i).padStart(4, '0')}.jpg`;
    images.push(img);
}
// Tie current frame to scroll progress
gsap.to({ frame: 0 }, {
    frame: frameCount - 1,
    snap: 'frame',
    scrollTrigger: { trigger: '#sequence-section', start: 'top top', end: '+=3000', pin: true, scrub: 0.5 },
    onUpdate() { ctx.drawImage(images[Math.round(this.targets()[0].frame)], 0, 0); }
});
```

### 2c. Cinematic Parallax Depth Layers
```js
// Layer at different speeds to simulate 3D depth
gsap.to('.bg-layer', { yPercent: -30, ease: 'none', scrollTrigger: { scrub: 1 } });
gsap.to('.mid-layer', { yPercent: -15, ease: 'none', scrollTrigger: { scrub: 1 } });
gsap.to('.fg-layer', { yPercent: -5,  ease: 'none', scrollTrigger: { scrub: 1 } });
```

### 2d. Cinematic Text Reveal (GSAP SplitText / Manual)
```js
const chars = document.querySelectorAll('.split-char');
gsap.fromTo(chars, { opacity: 0, y: 80, rotateX: -90 }, {
    opacity: 1, y: 0, rotateX: 0,
    stagger: 0.04, ease: 'back.out(1.7)',
    scrollTrigger: { trigger: '.hero-title', start: 'top 80%' }
});
```

## 3. Project Structure
```
src/smooth-scroll.js   — Lenis init + GSAP bridge
src/sequence.js        — Canvas image sequence loader
src/parallax.js        — Multi-layer GSAP parallax
src/text-reveals.js    — SplitText cinematic reveals
index.html             — Section triggers + canvas
```

## 4. ATCLI Security & 180K Context Rules
- **CONTEXT PROTECTION**: Use the `replace` tool to modify specific ScrollTrigger `start`/`end` values. Never rewrite the entire `sequence.js` file.
- **MEMORY TRACKING**: Log exact Lenis `lerp` value and all ScrollTrigger `pin` sections in `ATCLI_MEMORY.md`. This math is critical and will be lost at 180k context.
- **SECURITY**: Image sequences can be large. Do NOT download arbitrary `.zip` files. Use only trusted project assets.

## 5. Real Internet References (Verified)
- **GSAP ScrollTrigger Docs**: `gsap.com/docs/v3/Plugins/ScrollTrigger/` — Official, authoritative source.
- **Lenis**: `github.com/studio-freight/lenis` — Official smooth scroll library.
- **Codrops**: `tympanus.net` — `#1 source` for scroll-based cinematic code demonstrations, verified by Awwwards community.
- **GitHub**: `JosephASG/codrops-cinematic-scroll-animations` — Verified cinematic scroll template.
