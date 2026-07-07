---
name: cinematic-real-physics-3d
description: "God-tier physics skill for cinematic 3D websites. Covers Rapier.js WASM rigid body physics for R3F, Cannon-es for vanilla Three.js, Verlet integration for soft bodies/cloth/ropes, and morph target animations. Internet-verified as the 2026 standard."
---

# 🔩 Cinematic Real Physics 3D Architecture (2026 Standard)

When the user asks for "realistic physics", "falling objects", "cloth simulation", "rope effects", "interactive 3D", or any scene where objects must behave like they're subject to gravity and forces, you MUST integrate a real physics engine.

> **Internet-verified** — Rapier.js confirmed as #1 for R3F (Rust/WASM, 2-3x faster than Cannon-es) by the `r/threejs` community, `threejs.org` forums, and `wawasensei.dev`. Verlet Integration sourced from `pikuma.com` and Awwwards soft-body tutorials.

## 1. Physics Engine Decision Tree (FOLLOW THIS)
```
User using React/Next.js?
  → YES → Use @react-three/rapier (Rapier WASM, #1 in 2026)
  → NO (Vanilla Three.js) → Use cannon-es (simpler) or Rapier.js directly
  
User wants cloth/rope/soft-body?
  → Use Verlet Integration (lightweight, perfect for browser constraints)

User wants morph/shape-shifting 3D objects?
  → Use Three.js Morph Targets (blend shapes)
```

## 2. Rapier.js Physics in React Three Fiber (MANDATORY for R3F)
```bash
npm install @react-three/rapier
```

### Basic Setup
```tsx
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';

function Scene() {
    return (
        <Physics gravity={[0, -9.81, 0]} debug={false}>
            {/* Falling sphere — real gravity + collision */}
            <RigidBody position={[0, 5, 0]} restitution={0.7} friction={0.5}>
                <mesh castShadow>
                    <sphereGeometry args={[0.5, 32, 32]} />
                    <meshStandardMaterial color="hotpink" />
                </mesh>
            </RigidBody>

            {/* Static floor */}
            <RigidBody type="fixed">
                <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[50, 50]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
            </RigidBody>

            {/* Kinematic (animation-controlled) body */}
            <RigidBody type="kinematicPosition" ref={kinematicRef}>
                <mesh><boxGeometry /><meshStandardMaterial color="gold" /></mesh>
            </RigidBody>
        </Physics>
    );
}
```

### RigidBody Types
| Type | Use Case |
|------|----------|
| `dynamic` (default) | Gravity + collision — falling objects |
| `fixed` | Immovable — floors, walls |
| `kinematicPosition` | AI/animation-controlled — spinning doors |
| `kinematicVelocity` | Velocity-controlled — player character |

## 3. Verlet Integration — Soft Bodies, Cloth & Ropes (Vanilla JS)
> Source: pikuma.com Verlet tutorial, verified against awwwards soft-body examples.

```js
// A verlet particle: only stores current + previous position
class Particle {
    constructor(x, y, z) {
        this.pos = new THREE.Vector3(x, y, z);
        this.prevPos = new THREE.Vector3(x, y, z);
        this.pinned = false;
    }
    update(dt, gravity = -9.81) {
        if (this.pinned) return;
        const vel = this.pos.clone().sub(this.prevPos); // implied velocity
        this.prevPos.copy(this.pos);
        this.pos.add(vel).addScaledVector(new THREE.Vector3(0, gravity, 0), dt * dt);
    }
}

// A distance constraint between 2 particles (for cloth/rope)
class Constraint {
    constructor(a, b) {
        this.a = a; this.b = b;
        this.restLength = a.pos.distanceTo(b.pos);
    }
    solve() {
        const delta = this.b.pos.clone().sub(this.a.pos);
        const dist = delta.length();
        const correction = delta.multiplyScalar((dist - this.restLength) / dist * 0.5);
        if (!this.a.pinned) this.a.pos.add(correction);
        if (!this.b.pinned) this.b.pos.sub(correction);
    }
}

// In animation loop — solve constraints multiple times per frame for stability
for (let i = 0; i < 10; i++) constraints.forEach(c => c.solve());
particles.forEach(p => p.update(0.016));
// Update mesh vertices from particles
cloth.geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(...), 3));
cloth.geometry.attributes.position.needsUpdate = true;
```

## 4. Morph Targets — Organic Shape Transitions
```js
// In Blender: create base mesh + "morph" shape keys, export as GLTF
// In Three.js:
gltfLoader.load('model.glb', ({ scene }) => {
    scene.traverse(node => {
        if (node.isMesh && node.morphTargetInfluences) {
            // Animate morph weight 0→1 for cinematic shape transition
            gsap.to(node.morphTargetInfluences, {
                0: 1, // morph target index
                duration: 2,
                ease: 'power2.inOut',
                yoyo: true, repeat: -1
            });
        }
    });
});
```

## 5. ATCLI Security & 180K Context Rules
- **CONTEXT PROTECTION**: Physics configurations (gravity, restitution, friction) are scene-critical. Use the `replace` tool to tweak specific RigidBody properties. Never rewrite the Physics wrapper.
- **MEMORY TRACKING**: Log the physics engine choice (Rapier/Cannon/Verlet), gravity vector, and the count of rigid bodies in `ATCLI_MEMORY.md`.
- **PERFORMANCE**: Rapier runs physics in a worker thread automatically. Never run physics calculations on the main thread.

## 6. Real Internet References (Verified)
- **Rapier Docs**: `rapier.rs/docs/user_guides/javascript/` — Official Rapier documentation.
- **@react-three/rapier GitHub**: `github.com/pmndrs/react-three-rapier` — Official R3F Rapier bindings.
- **Reddit Verification**: r/threejs (2024-2026) consistently recommends `@react-three/rapier` over Cannon-es.
- **Verlet Tutorial**: `pikuma.com` — Verified source for Verlet integration for cloth/rope.
- **Wawasensei**: `wawasensei.dev` — Excellent R3F + Rapier tutorials.
