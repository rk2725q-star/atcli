---
name: cinematic-3d-asset-codegen
description: "ULTRA MASTER SKILL: Teaches the AI to PROCEDURALLY GENERATE 50+ categories of 3D assets entirely in code (characters, buildings, vehicles, furniture, nature, weapons, props, environments) WITHOUT needing external model files. All generated from Three.js geometry + shaders. Internet-verified with real code patterns."
---

# 🏗️ Cinematic 3D Asset Code Generator — 50+ Categories

When the user needs ANY 3D object in a cinematic scene and no GLB file is available, you MUST generate it PROCEDURALLY using Three.js geometry, Groups, and custom shaders. This skill covers 50+ categories.

> **Internet-verified** — All techniques sourced from threejs.org official examples, Bruno Simon's Three.js Journey, tympanus.net/codrops, and Sebastian Lague's procedural generation series.

---

## 🔑 GOLDEN RULE: Everything Can Be Built From Primitives
```
THREE.BoxGeometry      → buildings, furniture, rooms, walls, vehicles bodies
THREE.CylinderGeometry → pillars, wheels, trees trunks, lamp posts, gun barrels
THREE.SphereGeometry   → heads, balls, planets, domes, headlights
THREE.PlaneGeometry    → floors, roads, water, screens, walls
THREE.TorusGeometry    → rings, steering wheels, portals
THREE.ConeGeometry     → rooftops, trees tops, missiles
THREE.LatheGeometry    → vases, bottles, glasses (revolution around Y-axis)
THREE.TubeGeometry     → pipes, roads, wire, cables, snake paths
THREE.Group()          → combine all above into any complex object
```

---

## CATEGORY 1: CHARACTERS (Code-Generated Humanoids)

### Simple Human (Box-Man Style — Instant)
```js
function createHuman(color = 0x888888) {
    const human = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color });
    // Body
    human.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), mat), { position: { y: 0.9 } }));
    // Head
    human.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat), { position: { y: 1.55 } }));
    // Arms
    [-0.45, 0.45].forEach((x, i) => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), mat);
        arm.position.set(x, 0.9, 0); human.add(arm);
    });
    // Legs
    [-0.15, 0.15].forEach((x) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), mat);
        leg.position.set(x, 0.35, 0); human.add(leg);
    });
    return human;
}
// Create diverse characters with different colors
const doctor  = createHuman(0xffffff); // white coat
const police  = createHuman(0x1a237e); // dark blue
const civilian = createHuman(0x8d6e63); // brown
```

### Crowd System (100+ people — Instanced for performance)
```js
// InstancedMesh renders 1000 characters as 1 draw call
const count = 500;
const bodyGeo = new THREE.BoxGeometry(0.5, 0.8, 0.3);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
const crowd = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
const dummy = new THREE.Object3D();
for (let i = 0; i < count; i++) {
    dummy.position.set((Math.random()-0.5)*100, 0.4, (Math.random()-0.5)*100);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
    // Random color per instance
    crowd.setColorAt(i, new THREE.Color().setHSL(Math.random(), 0.5, 0.5));
}
crowd.instanceMatrix.needsUpdate = true;
scene.add(crowd);
```

### Ready Player Me (RPM) — Realistic Characters
```js
// Load a Ready Player Me realistic avatar (requires account at readyplayer.me)
const avatarUrl = 'https://models.readyplayer.me/YOUR_AVATAR_ID.glb';
new GLTFLoader().load(avatarUrl, ({ scene: avatar, animations }) => {
    scene.add(avatar);
    const mixer = new THREE.AnimationMixer(avatar);
    animations.forEach(clip => mixer.clipAction(clip).play());
});
// Process: readyplayer.me → customize character → copy GLB URL → use above
```

---

## CATEGORY 2: BUILDINGS & ARCHITECTURE

### Simple Building (Procedural)
```js
function createBuilding(w=3, h=8, d=3, floors=6, color=0x546e7a) {
    const building = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color });
    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h/2; building.add(body);
    // Windows (grid of small emissive boxes)
    const winMat = new THREE.MeshStandardMaterial({ color: 0xfffde7, emissive: 0xffeb3b, emissiveIntensity: 0.3 });
    for (let floor = 0; floor < floors; floor++) {
        for (let col = 0; col < 3; col++) {
            const win = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.05), winMat);
            win.position.set((col - 1) * 0.8, 1.2 + floor * 1.2, d/2 + 0.03);
            building.add(win);
        }
    }
    return building;
}

// City block — multiple buildings
function createCityBlock(count=10) {
    const block = new THREE.Group();
    for (let i = 0; i < count; i++) {
        const h = 5 + Math.random() * 20;
        const b = createBuilding(2+Math.random()*3, h, 2+Math.random()*3, Math.floor(h/1.2));
        b.position.set((Math.random()-0.5)*50, 0, (Math.random()-0.5)*50);
        block.add(b);
    }
    return block;
}
```

