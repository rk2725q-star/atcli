---
name: cinematic-game-engine-vibecode
description: "GOD-TIER GAME SKILL: Complete browser-based game engine architecture using Three.js + Rapier physics + Yuka AI + three-pathfinding. Covers FPS/TPS/open-world games with characters, weapons, shooting, enemy AI, maps, inventory, health, explosions, and all game mechanics. Internet-verified against mohsenheydari/three-fps, WesUnwin/three-game-engine, and Yuka.js docs. ⚠️ SCOPE: ONLY trigger this skill when the user explicitly asks to build a PLAYABLE GAME (FPS, TPS, RPG, racing, etc.). Do NOT use this for cinematic showcase websites, portfolio sites, or animated landing pages — those use cinematic-scene-director + cinematic-3d-threejs instead. The Rapier WASM + Yuka + NavMesh bundle adds ~2-4MB and is overkill for non-game sites."
---

# 🎮 Cinematic Game Engine — VibeCoding Architecture (2026)

> ⚠️ **TRIGGER RULE — READ FIRST**: Only activate this skill when the user explicitly says they want a **playable game** (FPS, TPS, RPG, platformer, racing, survival, etc.). Do NOT use this for:
> - Cinematic website showcases (use `cinematic-scene-director` instead)
> - Portfolio/landing page 3D effects (use `cinematic-3d-threejs`)
> - Animated background for a SaaS/business site
> The reason: Rapier WASM + Yuka + NavMesh = ~2-4MB bundle + heavy CPU. Using it for a showcase site guarantees lag on mid-range phones (Galaxy S20 FE, iPhone 12 tier).

When the user explicitly asks to build a GAME (FPS, TPS, RPG, racing, puzzle, survival), you MUST use this architecture. This teaches the AI to build a fully playable, cinematic-quality game directly in the browser using Three.js.

> **Internet-verified** — Architecture based on `mohsenheydari/three-fps` (Three.js + Ammo.js FPS), `WesUnwin/three-game-engine` (Three.js + Rapier + UI), `iErcann/enari-engine` (FPS playground), and Yuka.js documentation.

---

## 1. COMPLETE GAME STACK

```bash
npm install three @react-three/fiber @react-three/rapier rapier-js
npm install three-pathfinding yuka
npm install gsap @studio-freight/lenis
npm install simplex-noise  # for procedural maps
```

| Library | Purpose | Verified Source |
|---------|---------|----------------|
| **Three.js** | 3D rendering engine | threejs.org |
| **@react-three/rapier** | Physics: gravity, collision, rigid body | rapier.rs |
| **Yuka.js** | Enemy AI: FSM, steering behaviors, pathfinding | mugen87.github.io/yuka |
| **three-pathfinding** | NavMesh navigation for enemies | GitHub: donmccurdy/three-pathfinding |
| **PointerLock API** | FPS mouse control (built-in browser) | MDN Web Docs |
| **THREE.Raycaster** | Bullet/shooting ray detection | Three.js docs |

---

## 2. GAME ARCHITECTURE (Entity-Component System)

### Core Game Loop
```js
class GameEngine {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, w/h, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.clock = new THREE.Clock();
        this.entities = []; // all game objects
        this.physicsWorld = null; // Rapier
        this.entityManager = new YUKA.EntityManager(); // AI
    }
    
    update() {
        const delta = this.clock.getDelta();
        this.physicsWorld?.step();           // physics simulation
        this.entityManager.update(delta);    // AI update
        this.entities.forEach(e => e.update(delta)); // game logic
        this.renderer.render(this.scene, this.camera);
    }
}
```

---

## 3. PLAYER CONTROLLER (FPS/TPS)

