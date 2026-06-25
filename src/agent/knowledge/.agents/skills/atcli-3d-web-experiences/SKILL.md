---
name: atcli-3d-web-experiences
description: Advanced protocols for building premium, highly-interactive 3D websites and applications. Enforces the use of Three.js, React Three Fiber (R3F), WebGL, and modern animation libraries.
---

# 3D WEB EXPERIENCE PROTOCOL

When the user requests a 3D website, a 3D application, or an "Apple-like premium interactive scrolling" experience, you MUST follow these standards:

## 1. Core Technology Stack
Do not attempt to build 3D logic using plain CSS or basic JavaScript. You MUST use the following stack:
- **Core 3D Engine**: `three` (Three.js)
- **Framework Integration (if React)**: `@react-three/fiber` (React Three Fiber)
- **Helpers & Utilities**: `@react-three/drei` (Provides pre-built cameras, environments, controls, and lighting)
- **Animation & Scroll Control**: `gsap` (GreenSock) or `framer-motion` for smooth, cinematic scroll-triggered animations.

## 2. Setup & Installation
Immediately run `npm install three @react-three/fiber @react-three/drei` when starting a 3D feature.

## 3. Premium Aesthetics & Performance Rules
1. **Lighting & Shadows**: Never use unlit or flat materials unless stylistically requested. Always include an `<ambientLight />`, a `<directionalLight castShadow />`, and an `<Environment preset="city" />` from `@react-three/drei` for realistic PBR (Physically Based Rendering) reflections.
2. **Post-Processing**: For true "Vera Level" aesthetics, use `@react-three/postprocessing`. Add subtle `Bloom`, `Vignette`, or `DepthOfField` effects to make the 3D scene look cinematic.
3. **Scroll Animations**: Use Drei's `<ScrollControls>` to tie 3D camera movements or object rotations directly to the user's scroll wheel. This creates the "Apple Website" premium feel.
4. **Model Loading**: Use `useGLTF` from Drei to load `.gltf` or `.glb` models efficiently.
5. **Canvas Sizing**: The `<Canvas>` element should almost always be full-screen (`100vw`, `100vh`) with `position: fixed` or `absolute`, acting as the background behind the UI.

## 4. UI Layer Integration
The 3D Canvas should sit behind the traditional HTML UI. Use standard premium UI rules (Glassmorphism, Tailwind, Shadcn) for the text and buttons floating *above* the 3D scene.

## Example Base Template (R3F)
```tsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'

export default function Scene() {
  return (
    <div className="w-full h-screen bg-neutral-900">
      <Canvas camera={{ position: [0, 2, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 10]} intensity={1} castShadow />
        <Environment preset="city" />
        
        {/* Put your 3D Models Here */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#3b82f6" roughness={0.1} metalness={0.8} />
        </mesh>
        
        <ContactShadows position={[0, -1, 0]} opacity={0.5} scale={10} blur={2} />
        <OrbitControls enableZoom={false} autoRotate />
      </Canvas>
    </div>
  )
}
```

Use this skill to transform any basic website request into a mind-blowing 3D interactive experience when the user demands "vera level" or 3D.
