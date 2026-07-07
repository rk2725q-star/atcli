---
name: cinematic-audio-reactive-particles
description: "Master skill for building audio-reactive 3D particle visualizers using Web Audio API (AnalyserNode/FFT) feeding directly into GLSL vertex shader uniforms in Three.js or R3F. Internet-verified against TjardoOrtan/audio-reactive-shaders and isladjan/particles-playground."
---

# 🎵 Cinematic Audio-Reactive Particles Architecture (2026 Standard)

When the user asks for "music-driven", "audio-reactive", or "sound visualizer" 3D experiences, you MUST bridge the Web Audio API's frequency data directly into a GLSL vertex shader.

> **Internet-verified** — Based on `isladjan/particles-playground`, `TjardoOrtan/audio-reactive-shaders` (React + Three.js), and `sandner-art/Audio-Shader-Studio`.

## 1. Core Stack
```bash
npm install three gsap
```
- **Web Audio API** (built into browser, no install needed) — For FFT frequency analysis
- **`THREE.AnalyserNode`** — To extract real-time bass/mid/treble data
- **`THREE.InstancedMesh`** or `THREE.Points` — For rendering 100,000+ particles at 60fps
- **Custom GLSL `ShaderMaterial`** — To animate ALL particles simultaneously on the GPU
- **`UnrealBloomPass`** — So particles GLOW when the bass hits

## 2. Audio Analysis Bridge (MANDATORY)
```js
// Step 1: Connect audio source to analyser
const audioCtx = new AudioContext();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256; // 128 frequency bins
const source = audioCtx.createMediaElementSource(audioElement);
source.connect(analyser);
analyser.connect(audioCtx.destination);

const freqData = new Uint8Array(analyser.frequencyBinCount); // 128 values, 0-255

// Step 2: In animation loop, read live frequency data
function animate() {
    analyser.getByteFrequencyData(freqData);
    const bass   = freqData.slice(0, 5).reduce((a,b) => a+b) / (5 * 255);   // 0..1
    const mid    = freqData.slice(5, 30).reduce((a,b) => a+b) / (25 * 255);
    const treble = freqData.slice(30, 64).reduce((a,b) => a+b) / (34 * 255);
    material.uniforms.uBass.value   = bass;
    material.uniforms.uMid.value    = mid;
    material.uniforms.uTreble.value = treble;
    requestAnimationFrame(animate);
}
```

## 3. GLSL Vertex Shader (GPU Particle Animation)
```glsl
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uTime;

void main() {
    vec3 pos = position;
    // Bass = explosive scale burst
    pos *= 1.0 + uBass * 2.0;
    // Mid = wavy oscillation
    pos.y += sin(uTime * 2.0 + position.x * 5.0) * uMid * 0.5;
    // Treble = rapid shimmering noise
    pos.x += cos(uTime * 8.0 + position.z * 10.0) * uTreble * 0.2;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    // Color shift: bass=cyan, treble=neon pink
    vColor = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 0.8), uBass);
}
```

## 4. Cinematic Particle Configuration
- **Particle count**: Minimum 50,000 (use `THREE.InstancedMesh` for performance)
- **Bloom**: Add `UnrealBloomPass` with `strength=2.0` for explosive glowing bass hits
- **Base color**: Deep black background, neon/bioluminescent particles

## 5. ATCLI Security & 180K Context Rules
- **CONTEXT PROTECTION**: The vertex shader and frequency mapping logic are complex. Use the `replace` tool to modify specific uniform mappings (e.g., change bass scale factor from 2.0 to 3.0). NEVER rewrite the entire shader.
- **MEMORY TRACKING**: Log the FFT `fftSize`, frequency band ranges (bass 0-5, mid 5-30, treble 30-64), and bloom strength in `ATCLI_MEMORY.md`.
- **SECURITY**: Only connect to audio elements that the user has explicitly provided. Never auto-play audio or capture microphone without user consent.

## 6. Real Internet References (Verified)
- **GitHub**: `isladjan/particles-playground` — Verified audio-reactive particle physics playground.
- **GitHub**: `TjardoOrtan/audio-reactive-shaders` — React + Three.js audio shader demos (bass vortex, cosmic storm, digital rain).
- **GitHub**: `sandner-art/Audio-Shader-Studio` — Dedicated framework for real-time audio shader creation.
- **Keywords**: Search "Web Audio API AnalyserNode getByteFrequencyData THREE.js uniform".