### FPS Controller (Pointer Lock)
```js
class FPSController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.velocity = new THREE.Vector3();
        this.speed = 8;
        this.keys = {};
        this.isGrounded = false;
        this.health = 100;
        this.ammo = 30;
        
        // Pointer lock for mouse FPS control
        domElement.addEventListener('click', () => domElement.requestPointerLock());
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === domElement) {
                camera.rotation.y -= e.movementX * 0.002;
                camera.rotation.x = Math.max(-Math.PI/4, Math.min(Math.PI/4,
                    camera.rotation.x - e.movementY * 0.002));
            }
        });
        
        document.addEventListener('keydown', e => this.keys[e.code] = true);
        document.addEventListener('keyup', e => this.keys[e.code] = false);
    }
    
    update(delta, rigidBody) {
        // Movement direction from keys
        const dir = new THREE.Vector3();
        if (this.keys['KeyW']) dir.z -= 1;
        if (this.keys['KeyS']) dir.z += 1;
        if (this.keys['KeyA']) dir.x -= 1;
        if (this.keys['KeyD']) dir.x += 1;
        dir.normalize().applyEuler(new THREE.Euler(0, this.camera.rotation.y, 0));
        
        // Apply via Rapier rigid body
        const vel = rigidBody.linvel();
        rigidBody.setLinvel({ x: dir.x * this.speed, y: vel.y, z: dir.z * this.speed }, true);
        
        // Jump
        if (this.keys['Space'] && this.isGrounded) {
            rigidBody.setLinvel({ x: vel.x, y: 8, z: vel.z }, true);
        }
    }
    
    takeDamage(amount) {
        this.health -= amount;
        // Flash red vignette effect
        gsap.to(vignettePass.uniforms.color, { r:1, g:0, b:0, duration:0.1, yoyo:true, repeat:1 });
        if (this.health <= 0) this.onDeath();
    }
}
```

---

## 4. SHOOTING SYSTEM (Raycaster)

```js
class ShootingSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.raycaster = new THREE.Raycaster();
        this.bullets = []; // active bullet trails
        this.enemies = []; // reference to enemy array
        this.shootCooldown = 0;
        this.player = null; // ✅ FIX: must be set via setPlayer() before shoot() is called
    }
    
    // ✅ FIX: Call this after constructing, before shooting
    setPlayer(playerController) {
        this.player = playerController;
    }
    
    shoot() {
        // ✅ FIX: Guard against player not set or no ammo
        if (!this.player) { console.warn('ShootingSystem: player not set. Call setPlayer() first.'); return; }
        if (this.shootCooldown > 0 || this.player.ammo <= 0) return;
        this.shootCooldown = 0.1; // fire rate limiter
        this.player.ammo--;
        
        // Ray from camera center
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const hits = this.raycaster.intersectObjects(this.enemies.map(e => e.mesh), true);
        
        if (hits.length > 0) {
            const hit = hits[0];
            // Bullet impact VFX
            this.createImpactEffect(hit.point);
            // Damage enemy
            const enemy = this.enemies.find(e => e.mesh === hit.object || e.mesh.getObjectById(hit.object.id));
            enemy?.takeDamage(25);
        }
        
        // Muzzle flash
        this.createMuzzleFlash();
        // Bullet trail
        this.createBulletTrail();
        
        // Recoil
        gsap.to(this.camera.rotation, { x: this.camera.rotation.x + 0.02, duration: 0.05, yoyo: true, repeat: 1 });
    }
    
    createImpactEffect(position) {
        // Spark particles at hit point
        const geo = new THREE.BufferGeometry();
        const particles = new Float32Array(30 * 3).fill(0).map(() => (Math.random()-0.5) * 0.3);
        geo.setAttribute('position', new THREE.BufferAttribute(particles, 3));
        const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffaa00, size: 0.05 }));
        sparks.position.copy(position);
        this.scene.add(sparks);
        setTimeout(() => this.scene.remove(sparks), 500);
    }
    
    update(delta) {
        this.shootCooldown = Math.max(0, this.shootCooldown - delta);
    }
}
// Fire on mouse click:
document.addEventListener('click', () => shootingSystem.shoot());

// ✅ USAGE — always call setPlayer after construction:
// const shootingSystem = new ShootingSystem(scene, camera);
// const player = new FPSController(camera, canvas);
// shootingSystem.setPlayer(player); // ← required before shoot() works
// shootingSystem.enemies = enemyArray;
```

