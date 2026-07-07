---
name: cinematic-raymarching-volumetrics
description: "God-tier skill for rendering volumetric smoke, clouds, fractals, and infinitely complex 3D shapes in the browser using GLSL Raymarching and Signed Distance Fields (SDFs). Technique verified against Inigo Quilez (iquilezles.org) and Shadertoy."
---

# 🌫️ Cinematic Raymarching & Volumetrics Architecture (2026 Standard)

When the user asks for "fractals", "volumetric clouds", "smoke shaders", "impossible shapes", or effects that cannot be modeled in Blender, you MUST use GLSL Raymarching with Signed Distance Fields.

> **Internet-verified** — All SDF math sourced from `iquilezles.org` (Inigo Quilez, creator of Shadertoy), the absolute authority on Raymarching. Cross-referenced with `Shadertoy.com`.

## 1. Core Stack
- **Three.js** — Used ONLY to host a full-screen shader quad. NOT for 3D objects.
- **Custom GLSL `ShaderMaterial`** — The entire 3D world lives inside one fragment shader.
- **Signed Distance Fields (SDFs)** — Mathematical functions that define shapes by distance.

## 2. The Full-Screen Quad Setup (MANDATORY)
```js
const geometry = new THREE.PlaneGeometry(2, 2); // covers entire viewport
const material = new THREE.ShaderMaterial({
    uniforms: {
        uTime:       { value: 0 },
        uResolution: { value: new THREE.Vector2(w, h) },
        uMouse:      { value: new THREE.Vector2(0.5, 0.5) }
    },
    vertexShader: `
        void main() { gl_Position = vec4(position, 1.0); }
    `,
    fragmentShader: RAYMARCHING_SHADER
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);
// In loop: material.uniforms.uTime.value = clock.getElapsedTime();
```

## 3. The Raymarching Loop (MANDATORY GLSL Core)
```glsl
uniform float uTime;
uniform vec2 uResolution;

// === SIGNED DISTANCE FUNCTIONS (from iquilezles.org) ===
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0); }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz)-t.x, p.y); return length(q)-t.y; }

// === SCENE SDF ===
float scene(vec3 p) {
    float t = uTime * 0.3;
    float sphere = sdSphere(p - vec3(sin(t), 0.0, cos(t)), 0.5);
    float torus  = sdTorus(p, vec2(1.0, 0.3));
    return min(sphere, torus); // Union of shapes
}

// === RAYMARCHER ===
#define MAX_STEPS 100
#define MAX_DIST 20.0
#define SURF_DIST 0.001

float rayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = scene(p);
        dO += dS;
        if (dO > MAX_DIST || dS < SURF_DIST) break;
    }
    return dO;
}

// === NORMAL CALCULATION ===
vec3 getNormal(vec3 p) {
    float d = scene(p);
    vec2 e = vec2(0.01, 0.0);
    return normalize(d - vec3(scene(p-e.xyy), scene(p-e.yxy), scene(p-e.yyx)));
}

// === SOFT SHADOWS (from iquilezles.org) ===
float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0;
    float t = mint;
    for (int i = 0; i < 24; i++) {
        float h = scene(ro + rd * t);
        if (h < 0.001) return 0.0;
        res = min(res, k * h / t);
        t += clamp(h, 0.01, 0.2);
        if (t > maxt) break;
    }
    return clamp(res, 0.0, 1.0);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
    // Ray origin & direction
    vec3 ro = vec3(0.0, 1.0, -3.0);
    vec3 rd = normalize(vec3(uv, 1.0));
    float d = rayMarch(ro, rd);
    vec3 col = vec3(0.0);
    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        vec3 lightPos = vec3(2.0, 5.0, -3.0);
        vec3 l = normalize(lightPos - p);
        float diff = max(dot(n, l), 0.0);
        float shadow = softShadow(p + n * 0.02, l, 0.02, 6.0, 8.0);
        col = vec3(0.3, 0.6, 1.0) * diff * shadow;
        // Fog for depth
        col = mix(col, vec3(0.02, 0.02, 0.05), 1.0 - exp(-0.05 * d * d));
    }
    gl_FragColor = vec4(col, 1.0);
}
```

## 4. ATCLI Security & 180K Context Rules
- **GPU SAFETY**: NEVER write `while(true)` without a break inside GLSL. It will permanently crash the browser GPU tab.
- **CONTEXT PROTECTION**: The raymarching shader is a massive block of math. Use the `replace` tool to modify specific SDF functions. NEVER rewrite the entire shader file.
- **MEMORY TRACKING**: Log all SDF primitives used in the scene and their parameters in `ATCLI_MEMORY.md` (e.g., "Sphere: center=[0,0,0] r=0.5, Torus: t=[1.0,0.3]").

## 5. Real Internet References (Verified)
- **IQ SDF List**: `iquilezles.org/articles/distfunctions/` — The DEFINITIVE reference for ALL SDF primitives. ALWAYS use this for shape math.
- **Shadertoy**: `shadertoy.com` — Study "Raymarching Primitives" and "Clouds" demos for lighting and fog techniques.
- **Keywords**: Search "GLSL raymarching tutorial SDF soft shadows".
