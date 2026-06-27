---
name: game-development-architecture
description: Top-tier game development principles for building advanced 2D/3D games with characters, vehicles, physics, and scalable rendering.
---

# Premium Game Development Protocol

When requested to build a game, you must strictly follow these 10 advanced game development architectural skills. Do not build basic or ugly MVP games. You must aim for "A to Z" top-tier quality.

## Skill 1: Game Loop Architecture
- Never rely on `setInterval` or `setTimeout`.
- You MUST use `requestAnimationFrame` for a highly optimized, decoupled game loop that separates `update(deltaTime)` (physics/logic) and `render()` (drawing).
- Implement a max-framerate capper to prevent high refresh rate monitors from breaking physics.

## Skill 2: Physics & Kinematics Engine
- For custom physics (vehicles/characters), decouple velocity, acceleration, and friction.
- Implement realistic AABB (Axis-Aligned Bounding Box) or SAT (Separating Axis Theorem) collision detection.
- Vehicle physics MUST include traction, drift factors, and wheel-base turning calculations.

## Skill 3: Entity-Component-System (ECS)
- Scale games using an ECS pattern. Do not write massive monolithic class hierarchies.
- Separate logic: `Player` is an Entity. `Position`, `Velocity`, `Sprite` are Components. `MovementSystem` updates them.

## Skill 4: Asset & Sprite Management
- Preload all assets (images, spritesheets, sounds) BEFORE the game starts to avoid mid-game stutter.
- Use Sprite Atlas architectures to batch render calls. Animate characters using frame-based timing (e.g. 12 fps walk cycle), not raw screen frames.

## Skill 5: Advanced Canvas/WebGL Rendering
- Avoid constantly clearing and redrawing the entire screen if not needed.
- Use layered Canvases (Background Canvas, Entity Canvas, UI Canvas) to drastically improve performance.
- When applicable, utilize WebGL for hardware-accelerated shaders and lighting.

## Skill 6: State & Scene Management
- Implement a strict State Machine (Menu -> Loading -> Playing -> Paused -> GameOver).
- Do not mix UI rendering (like health bars or menus) inside the core physics loop. Handle them in an independent UI Scene layer.

## Skill 7: Particle Systems & Visual Effects
- Premium games require "Juice" (screen shake, hit flashes, particle explosions).
- Implement a lightweight Particle Manager that recycles particle objects (Object Pooling) to prevent Garbage Collection (GC) lag.

## Skill 8: Input & Control Handling
- Normalize input vectors to prevent faster diagonal movement (e.g., pressing W and D together).
- Support multiple input sources (Keyboard, Mouse/Touch, Gamepad) using an abstracted InputController.

## Skill 9: Map & Spatial Partitioning
- For games with vehicles and characters moving across large worlds, use QuadTrees or Spatial Hashing.
- Only render and calculate physics for entities currently within the Camera's Viewport (Frustum Culling).

## Skill 10: AI & Pathfinding
- Enemy characters must use A* (A-Star) Pathfinding for navigation around obstacles.
- Implement simple behavior trees or finite state machines (FSM) for NPC logic (Idle, Chase, Attack, Flee).