---

## 5. ENEMY AI SYSTEM (Yuka.js + NavMesh)

```js
import * as YUKA from 'yuka';
import { Pathfinding } from 'three-pathfinding';

class EnemyAI {
    constructor(scene, entityManager, player) {
        this.health = 100;
        this.state = 'PATROL'; // PATROL | CHASE | ATTACK | DEAD
        this.player = player;  // store reference for attack
        this._attackInterval = null; // ✅ FIX: track interval for cleanup
        
        // Yuka Vehicle (entity with steering)
        this.vehicle = new YUKA.Vehicle();
        this.vehicle.maxSpeed = 3;
        this.vehicle.position.set(0, 0, 0);
        entityManager.add(this.vehicle);
        
        // Steering behaviors
        this.pursuitBehavior = new YUKA.PursuitBehavior();
        this.wanderBehavior = new YUKA.WanderBehavior();
        this.vehicle.steering.add(this.wanderBehavior); // start patrolling
        
        // 3D mesh synced to Yuka physics
        this.mesh = createHuman(0x8B0000); // dark red enemy
        scene.add(this.mesh);
        
        // ✅ FIX: syncCallback = new YUKA.Regulator(2) was unused — removed.
        // Correct sync method is updateCallback directly on the vehicle:
        this.vehicle.updateCallback = () => this.mesh.position.copy(this.vehicle.position);
        
        // Animation Mixer
        this.mixer = null; // attach from GLTF if using real character
        this.currentAction = 'walk';
    }
    
    update(delta, playerPosition) {
        const distToPlayer = this.vehicle.position.distanceTo(playerPosition);
        
        if (distToPlayer < 20 && this.state !== 'ATTACK') {
            // Switch to CHASE
            this.state = 'CHASE';
            this.vehicle.steering.clear();
            this.pursuitBehavior.evader = { position: playerPosition };
            this.vehicle.steering.add(this.pursuitBehavior);
        }
        
        if (distToPlayer < 3 && this.state === 'CHASE') {
            // ATTACK range
            this.state = 'ATTACK';
            this.attackPlayer();
        }
        
        if (distToPlayer > 25 && this.state !== 'DEAD') {
            // Lost player — return to PATROL
            // ✅ FIX: clear attack interval when leaving ATTACK state
            if (this._attackInterval) {
                clearInterval(this._attackInterval);
                this._attackInterval = null;
            }
            this.state = 'PATROL';
            this.vehicle.steering.clear();
            this.vehicle.steering.add(this.wanderBehavior);
        }
        
        // Look at player when chasing
        if (this.state === 'CHASE' || this.state === 'ATTACK') {
            this.mesh.lookAt(playerPosition.x, this.mesh.position.y, playerPosition.z);
        }
        
        this.mixer?.update(delta);
    }
    
    takeDamage(amount) {
        this.health -= amount;
        // Flash red
        this.mesh.traverse(child => {
            if (child.isMesh) gsap.to(child.material, { emissiveIntensity: 1, duration: 0.1, yoyo: true, repeat: 1 });
        });
        if (this.health <= 0) this.die();
    }
    
    die() {
        this.state = 'DEAD';
        // ✅ FIX: clear attack interval on death — prevents permanent background timer leak
        if (this._attackInterval) {
            clearInterval(this._attackInterval);
            this._attackInterval = null;
        }
        // Fall animation
        gsap.to(this.mesh.rotation, { x: Math.PI/2, duration: 0.5 });
        setTimeout(() => { scene.remove(this.mesh); }, 2000);
        // Drop pickup (health or ammo)
        this.dropPickup();
    }
    
    attackPlayer() {
        // ✅ FIX: Store interval reference so it can be cleared in die() and when losing player
        // Old code created a permanent interval every time attackPlayer() was called — memory leak!
        if (this._attackInterval) return; // already attacking, don't create duplicate
        this._attackInterval = setInterval(() => {
            if (this.state === 'ATTACK' && this.player) {
                this.player.takeDamage(10);
            } else {
                // State changed externally — self-clean
                clearInterval(this._attackInterval);
                this._attackInterval = null;
            }
        }, 1000);
    }
}
```

