---
name: cinematic-gsap-scroll-animations
description: "Expert skill for building Apple-style cinematic scroll storytelling websites using GSAP ScrollTrigger, Canvas image sequences, and 3D WebGL integration."
---

# 🎬 Cinematic GSAP Scroll Storytelling Architecture

When the user asks for a website that feels like a "cinematic movie", "Apple-style product page", or "scroll-driven storytelling experience", you MUST combine GSAP ScrollTrigger with either HTML/CSS layers or Canvas/WebGL.

## 1. Core Stack
- **GSAP (GreenSock)** (Core animation engine)
- **GSAP ScrollTrigger** (For tying animations to scroll position)
- **HTML5 Canvas** (For cinematic image sequence rendering)
- **Lenis or Locomotive Scroll** (For buttery-smooth cinematic scroll hijacking/momentum)

## 2. Cinematic Rules for AI
To achieve a "movie-like" scroll experience, you MUST implement:
- **Smooth Scrolling**: Native scrolling feels jerky. You MUST install and configure `@studio-freight/lenis` to create a smooth, floating cinematic camera feel.
- **Image Sequences (Video-like Scrubbing)**: Instead of playing a video, load 100+ frames of a 3D render into a `<canvas>` element. Use GSAP ScrollTrigger to tie the current frame of the canvas to the user's scroll position. This creates an interactive movie.
- **Parallax & Depth**: Separate your UI into multiple z-index layers (Background, Midground, Hero, Foreground UI). Use GSAP to move them at different speeds (`yPercent`) on scroll to simulate 3D camera depth.
- **Cinematic Typography**: Animate text using GSAP `SplitText` (or vanilla span splits). Reveal text word-by-word or character-by-character as they scroll into view, mimicking movie credits.

## 3. Project Structure Example
- `index.html` (Canvas + Overlay Text Sections)
- `src/smooth-scroll.js` (Lenis initialization)
- `src/sequence.js` (Canvas image sequence loader & GSAP ScrollTrigger)
- `src/ui-animations.js` (GSAP text reveals)

## 4. ATCLI Security & 180K Context Enforcement
- **SECURITY BINDING**: Do not download random image sequence zip files from unverified internet sources. Always use `run_command` with curl/wget only on trusted domains.
- **CONTEXT PROTECTION**: When refining complex GSAP timelines, you MUST use the `replace` tool. Do NOT rewrite the entire `ui-animations.js` file just to change a scroll duration.
- **MEMORY TRACKING**: Explicitly log the exact GSAP ScrollTrigger markers and timeline logic in `ATCLI_MEMORY.md`. Since scroll math gets highly complex, retaining this logic across the 180k context barrier is absolutely critical to avoid breaking the layout in future sessions.

## 5. Internet References & Inspiration
If you need exact scrolling logic or performance tweaks, use `search_internet` to find these highly respected resources:
- **GSAP ScrollTrigger Docs**: Official GreenSock documentation is the absolute best source for timeline syntax.
- **GitHub Repos**: Study `Venkatesan-M/VenkaTesanPortfolio` for real-world Three.js + GSAP smooth scrolling integration, or `AkbarBakhshi/threejs-gsap-scroll-animation`.