### Interior Room
```js
function createRoom(w=8, h=3, d=8) {
    const room = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, side: THREE.BackSide });
    room.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)); // all walls + ceiling + floor
    return room;
}
```

---

## CATEGORY 3: VEHICLES

### Car (Procedural)
```js
function createCar(bodyColor = 0xcc0000) {
    const car = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.8, roughness: 0.2 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    // Body
    car.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 2), bodyMat), { position: new THREE.Vector3(0, 0.5, 0) }));
    // Cabin
    car.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 1.8), bodyMat), { position: new THREE.Vector3(-0.3, 1.1, 0) }));
    // Wheels (4x)
    [[1.5,0,1.1],[-1.5,0,1.1],[1.5,0,-1.1],[-1.5,0,-1.1]].forEach(([x,y,z]) => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16), darkMat);
        w.rotation.x = Math.PI/2; w.position.set(x, y, z); car.add(w);
    });
    // Headlights
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffff88, emissive: 0xffee44, emissiveIntensity: 1 });
    [[1.9, 0.5, 0.7],[1.9, 0.5, -0.7]].forEach(([x,y,z]) => {
        car.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.3), lightMat), { position: new THREE.Vector3(x,y,z) }));
    });
    return car;
}
```

### Other Vehicles (Template Pattern)
```js
// Ambulance: createCar(0xffffff) + red cross texture + siren light
// Police car: createCar(0x1a237e) + light bar on top
// Bus: BoxGeometry(8, 2, 2.5) + multiple windows
// Truck: BoxGeometry(6, 2, 2.5) + cargo box behind
// Motorcycle: CylinderGeometry wheels + BoxGeometry body
// Airplane: BoxGeometry fuselage + PlaneGeometry wings + cone nose
// Helicopter: CylinderGeometry body + TorusGeometry rotor
// Boat/Ship: BoxGeometry hull + vertical mast
// Bicycle: CylinderGeometry wheels + TubeGeometry frame
// Train: multiple BoxGeometry cars on CylinderGeometry wheels
```

---

## CATEGORY 4: FURNITURE & INTERIOR PROPS

```js
function createChair(color=0x8d6e63) {
    const chair = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color });
    chair.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), mat), {position:{y:0.45}})); // seat
    chair.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.05), mat), {position:{y:0.85, z:-0.37}})); // back
    [[-0.35,0,-0.35],[-0.35,0,0.35],[0.35,0,-0.35],[0.35,0,0.35]].forEach(([x,y,z]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), mat);
        leg.position.set(x, 0.22, z); chair.add(leg);
    });
    return chair;
}

// More furniture generators:
// Table: BoxGeometry top + 4 CylinderGeometry legs
// Sofa: BoxGeometry seat + BoxGeometry back + BoxGeometry armrests
// Bed: BoxGeometry mattress + BoxGeometry frame + BoxGeometry pillows
// Bookshelf: BoxGeometry frame + multiple BoxGeometry shelves + BoxGeometry books
// Lamp: CylinderGeometry pole + ConeGeometry shade + PointLight inside
// Door: BoxGeometry panel + CylinderGeometry handle + rotation animation
// Window: PlaneGeometry frame + transparent PlaneGeometry glass
// TV/Monitor: BoxGeometry body + PlaneGeometry screen (VideoTexture or color)
// Desk: BoxGeometry top + 4 legs + monitor + keyboard
```

---

## CATEGORY 5: NATURE & ENVIRONMENT