---

## 6. MAP SYSTEM (Procedural + NavMesh)

```js
// Procedural Map Generation
function generateGameMap(seed=42, size=100) {
    const map = new THREE.Group();
    const noise = createNoise2D(alea(seed)); // seeded for reproducibility
    
    // Ground
    const terrain = createTerrain(size, 64, 8); // from cinematic-3d-asset-codegen
    map.add(terrain);
    
    // Random buildings (obstacle placement)
    for (let i = 0; i < 15; i++) {
        const b = createBuilding(3+Math.random()*4, 4+Math.random()*10, 3+Math.random()*4);
        b.position.set((Math.random()-0.5)*size*0.8, 0, (Math.random()-0.5)*size*0.8);
        map.add(b);
    }
    
    return map;
}

// NavMesh: Create in Blender → export with scene → load for pathfinding
// OR generate programmatically:
const pathfinder = new Pathfinding();
// pathfinder.setZoneData('level1', Pathfinding.createZone(navMeshGeometry));
// const path = pathfinder.findPath(enemyPos, playerPos, 'level1', zoneId);
```

---

## 7. GAME UI SYSTEM

```js
// HUD (Heads Up Display) — DOM overlay on top of canvas
function createHUD() {
    const hud = document.createElement('div');
    hud.innerHTML = `
        <div id="crosshair">+</div>
        <div id="health-bar"><div id="health-fill"></div></div>
        <div id="ammo-count">30 / 90</div>
        <div id="minimap"><canvas id="minimap-canvas"></canvas></div>
        <div id="kill-feed"></div>
        <div id="damage-vignette"></div>
    `;
    // Update functions
    return {
        updateHealth: (hp) => { document.getElementById('health-fill').style.width = hp + '%'; },
        updateAmmo: (current, max) => { document.getElementById('ammo-count').textContent = `${current} / ${max}`; },
        showKillFeed: (msg) => { /* add kill notification */ },
        showDamage: () => { /* flash red vignette */ }
    };
}
```

---

## 8. GAME CATEGORIES — 50+ GAME TYPES SUPPORTED

```
FPS (First Person Shooter):
  Player: FPSController + Rapier capsule collider
  Weapons: Raycaster shooting + muzzle flash + reload animation
  Enemies: Yuka FSM + NavMesh pathfinding + attack range
  Map: Procedural or hand-crafted + NavMesh

TPS (Third Person Shooter):
  Player: Camera offset behind character + AnimationMixer
  Same weapons + enemies as FPS but camera shows player

RPG (Role-Playing Game):
  Player: Top-down or isometric camera + click-to-move
  NPC: Yuka WanderBehavior + dialog triggers (proximity check)
  Inventory: JavaScript Map() for items + DOM grid UI
  Quest: Simple state machine: {quest, completed, reward}

Racing Game:
  Player vehicle: Rapier rigid body + wheel constraints
  Track: TubeGeometry following a THREE.CatmullRomCurve3
  Opponents: Following same curve at set speed + collision

Platformer:
  Player: Rapier KinematicCharacterController (no slip, step-up)
  Platforms: Static Rapier colliders
  Camera: Follow player with lerp smoothing

Survival:
  World: Procedural terrain (simplex-noise) + day/night cycle
  Resources: Raycaster interaction (click to collect)
  Hunger/Thirst: Game state timers
  Crafting: JavaScript recipe Map

Tower Defense:
  Path: THREE.CatmullRomCurve3 + tube visualization
  Towers: BoxGeometry + Raycaster targeting nearest enemy
  Waves: Timed enemy spawn system
  Economy: Currency state + UI
```

---

## 9. EXPLOSION & VFX SYSTEM

