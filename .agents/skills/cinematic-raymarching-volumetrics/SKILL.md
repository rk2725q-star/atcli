---
name: cinematic-raymarching-volumetrics
description: "God-tier skill for rendering volumetric smoke, clouds, fractals, and infinitely complex shapes on the web using Raymarching and Signed Distance Fields (SDFs)."
---

# 🌫️ Cinematic Raymarching & Volumetrics Architecture

When the user asks for a website with "endless fractals", "volumetric clouds", "realistic smoke", or "mathematically complex shapes" that cannot be modeled in Blender, you MUST use GLSL Raymarching.

## 1. Core Stack
- **Three.js** (Used only as a host for a full-screen quad)
- **Raw GLSL ShaderMaterial** (Where 100% of the Raymarching happens)
- **Signed Distance Fields (SDFs)** (The math used to define shapes)

## 2. Cinematic Rules for AI
To achieve "mind-blowing" raymarching, you MUST:
- **Use a Full-Screen Quad**: Do not create standard 3D meshes. Render a single 2D plane that covers the entire screen, and write the 3D world entirely within the Fragment Shader.
- **Raymarching Algorithm**: Write a loop in GLSL that shoots a ray from the camera through each pixel into the scene, stepping forward based on the SDF distance.
- **Volumetric Lighting / Shadows**: Implement soft shadows by marching towards the light source. Add volumetric fog based on the distance the ray traveled to create cinematic depth.
- **Performance Constraints**: Raymarching is highly GPU-intensive. You MUST limit the maximum number of ray steps (e.g., `MAX_STEPS 100`) and provide a uniform to lower the resolution (`devicePixelRatio`) on weaker devices.

## 3. ATCLI Security & 180K Context Enforcement
- **SECURITY BINDING**: Ensure you do not accidentally create infinite loops inside your GLSL shaders (e.g., `while(true)` without a break), as this will instantly crash the user's GPU and browser tab.
- **CONTEXT PROTECTION**: Raymarching shaders are giant blocks of math. You MUST use the `replace` tool to modify specific SDF functions (e.g., `sdSphere` or `sdBox`). Do NOT rewrite the entire shader file.
- **MEMORY TRACKING**: Keep a strict manifest of all SDFs used in the shader in `ATCLI_MEMORY.md`. If the user asks you to add a new shape later, you must know what math already exists across the 180k context barrier.

## 4. Internet References & Inspiration
If you need exact SDF math or raymarching loop logic, use `search_internet` to find these highly respected resources:
- **Inigo Quilez (iquilezles.org)**: The absolute god of Raymarching and SDFs. Always search his site for mathematical formulas for shapes and soft shadows.
- **Shadertoy**: Look up Raymarching examples on Shadertoy to study how lighting and fog are integrated into the ray loop.
- **Keywords to search**: "GLSL Raymarching tutorial", "Inigo Quilez Signed Distance Fields".