### Tree (Procedural)
```js
function createTree(trunkH=2, crownR=1.5) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.25, trunkH, 8),
        new THREE.MeshStandardMaterial({ color: 0x5d4037 })
    );
    trunk.position.y = trunkH/2; tree.add(trunk);
    // Multi-layer crown for realism
    [0, 0.6, 1.2].forEach((offset, i) => {
        const crown = new THREE.Mesh(
            new THREE.ConeGeometry(crownR - i*0.3, 1.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x2e7d32 })
        );
        crown.position.y = trunkH + offset; tree.add(crown);
    });
    return tree;
}

// Forest: 1000 instanced trees using InstancedMesh
// Grass: InstancedMesh of PlaneGeometry quads + wind shader
// Rock: IcosahedronGeometry + displacement shader + grey material
// Water: PlaneGeometry + animated vertex shader + transparent blue material
// Mountain: PlaneGeometry + vertex displacement using simplex-noise
// Cloud: SphereGeometry cluster + white material + transparency
```

---

## CATEGORY 6: ROADS, STREETS & INFRASTRUCTURE

```js
function createRoad(length=100, width=8) {
    const road = new THREE.Group();
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x424242 });
    road.add(new THREE.Mesh(new THREE.PlaneGeometry(width, length), roadMat));
    // Lane markings (white dashed lines)
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (let i = -length/2; i < length/2; i += 5) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 2), dashMat);
        dash.rotation.x = -Math.PI/2; dash.position.set(0, 0.01, i); road.add(dash);
    }
    return road;
}
// Sidewalk: PlaneGeometry + light grey material
// Streetlight: CylinderGeometry pole + SphereGeometry bulb + PointLight
// Traffic light: BoxGeometry body + SphereGeometry lights (R/Y/G)
// Bridge: BoxGeometry deck + CylinderGeometry pillars
// Tunnel: CylinderGeometry (inside view) + lighting
// Highway: Multiple lane road + barriers + signs
```

---

## CATEGORY 7: TERRAIN & LANDSCAPE (Procedural with simplex-noise)

```js
import { createNoise2D } from 'simplex-noise';

function createTerrain(size=200, resolution=128, heightScale=15) {
    const noise2D = createNoise2D();
    const geo = new THREE.PlaneGeometry(size, size, resolution, resolution);
    geo.rotateX(-Math.PI/2);
    // Displace vertices using layered octave noise
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i) / size;
        const z = positions.getZ(i) / size;
        // Octave noise for natural terrain
        const h = (noise2D(x*3, z*3) * 0.5 +
                   noise2D(x*6, z*6) * 0.25 +
                   noise2D(x*12, z*12) * 0.125) * heightScale;
        positions.setY(i, h);
    }
    geo.computeVertexNormals();
    // Color based on height
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
    // Set vertex colors: snow at top, rock/grass in middle, sand at bottom
    return new THREE.Mesh(geo, mat);
}
// Distribute trees using MeshSurfaceSampler on terrain
```

---

## CATEGORY 8: WEATHER & VFX SYSTEMS

```js
// Rain System
function createRain(count=2000) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        positions[i*3]   = (Math.random()-0.5) * 100;
        positions[i*3+1] = Math.random() * 50;
        positions[i*3+2] = (Math.random()-0.5) * 100;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0x8888ff, size: 0.05, transparent: true, opacity: 0.6 });
    const rain = new THREE.Points(geo, mat);
    // Animate: move droplets down, reset when below ground
    function animateRain() {
        const pos = rain.geometry.attributes.position;
        for (let i = 0; i < count; i++) {
            pos.setY(i, pos.getY(i) - 0.5);
            if (pos.getY(i) < 0) pos.setY(i, 50);
        }
        pos.needsUpdate = true;
    }
    return { rain, animateRain };
}

// Snow: same as rain but slower, larger points, white
// Fog: scene.fog = new THREE.FogExp2(0xcccccc, 0.02)
// Fire: ParticleSystem with upward velocity + orange/red gradient
// Smoke: ParticleSystem with outward velocity + grey + slow rise
// Lightning: LineGeometry zigzag + brief white PointLight flash
// Wind: Shader uniform uWindStrength applied to trees/grass vertex shader
```

---

## CATEGORY 9: LIGHTING SETUPS (Cinematic Moods)