```js
function createExplosion(position, scene) {
    // Fire particles
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    
    for (let i = 0; i < count; i++) {
        positions[i*3] = position.x; positions[i*3+1] = position.y; positions[i*3+2] = position.z;
        velocities.push(new THREE.Vector3(
            (Math.random()-0.5) * 10,
            Math.random() * 15,
            (Math.random()-0.5) * 10
        ));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const fire = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff6600, size: 0.3, transparent: true }));
    scene.add(fire);
    
    // Shockwave ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
    ring.position.copy(position); scene.add(ring);
    gsap.to(ring.scale, { x: 15, y: 15, z: 15, duration: 0.5 });
    gsap.to(ring.material, { opacity: 0, duration: 0.5 }).then(() => scene.remove(ring));
    
    // Camera shake
    const origPos = camera.position.clone();
    gsap.to(camera.position, { x: origPos.x + 0.3, y: origPos.y + 0.2, duration: 0.05, yoyo: true, repeat: 10 });
    
    // Screen flash
    gsap.to(flashOverlay.material, { opacity: 1, duration: 0.05, yoyo: true, repeat: 1 });
    
    // Animate particles
    let t = 0;
    function animateExplosion() {
        if (t > 2) { scene.remove(fire); return; }
        const pos = fire.geometry.attributes.position;
        for (let i = 0; i < count; i++) {
            velocities[i].y -= 9.81 * 0.016;
            pos.setXYZ(i, pos.getX(i)+velocities[i].x*0.016, pos.getY(i)+velocities[i].y*0.016, pos.getZ(i)+velocities[i].z*0.016);
        }
        pos.needsUpdate = true;
        fire.material.opacity = 1 - t/2;
        t += 0.016;
        requestAnimationFrame(animateExplosion);
    }
    animateExplosion();
}
```

---

## 10. INVENTORY & PICKUP SYSTEM

```js
class Inventory {
    constructor() { this.items = new Map(); this.maxSlots = 10; }
    addItem(name, quantity=1) {
        this.items.set(name, (this.items.get(name) || 0) + quantity);
        updateInventoryUI(this.items);
    }
    useItem(name) {
        if (!this.items.has(name)) return false;
        const count = this.items.get(name) - 1;
        if (count <= 0) this.items.delete(name); else this.items.set(name, count);
        return true;
    }
}

// Pickup in world: Raycaster F-key interaction
document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') {
        raycaster.setFromCamera(center, camera);
        const hits = raycaster.intersectObjects(pickupObjects);
        if (hits.length > 0 && hits[0].distance < 3) {
            const obj = hits[0].object;
            inventory.addItem(obj.userData.itemType, obj.userData.quantity);
            scene.remove(obj);
        }
    }
});
```

---

## ATCLI Rules
- **CONTEXT**: Log game architecture (engine type, weapons, enemy count, map size) in ATCLI_MEMORY.md. At 180k context, the AI must know the full game state.
- **CONTEXT PROTECTION**: Game files grow very large. Use `replace` to modify specific systems (e.g., enemy speed, weapon damage). NEVER rewrite the entire game engine.
- **SECURITY**: Game should ONLY use local assets. Never auto-download executable files.

## Real Internet References (All Verified)
- **mohsenheydari/three-fps**: `github.com/mohsenheydari/three-fps` — FPS with Three.js + Ammo.js + Pathfinding.
- **WesUnwin/three-game-engine**: `github.com/WesUnwin/three-game-engine` — Three.js + Rapier + UI game engine.
- **Yuka.js**: `mugen87.github.io/yuka` — Enemy AI steering + FSM (WanderBehavior, PursuitBehavior).
- **three-pathfinding**: `github.com/donmccurdy/three-pathfinding` — NavMesh pathfinding.
- **mr-vance/ShooterGame**: `github.com/mr-vance/ShooterGame` — Pointer Lock + shooter mechanics.
- **Three.js Journey**: `threejs-journey.com` — Bruno Simon's complete Three.js mastery course.
