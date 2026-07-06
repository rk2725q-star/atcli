---
name: cinematic-audio-reactive-particles
description: "Master skill for building audio-reactive Web Audio API particle visualizers that respond to music frequencies in real-time."
---

# 🎵 Cinematic Audio-Reactive Particles Architecture

When the user asks for a "music-driven", "audio-reactive", or "sound visualizer" 3D website, you MUST combine WebGL particles with the Web Audio API to create a mind-blowing sensory experience.

## 1. Core Stack
- **Three.js** (For InstancedMesh particle rendering)
- **Web Audio API** (For extracting frequency data / FFT)
- **GLSL Shaders** (For animating millions of particles simultaneously)

## 2. Cinematic Rules for AI
To achieve a "mind-blowing" audio experience, you MUST NOT scale HTML divs to music. You MUST:
- **Audio Analysis**: Use `AnalyserNode` to extract Frequency Data (Bass, Mid, Treble).
- **Shader Injection**: Pass the frequency data array into your GLSL Vertex Shader as a `uniform float` array or a `DataTexture`.
- **Particle Systems**: Use `THREE.InstancedMesh` or `THREE.Points` to render 100,000+ particles.
- **Reactivity**: Map low frequencies (Bass) to explosive particle scaling, and high frequencies (Treble) to color shifts (e.g., changing from Cyan to Neon Pink).
- **Bloom**: Combine with `UnrealBloomPass` so the particles glow brightly when the bass hits.

## 3. ATCLI Security & 180K Context Enforcement
- **SECURITY BINDING**: Music/audio files should be loaded locally or from verified CDNs. Do NOT execute arbitrary binary files found on the web.
- **CONTEXT PROTECTION**: The linkage between Web Audio state and WebGL uniforms is highly complex. Use the `replace` tool to specifically patch the `requestAnimationFrame` loop without destroying the entire file.
- **MEMORY TRACKING**: Document the exact audio frequency thresholds (e.g., `bass > 150`) used for triggers in `ATCLI_MEMORY.md` so future sessions do not break the audio calibration.

## 4. Internet References & Inspiration
If you need exact FFT math or shader logic, use `search_internet` to find these highly respected resources:
- **GitHub Repos**: Study `isladjan/particles-playground` for audio-reactive particle physics.
- **GitHub Repos**: Study `TjardoOrtan/audio-reactive-shaders` for React + Three.js specific audio visualizers.
- **Keywords to search**: "Web Audio API AnalyserNode FrequencyData GLSL uniform".