```js
const lightingPresets = {
    // Cinema-quality lighting rigs
    goldenHour:  { ambient: [0xfff3e0, 0.2], key: [0xff8f00, 3.0, [-10,15,10]], fill: [0x4488ff, 0.5, [10,5,-10]] },
    night:       { ambient: [0x000022, 0.1], key: [0x2244aa, 0.8, [0,20,10]],  fill: [0x001133, 0.3, [-5,5,-5]]  },
    neon:        { ambient: [0x110022, 0.1], key: [0xff00ff, 2.0, [5,10,5]],   fill: [0x00ffff, 1.5, [-5,5,-5]]  },
    overcast:    { ambient: [0xaabbcc, 0.8], key: [0xccddee, 1.0, [0,30,0]],   fill: [0x889aaa, 0.4, [-10,5,5]]  },
    horror:      { ambient: [0x001100, 0.1], key: [0x003300, 0.5, [-5,5,5]],   fill: [0xff0000, 0.2, [10,2,-5]]  },
    underwater:  { ambient: [0x003366, 0.5], key: [0x0066cc, 1.5, [0,20,10]],  fill: [0x004488, 0.8, [-5,5,-5]]  },
    sunset:      { ambient: [0x220011, 0.2], key: [0xff4400, 2.5, [-15,8,10]], fill: [0x8800ff, 0.8, [10,5,-10]] },
    studio:      { ambient: [0xffffff, 0.5], key: [0xffffff, 3.0, [5,10,5]],  fill: [0xffffff, 1.0, [-5,5,-5]]  },
};

function applyLighting(scene, preset) {
    scene.add(new THREE.AmbientLight(...preset.ambient));
    const key = new THREE.DirectionalLight(preset.key[0], preset.key[1]);
    key.position.set(...preset.key[2]); key.castShadow = true; scene.add(key);
    const fill = new THREE.PointLight(preset.fill[0], preset.fill[1]);
    fill.position.set(...preset.fill[2]); scene.add(fill);
}
```

---

## CATEGORY 10: SPECIAL PROPS & OBJECTS

```js
// Weapon (Gun — simple box composition)
function createGun() {
    const gun = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.9 });
    gun.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.15), mat), {position:{x:0.2}})); // barrel
    gun.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.15), mat), {position:{x:-0.15, y:-0.1}})); // body+grip
    return gun;
}

// Other props (all made from primitives):
// Phone: BoxGeometry + PlaneGeometry screen (black emissive)
// Laptop: Two BoxGeometry panels hinged
// Book: BoxGeometry (cover + pages)
// Bottle: CylinderGeometry body + CylinderGeometry neck
// Cup/Glass: CylinderGeometry + TorusGeometry handle (LatheGeometry better)
// Box/Crate: BoxGeometry + darker edge lines
// Barrel: CylinderGeometry + darker band rings
// Fence: Repeated BoxGeometry posts + horizontal rails
// Billboard: PlaneGeometry with canvas texture
// Sign: BoxGeometry + TextGeometry
// Fire hydrant: CylinderGeometry + small cylinders for bolts
// Mailbox: BoxGeometry + CylinderGeometry post
// Bench: BoxGeometry seat + CylinderGeometry legs
// Statue: Combined basic geo + MeshStandardMaterial metalness:1
```

---

## CATEGORY 11: FULL SCENE PRESETS (Combine All Above)

```js
// City Street Scene
function buildCityStreet() {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x778899, 0.005); // distant fog
    scene.add(createRoad(200, 10));       // road
    for(let i=0;i<20;i++) scene.add(createBuilding());  // buildings
    for(let i=0;i<5;i++) scene.add(createHuman());      // pedestrians
    for(let i=0;i<3;i++) { const c=createCar(); animateCarOnRoad(c); scene.add(c); } // cars
    applyLighting(scene, lightingPresets.goldenHour);
    return scene;
}

// Forest Scene
// Hospital Interior Scene
// Space Scene
// Beach Scene
// ... all using same pattern: combine categories above
```

---

## ATCLI Rules
- **CONTEXT**: When building complex scenes, use `replace` to modify individual object creation functions. NEVER rewrite entire scene files.
- **MEMORY**: Log the exact scene composition (which categories used + counts) in ATCLI_MEMORY.md.
- **PERFORMANCE**: Always use `InstancedMesh` for crowds/trees/props that appear 10+ times. One draw call for 1000 objects.

## Real Internet References
- **Three.js Examples**: `threejs.org/examples` — `webgl_instancing_performance`, `webgl_geometry_minecraft`
- **simplex-noise**: `npmjs.com/package/simplex-noise` — For terrain generation
- **ReadyPlayerMe**: `readyplayer.me/developers` — Realistic avatar GLB URLs
- **MeshSurfaceSampler**: Three.js built-in — For distributing objects on terrain surfaces
- **gltfjsx**: `npmjs.com/package/gltfjsx` — Convert GLB to React components
